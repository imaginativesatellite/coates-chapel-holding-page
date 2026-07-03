"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canUseClientPortal, readMarkup, computeClientPrice, MAX_INCREMENTS } from "@/lib/portal";
import { generateScopeSummary } from "@/lib/anthropic";
import { isPresentationMode } from "@/lib/presentation";
import { priceQuote, type PricingAnswers } from "@/lib/pricing";
import { generateAccessCode, generatePublicCode } from "@/lib/code";
import { notifyAdmins, sendProposalToMember } from "@/lib/email";
import { appUrl } from "@/lib/quote";

export type SaveResult = { ok: true } | { error: string };

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = generateAccessCode();
    if (!(await prisma.quote.findUnique({ where: { code: c } }))) return c;
  }
  return generateAccessCode() + Date.now().toString(36).slice(-2).toUpperCase();
}
async function uniquePublicCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = generatePublicCode();
    if (!(await prisma.quote.findUnique({ where: { publicCode: c } }))) return c;
  }
  return generatePublicCode();
}

/**
 * "Save and Close" from the client portal. Saves a full Luna Creative request
 * immediately - priced at Luna's rate exactly like a quote from the New Quote
 * form (there is no separate "Request from Luna Creative" step anymore) -
 * while `clientPricing` snapshots the client-facing composition (markup,
 * increments, operator override) that was shown on screen. `origin = CLIENT`
 * stays purely as provenance: it drives the handshake icon and the
 * Presentation-Mode reference card, but gates nothing.
 *
 * The one client answer that isn't taken at face value is content help: if the
 * client asked for it, the −$500 stands but the member must confirm who
 * actually provides the content before requesting a signature (see
 * requestSignature / sendForSignature in quote/[id]/actions.ts).
 *
 * `adjustment` is the operator's signed price override from the Form PO-1
 * modal (negative = reduction, positive = increase); `priceNote` is its
 * optional note for record, stored on Quote.priceReason for admins.
 */
export async function saveClientQuote(input: {
  answers: Record<string, unknown>;
  increments: number;
  adjustment: number;
  priceNote?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}): Promise<SaveResult> {
  const user = await requireUser();
  if (!canUseClientPortal(user)) return { error: "This isn't available for your account." };
  if (!(await isPresentationMode())) return { error: "Presentation Mode is no longer active." };

  const proposalName = String(input.answers.proposalName ?? "").trim();
  if (!proposalName) return { error: "A business name is required." };

  // Optional contact captured in the portal; only set fields that were filled
  // so re-saving without them doesn't wipe a client's existing contact.
  const contact: { contactName?: string; email?: string; phone?: string } = {};
  if (input.contactName?.trim()) contact.contactName = input.contactName.trim();
  if (input.contactEmail?.trim()) contact.email = input.contactEmail.trim();
  if (input.contactPhone?.trim()) contact.phone = input.contactPhone.trim();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { markupWebsite: true, markupWebsiteIsPercent: true, markupMonthly: true, markupIncrement: true },
  });
  const markup = readMarkup({
    website: dbUser?.markupWebsite,
    websiteIsPercent: dbUser?.markupWebsiteIsPercent,
    monthly: dbUser?.markupMonthly,
    increment: dbUser?.markupIncrement,
  });
  const settings = await prisma.pricingSettings.findUnique({ where: { id: "singleton" } });
  const demandPct = settings?.adjustmentPct ?? 0;
  const increments = Math.max(0, Math.min(MAX_INCREMENTS, Math.round(input.increments || 0)));

  // Luna's deterministic price is the quote; the client-facing layer is a
  // snapshot on top (same math the portal showed on screen).
  const answers = input.answers as PricingAnswers;
  const luna = priceQuote(answers, demandPct);
  const price = computeClientPrice(answers, markup, demandPct, increments);

  // The operator's signed override applies to the CLIENT price only - it
  // lives in the snapshot and never touches Luna's number.
  const base = price.requiresFollowUp ? 0 : price.build;
  const adjustment = price.requiresFollowUp ? 0 : Math.max(Math.round(input.adjustment || 0), -base);
  const priceNote = input.priceNote?.trim() || null;
  const scopeSummary = await generateScopeSummary({
    proposalName,
    answers,
    isCustom: luna.requiresCustomQuote,
  });

  let quote;
  try {
    let client = await prisma.client.findFirst({ where: { ownerId: user.id, name: proposalName } });
    if (!client) {
      client = await prisma.client.create({ data: { name: proposalName, ownerId: user.id, ...contact } });
    } else if (Object.keys(contact).length > 0) {
      client = await prisma.client.update({ where: { id: client.id }, data: contact });
    }

    const answersJson = JSON.parse(JSON.stringify(input.answers)) as Prisma.InputJsonValue;
    // Snapshot only when a client price was actually shown - a custom
    // ("we'll follow up") answer set never had one.
    const clientPricingJson = price.requiresFollowUp
      ? undefined
      : ({
          lunaBase: price.lunaBuild,
          markup: markup.website,
          markupIsPercent: markup.websiteIsPercent,
          markupApplied: price.markupApplied,
          increments,
          incrementAmount: price.incrementAmount,
          monthlyMarkup: markup.monthly,
          adjustment,
          discount: Math.max(0, -adjustment),
        } as unknown as Prisma.InputJsonValue);

    const data = {
      code: await uniqueCode(),
      publicCode: await uniquePublicCode(),
      clientId: client.id,
      createdById: user.id,
      proposalName,
      origin: "CLIENT" as const,
      // "Became a Luna request at" - immediately, in the consolidated flow.
      convertedToLunaAt: new Date(),
      answers: answersJson,
      clientPricing: clientPricingJson,
      status: (luna.requiresCustomQuote ? "CUSTOM_PENDING" : "PROPOSAL") as "CUSTOM_PENDING" | "PROPOSAL",
      computedTotal: luna.total,
      monthly: luna.monthly,
      rushDays: luna.rushDays ?? null,
      lineItems: luna.lineItems as unknown as Prisma.InputJsonValue,
      customReasons: luna.reasons,
      priceReason: priceNote,
      scopeSummary,
      shared: false,
    };
    try {
      quote = await prisma.quote.create({ data });
    } catch (e) {
      // Code-collision race with a simultaneous save: retry once with fresh codes.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      quote = await prisma.quote.create({
        data: { ...data, code: await uniqueCode(), publicCode: await uniquePublicCode() },
      });
    }
  } catch (e) {
    console.error("saveClientQuote failed", e);
    return { error: "Couldn't save - check your connection and try again." };
  }

  // Notifications mirror createQuote: best-effort, never fail the save.
  const manageUrl = `${appUrl()}/quote/${quote.id}`;
  const memberEmail = user.email ?? "";
  try {
    if (luna.requiresCustomQuote) {
      await notifyAdmins({
        proposalName, memberEmail, isCustom: true, code: quote.code,
        reasons: luna.reasons, manageUrl,
      });
    } else {
      await sendProposalToMember({
        memberEmail, proposalName, total: luna.total, monthly: luna.monthly,
        code: quote.publicCode,
      });
      await notifyAdmins({
        proposalName, memberEmail, isCustom: false, total: luna.total,
        code: quote.code, manageUrl,
      });
      await prisma.quote.update({ where: { id: quote.id }, data: { emailStatus: "SENT", emailError: null } });
    }
  } catch (e) {
    console.error("saveClientQuote: notification failed", e);
    await prisma.quote
      .update({
        where: { id: quote.id },
        data: { emailStatus: "FAILED", emailError: e instanceof Error ? e.message : String(e) },
      })
      .catch((err) => console.error("saveClientQuote: couldn't record email failure", err));
  }

  return { ok: true };
}
