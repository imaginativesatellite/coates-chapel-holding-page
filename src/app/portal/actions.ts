"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canUseClientPortal, readMarkup, computeClientPrice, MAX_INCREMENTS } from "@/lib/portal";
import { isPresentationMode } from "@/lib/presentation";
import { generateAccessCode, generatePublicCode } from "@/lib/code";
import { notifyAdmins } from "@/lib/email";
import { appUrl } from "@/lib/quote";
import type { PricingAnswers } from "@/lib/pricing";

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
 * "Save and Close" from the client portal. Persists a CLIENT-origin quote -
 * priced server-side from the same inputs the browser showed (never trusting a
 * client-sent total) - then the portal resets for the next client. No PDF/email:
 * these are instant, in-person quotes. A custom-quote answer set is saved as
 * CUSTOM_PENDING so it can later be "Requested from Luna Creative".
 *
 * `adjustment` is the operator's signed price override from the Form PO-1
 * modal (negative = reduction, positive = increase); `priceNote` is its
 * optional justification, stored on Quote.priceReason for admins.
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
  const increments = Math.max(0, Math.min(MAX_INCREMENTS, Math.round(input.increments || 0)));
  const price = computeClientPrice(input.answers as PricingAnswers, markup, settings?.adjustmentPct ?? 0, increments);

  const base = price.requiresFollowUp ? 0 : price.build;
  // The operator's signed override, floored so the final price never goes
  // below $0. An increase folds into computedTotal; a reduction is stored in
  // the discount column (same math the on-screen price used).
  const adjustment = price.requiresFollowUp ? 0 : Math.max(Math.round(input.adjustment || 0), -base);
  const increase = Math.max(0, adjustment);
  const build = base + increase;
  const discount = Math.max(0, -adjustment);
  const monthly = price.requiresFollowUp ? 0 : price.monthly;
  const priceNote = input.priceNote?.trim() || null;

  try {
    let client = await prisma.client.findFirst({ where: { ownerId: user.id, name: proposalName } });
    if (!client) {
      client = await prisma.client.create({ data: { name: proposalName, ownerId: user.id, ...contact } });
    } else if (Object.keys(contact).length > 0) {
      client = await prisma.client.update({ where: { id: client.id }, data: contact });
    }

    const answersJson = JSON.parse(JSON.stringify(input.answers)) as Prisma.InputJsonValue;
    const clientPricingJson = {
      lunaBase: price.lunaBuild,
      markup: markup.website,
      markupIsPercent: markup.websiteIsPercent,
      markupApplied: price.markupApplied,
      increments,
      incrementAmount: price.incrementAmount,
      monthlyMarkup: markup.monthly,
      adjustment,
      discount,
    } as unknown as Prisma.InputJsonValue;

    const data = {
      code: await uniqueCode(),
      publicCode: await uniquePublicCode(),
      clientId: client.id,
      createdById: user.id,
      proposalName,
      origin: "CLIENT" as const,
      answers: answersJson,
      clientPricing: clientPricingJson,
      status: (price.requiresFollowUp ? "CUSTOM_PENDING" : "PROPOSAL") as "CUSTOM_PENDING" | "PROPOSAL",
      computedTotal: build,
      discount,
      monthly,
      priceReason: priceNote,
      customReasons: price.requiresFollowUp ? price.reasons : [],
      shared: false,
    };
    let quote;
    try {
      quote = await prisma.quote.create({ data });
    } catch (e) {
      // Code-collision race with a simultaneous save: retry once with fresh codes.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      quote = await prisma.quote.create({
        data: { ...data, code: await uniqueCode(), publicCode: await uniquePublicCode() },
      });
    }

    // A custom client request can't be priced on the spot - ping admins right
    // away so Luna can turn it around fast (the captured contact is on the
    // quote/client). Best-effort: a notify failure never fails the save.
    if (price.requiresFollowUp) {
      try {
        await notifyAdmins({
          proposalName,
          memberEmail: user.email ?? "",
          isCustom: true,
          code: quote.code,
          reasons: price.reasons,
          manageUrl: `${appUrl()}/quote/${quote.id}`,
        });
      } catch (e) {
        console.error("saveClientQuote: admin notify failed", e);
      }
    }
  } catch (e) {
    console.error("saveClientQuote failed", e);
    return { error: "Couldn't save - check your connection and try again." };
  }

  return { ok: true };
}
