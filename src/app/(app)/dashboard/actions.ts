"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canUseClientPortal } from "@/lib/portal";
import { priceQuote, type PricingAnswers } from "@/lib/pricing";
import { generateScopeSummary } from "@/lib/anthropic";
import { notifyAdmins, sendProposalToMember } from "@/lib/email";
import { appUrl } from "@/lib/quote";

export type PromoteResult = { error: string } | void;

/**
 * "Request Quote from Luna Creative" - promote a client-portal quote into a
 * normal Luna request. Re-runs the deterministic Luna price (dropping the
 * Droptine markup / increments / discount), moves it to the Luna Creative tab,
 * and notifies admins / emails the member exactly like a freshly requested
 * quote. convertedToLunaAt is stamped so the row keeps a "from client" marker.
 */
export async function requestQuoteFromLuna(
  quoteId: string,
  // When the client requested content help, the member must say whether Droptine
  // will actually supply that content to Luna - "false" drops the $500 content
  // discount the portal optimistically applied. Required in that case (enforced
  // below); ignored otherwise.
  contentProvidedByDroptine?: boolean,
): Promise<PromoteResult> {
  const user = await requireUser();

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { createdBy: true, client: true },
  });
  if (!quote) return { error: "Quote not found." };

  // Only the creator or an admin can promote, and only client-origin quotes.
  const isAdmin = user.role === "ADMIN";
  if (!isAdmin && quote.createdById !== user.id) return { error: "You can't change this quote." };
  if (!canUseClientPortal(user)) return { error: "This isn't available for your account." };
  if (quote.origin !== "CLIENT") return { error: "This quote is already a Luna Creative request." };

  const answers = quote.answers as unknown as PricingAnswers;
  // The portal applies the -$500 when the client asks for content help; at the
  // Luna hand-off the member confirms who actually provides it. "No" removes it.
  const clientWantedContent = answers.contentProvided === true;
  if (clientWantedContent && typeof contentProvidedByDroptine !== "boolean") {
    return { error: "Please answer whether Droptine will provide the content." };
  }
  const finalAnswers: PricingAnswers = clientWantedContent
    ? { ...answers, contentProvided: contentProvidedByDroptine }
    : answers;

  const settings = await prisma.pricingSettings.findUnique({ where: { id: "singleton" } });
  const result = priceQuote(finalAnswers, settings?.adjustmentPct ?? 0);

  // Re-draft the scope prose so the promoted quote reads like a normal request.
  const scopeSummary = await generateScopeSummary({ proposalName: quote.proposalName, answers: finalAnswers });

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      origin: "LUNA_REQUEST",
      convertedToLunaAt: new Date(),
      // Persist the reconciled answer so the Luna quote reflects the content decision.
      answers: finalAnswers as unknown as Prisma.InputJsonValue,
      status: result.requiresCustomQuote ? "CUSTOM_PENDING" : "PROPOSAL",
      computedTotal: result.total,
      overrideTotal: null,
      discount: 0,
      monthly: result.monthly,
      rushDays: result.rushDays ?? null,
      customReasons: result.reasons,
      lineItems: result.lineItems as unknown as Prisma.InputJsonValue,
      // It's a Luna quote now - drop the client markup snapshot.
      clientPricing: Prisma.JsonNull,
      scopeSummary,
      // A promoted quote begins a fresh proposal life - clear prior send state
      // and restart the 60-day validity window (otherwise a client quote
      // promoted late would be born expired).
      validFrom: new Date(),
      emailStatus: null,
      emailError: null,
    },
  });

  // Notifications mirror createQuote: best-effort, never block the promotion.
  const manageUrl = `${appUrl()}/quote/${quote.id}`;
  const memberEmail = quote.createdBy.email;
  try {
    if (result.requiresCustomQuote) {
      await notifyAdmins({
        proposalName: quote.proposalName, memberEmail, isCustom: true, code: quote.code,
        reasons: result.reasons, manageUrl,
      });
    } else {
      await sendProposalToMember({
        memberEmail, proposalName: quote.proposalName, total: result.total, monthly: result.monthly,
        code: quote.publicCode,
      });
      await notifyAdmins({
        proposalName: quote.proposalName, memberEmail, isCustom: false, total: result.total,
        code: quote.code, manageUrl,
      });
      await prisma.quote.update({ where: { id: quote.id }, data: { emailStatus: "SENT", emailError: null } });
    }
  } catch (e) {
    console.error("requestQuoteFromLuna: notification failed", e);
    // Best-effort: the promotion is saved; a DB blip recording the email
    // failure must not surface as a failed promotion.
    await prisma.quote
      .update({
        where: { id: quote.id },
        data: { emailStatus: "FAILED", emailError: e instanceof Error ? e.message : String(e) },
      })
      .catch((err) => console.error("requestQuoteFromLuna: couldn't record email failure", err));
  }

  revalidatePath("/dashboard");
}
