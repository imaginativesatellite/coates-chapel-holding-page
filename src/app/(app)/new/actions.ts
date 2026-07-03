"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { priceQuote, type PricingAnswers } from "@/lib/pricing";
import { generateScopeSummary } from "@/lib/anthropic";
import { generateAccessCode, generatePublicCode } from "@/lib/code";
import { notifyAdmins, sendProposalToMember } from "@/lib/email";
import { appUrl } from "@/lib/quote";

type RawAnswers = Record<string, string | boolean | string[] | undefined>;

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = generateAccessCode();
    const existing = await prisma.quote.findUnique({ where: { code: c } });
    if (!existing) return c;
  }
  return generateAccessCode() + Date.now().toString(36).slice(-2).toUpperCase();
}

async function uniquePublicCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = generatePublicCode();
    const existing = await prisma.quote.findUnique({ where: { publicCode: c } });
    if (!existing) return c;
  }
  return generatePublicCode();
}

// The check-then-insert in uniqueCode() can race with a simultaneous save;
// the unique constraint catches it, and we retry once with fresh codes
// instead of surfacing a generic failure to the member.
function isUniqueClash(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Success returns the new quote's id so the form can navigate client-side -
// clearing the saved draft only AFTER the save is confirmed (a redirect here
// would force clearing it beforehand, losing the answers on an unexpected error).
export type CreateResult = { error: string } | { ok: true; id: string };

export async function createQuote(answers: RawAnswers, shared?: boolean): Promise<CreateResult> {
  const user = await requireUser();
  const creatorEmail = user.email ?? "";

  const proposalName = String(answers.proposalName ?? "").trim();
  if (!proposalName) return { error: "A client name is required." };

  const pricing = answers as PricingAnswers;
  const settings = await prisma.pricingSettings.findUnique({ where: { id: "singleton" } });
  const result = priceQuote(pricing, settings?.adjustmentPct ?? 0);

  // 1) Persist the quote first - it's the source of truth. If this fails we
  //    return an inline error so the user can retry without losing their answers.
  let quote;
  try {
    let client = await prisma.client.findFirst({ where: { ownerId: user.id, name: proposalName } });
    if (!client) {
      client = await prisma.client.create({ data: { name: proposalName, ownerId: user.id } });
    }

    const scopeSummary = await generateScopeSummary({ proposalName, answers: pricing, isCustom: result.requiresCustomQuote });
    const answersJson = JSON.parse(JSON.stringify(pricing)) as Prisma.InputJsonValue;
    const lineItemsJson = result.lineItems as unknown as Prisma.InputJsonValue;

    const data = {
      code: await uniqueCode(),
      publicCode: await uniquePublicCode(),
      clientId: client.id,
      createdById: user.id,
      proposalName,
      answers: answersJson,
      lineItems: lineItemsJson,
      status: (result.requiresCustomQuote ? "CUSTOM_PENDING" : "PROPOSAL") as "CUSTOM_PENDING" | "PROPOSAL",
      computedTotal: result.total,
      monthly: result.monthly,
      rushDays: result.rushDays ?? null,
      customReasons: result.reasons,
      scopeSummary,
      shared: shared === true,
    };
    try {
      quote = await prisma.quote.create({ data });
    } catch (e) {
      if (!isUniqueClash(e)) throw e;
      quote = await prisma.quote.create({
        data: { ...data, code: await uniqueCode(), publicCode: await uniquePublicCode() },
      });
    }
  } catch (e) {
    console.error("createQuote: failed to save", e);
    return { error: "Couldn't save the quote - check your connection and try again." };
  }

  // 2) PDF + email are best-effort: a failure here never loses the saved quote.
  const manageUrl = `${appUrl()}/quote/${quote.id}`;
  try {
    if (result.requiresCustomQuote) {
      await notifyAdmins({
        proposalName, memberEmail: creatorEmail, isCustom: true, code: quote.code,
        reasons: result.reasons, manageUrl,
      });
    } else {
      await sendProposalToMember({
        memberEmail: creatorEmail, proposalName, total: result.total, monthly: result.monthly,
        code: quote.publicCode,
      });
      await notifyAdmins({
        proposalName, memberEmail: creatorEmail, isCustom: false, total: result.total,
        code: quote.code, manageUrl,
      });
      await prisma.quote.update({ where: { id: quote.id }, data: { emailStatus: "SENT", emailError: null } });
    }
  } catch (e) {
    console.error("createQuote: notification failed", e);
    // Never throw from here - the quote is saved; recording the email failure
    // is best-effort too (a DB blip must not turn a saved quote into an error).
    await prisma.quote
      .update({
        where: { id: quote.id },
        data: { emailStatus: "FAILED", emailError: e instanceof Error ? e.message : String(e) },
      })
      .catch((err) => console.error("createQuote: couldn't record email failure", err));
  }

  return { ok: true, id: quote.id };
}
