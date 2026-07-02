import type { Quote, Client, User } from "@prisma/client";
import { computeQuote, leadTimeDays, PRICING_RULES, type PricingAnswers } from "./pricing";
import { subtotal, finalPrice, asDisclaimers } from "./quote";
import type { ProposalPdfData } from "./pdf";

/**
 * Builds the display/PDF data for a quote. Line items are recomputed
 * deterministically from the saved answers. When an admin has set an override
 * (or it's an approved custom quote), we show a single "Website build" line at
 * the override price instead of the itemized breakdown. The "prepared by"
 * contact is pulled from the rep (createdBy).
 */
export function buildProposalData(
  quote: Quote & { client?: Client | null; createdBy?: User | null },
): ProposalPdfData {
  const answers = quote.answers as unknown as PricingAnswers;
  const hasOverride = quote.overrideTotal != null;
  const snapshot = Array.isArray(quote.lineItems)
    ? (quote.lineItems as unknown as { label: string; amount: number }[])
    : null;

  let lineItems: { label: string; amount: number }[];
  if (hasOverride) {
    lineItems = [{ label: "Website build", amount: subtotal(quote) }];
  } else if (snapshot && snapshot.length) {
    // Prefer the price snapshot captured at creation time.
    lineItems = snapshot;
  } else {
    // Fallback: recompute from saved answers (older quotes without a snapshot).
    const result = computeQuote(quote.answers as unknown as PricingAnswers);
    lineItems = result.lineItems.length ? result.lineItems : [{ label: "Website build", amount: subtotal(quote) }];
  }

  // The rush fee (when present) lives in the line items as its own "Rush Fee -"
  // entry. We surface it separately so the proposal/PDF can show it as a distinct
  // charge and strike through the original estimate. An admin override collapses
  // the breakdown to a single "Website build" line, so a rush is folded into that
  // override price and no separate rush line is shown.
  const rushFee = lineItems
    .filter((li) => li.label.startsWith("Rush Fee"))
    .reduce((sum, li) => sum + li.amount, 0);

  // Turnaround precedence: an admin's manual override wins (no strike-through);
  // otherwise a rush shows the requested days with the original estimate struck
  // through; otherwise the plain price-based estimate. The struck estimate is
  // reconstructed from the charged fee so it always reconciles with the dollars.
  let leadDays: number;
  let originalLeadDays: number | null = null;
  if (quote.leadDaysOverride != null) {
    leadDays = quote.leadDaysOverride;
  } else if (rushFee > 0 && quote.rushDays != null) {
    leadDays = quote.rushDays;
    const daysOff = (rushFee / PRICING_RULES.rushFeePerIncrement) * PRICING_RULES.rushIncrementDays;
    originalLeadDays = quote.rushDays + daysOff;
  } else {
    // Lead time is an effort estimate, so it keys off the pre-discount
    // subtotal - a courtesy discount must never shorten the promised turnaround.
    leadDays = leadTimeDays(subtotal(quote) - rushFee);
  }

  return {
    proposalName: quote.proposalName,
    preparedByName: quote.createdBy?.name ?? null,
    preparedByEmail: quote.createdBy?.email ?? null,
    preparedByPhone: quote.createdBy?.phone ?? null,
    code: quote.code,
    publicCode: quote.publicCode,
    leadDays,
    originalLeadDays,
    rushFee,
    scopeSummary: quote.scopeSummary,
    lineItems,
    subtotal: subtotal(quote),
    discount: quote.discount,
    total: finalPrice(quote),
    monthly: quote.monthly,
    ecommerce: answers.ecommerce === true,
    // MLS/IDX only applies (and shows its disclaimer) with property/land listings.
    mlsIdx: answers.realEstate === true && answers.mlsIdx === true,
    disclaimers: asDisclaimers(quote.disclaimers),
  };
}
