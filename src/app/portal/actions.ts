"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canUseClientPortal, readMarkup, computeClientPrice, clientPriceFromSnapshot, MAX_INCREMENTS, type ClientPricingSnapshot } from "@/lib/portal";
import { generateScopeSummary } from "@/lib/anthropic";
import { isPresentationMode } from "@/lib/presentation";
import { priceQuote, type PricingAnswers } from "@/lib/pricing";
import { generateAccessCode, generatePublicCode } from "@/lib/code";
import { notifyAdmins, sendProposalToMember, sendQuoteToClient } from "@/lib/email";
import { appUrl } from "@/lib/quote";

// `emailWarning` rides along on an otherwise-successful save: the quote WAS
// saved, but the optional "email this to the client" step couldn't complete
// (send failed, no provider configured, template off...). Kept separate from
// `error` so the save still counts as done - the caller shows the warning
// without treating the whole operation as failed.
export type SaveResult = { ok: true; emailWarning?: string } | { error: string };

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
 * Send the client-facing quote email to `toEmail` and record the attempt in the
 * QuoteEmailSend log. A row is written only for genuine attempts (SENT, or
 * FAILED on a real send error). An intentional skip - template switched off, or
 * no email provider configured - comes back as a reason but is NOT logged as a
 * failure. Never throws: emailing the client must not break the calling flow.
 */
async function emailClientAndLog(opts: {
  quoteId: string;
  userId: string;
  toEmail: string;
  clientName: string;
  businessName: string;
  build: number;
  monthly: number;
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await sendQuoteToClient({
      to: opts.toEmail,
      clientName: opts.clientName,
      businessName: opts.businessName,
      total: opts.build,
      monthly: opts.monthly,
    });
    if (!res.sent) return { ok: false, reason: res.reason };
    await prisma.quoteEmailSend
      .create({ data: { quoteId: opts.quoteId, sentById: opts.userId, toEmail: opts.toEmail, status: "SENT" } })
      .catch((e) => console.error("emailClientAndLog: couldn't log send", e));
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("emailClientAndLog: send failed", e);
    await prisma.quoteEmailSend
      .create({ data: { quoteId: opts.quoteId, sentById: opts.userId, toEmail: opts.toEmail, status: "FAILED", error: msg } })
      .catch((err) => console.error("emailClientAndLog: couldn't log failure", err));
    return { ok: false, reason: "Couldn't send the email - please try again." };
  }
}

/**
 * Email a Presentation-Mode quote's client-facing price straight to the end
 * client. Available on any such quote the caller can see - their own, or (for
 * admins) all of them - from the internal quote page or the Presentation-Mode
 * client list. `toEmailOverride` sends this ONE quote to a different address
 * without changing the client's saved contact email.
 *
 * Only Presentation-Mode quotes (origin CLIENT) can be emailed to a client: they
 * carry a marked-up `clientPricing` snapshot, so the client sees Droptine's price
 * and never Luna Creative's underlying number. Standard Luna proposals have no
 * client-facing price and are never sent this way. A custom "we'll follow up"
 * answer set has no snapshot yet and can't be sent. The send is refused when the
 * quote has no client email on file, unless an explicit address is supplied for
 * this one send.
 */
export async function sendQuoteToClientById(quoteId: string, toEmailOverride?: string): Promise<SaveResult> {
  const user = await requireUser();

  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { client: true } });
  if (!quote) return { error: "Quote not found." };

  // Only Presentation-Mode quotes have a client-facing (marked-up) price - never
  // email a standard Luna proposal (its number is Luna's wholesale) to a client.
  if (quote.origin !== "CLIENT") return { error: "Only Presentation Mode quotes can be emailed to a client." };

  // Anyone who can SEE the quote can send it: an admin or its creator (CLIENT
  // quotes are private, so those are the viewers in practice).
  const canSee = user.role === "ADMIN" || quote.createdById === user.id || quote.shared;
  if (!canSee) return { error: "You don't have access to this quote." };

  const snap = (quote.clientPricing ?? null) as ClientPricingSnapshot | null;
  if (!snap) return { error: "This is a custom quote with no set price yet - it can't be emailed." };
  const { build, monthly } = clientPriceFromSnapshot(snap, quote.monthly);

  const to = (toEmailOverride?.trim() || quote.client.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { error: "Enter a valid email address to send to." };

  const res = await emailClientAndLog({
    quoteId: quote.id,
    userId: user.id,
    toEmail: to,
    clientName: quote.client.contactName || quote.proposalName,
    businessName: quote.proposalName,
    build,
    monthly,
  });
  if (!res.ok) return { error: res.reason ?? "Couldn't send the email." };
  return { ok: true };
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
  // When true, also email the client-facing quote to the client at the captured
  // contact email. Deliberately not editable in this flow (the editable-address
  // send lives on the client-facing re-send list).
  emailClient?: boolean;
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

  // Optional: email the client-facing quote straight to the client. Only when the
  // operator ticked the box AND a real client price exists (custom "we'll follow
  // up" answer sets have none). Sends to the captured contact email - not
  // editable here. Best-effort: a send problem never fails the save, but it must
  // NOT be silently swallowed - surface it as a warning so the operator knows the
  // client wasn't actually emailed (and can re-send from the client list).
  let emailWarning: string | undefined;
  if (input.emailClient && !price.requiresFollowUp) {
    const toEmail = input.contactEmail?.trim();
    if (toEmail) {
      const res = await emailClientAndLog({
        quoteId: quote.id,
        userId: user.id,
        toEmail,
        clientName: input.contactName?.trim() || proposalName,
        businessName: proposalName,
        build: Math.max(0, price.build + adjustment),
        monthly: price.monthly,
      });
      if (!res.ok) emailWarning = res.reason ?? "the client email couldn't be sent.";
    } else {
      emailWarning = "there was no client email on file, so nothing was sent.";
    }
  }

  return { ok: true, emailWarning };
}
