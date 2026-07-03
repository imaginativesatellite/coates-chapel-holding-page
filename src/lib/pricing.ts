/**
 * Droptine pricing engine.
 *
 * Page count sets the base build price directly - for every site, including
 * e-commerce (storefront fees are added on top). Round UP to the nearest $250,
 * floor at $4,000 ($3,500 when Droptine provides the content). There is no
 * upper cap - a very large build simply prices out itemized. Some selections
 * route to a custom quote.
 *
 * Pricing is fully deterministic here - the Anthropic model only drafts prose.
 * This config is data-driven so it can later be edited from an admin UI.
 */

export const PRICING_RULES = {
  // Hard floor - every computed price is raised to at least this. There is
  // deliberately no upper cap (removed 2026-07): huge builds price itemized.
  min: 4000,
  // Lower floor when Droptine supplies the page structure & content.
  minContentProvided: 3500,

  // All prices are rounded UP to the nearest $250.
  roundUpTo: 250,

  // Flat managed hosting / security / maintenance.
  monthlyBase: 169,
  // Added to the monthly for e-commerce / property-listings / MLS / complex sites.
  monthlySurcharge: 50,

  // Page count → absolute base build price (non-e-commerce sites).
  // Do NOT count individual animal/pedigree pages here. "30+" → custom.
  pageBase: {
    "1-4": 4000,
    "5-9": 4500,
    "10-14": 6500,
    "15-19": 7500,
    "20-24": 8500,
    "25-29": 9500,
  } as Record<string, number>,

  // E-commerce: $1,000 flat for being a store, plus an item-count fee on top.
  // Item fee: $1,000 for the first 25 items, then +$250 per additional 25.
  ecommerceBaseFee: 1000,
  ecommerceItemTiers: {
    "1-25": 1000,
    "26-50": 1250,
    "51-75": 1500,
    "76-100": 1750,
    "101-125": 2000,
    "126-150": 2250,
    // "150+" -> custom quote
  } as Record<string, number>,
  ecommerceShopifySurcharge: 1000,

  // Animals / pedigrees: $250 for the listing page, then if each gets an
  // individual page, +$250 per group of 10.
  listingPageFee: 250,
  individualPageTiers: {
    "1-10": 500,
    "11-20": 1000,
    "21-30": 1500,
    "31-40": 2000,
    "41-50": 2500,
    "51-60": 3000,
    // "60+" -> custom quote
  } as Record<string, number>,

  // Property/land listings.
  propertyListings: 1000,
  // Team/agent logins (members-only area for a listing team).
  teamLogins: 1500,

  // Standalone content sections, each.
  contentPage: 500, // blog / news / events (asked separately)

  // Reduction when Droptine organizes & provides the page structure and content.
  contentProvidedReduction: 500,
  // Social media feed integration add-on.
  socialFeedFee: 100,
  // Animations.
  animationTiers: {
    "none": 0,
    "entrance": 150,
    "entrance-interactive": 950,
  } as Record<string, number>,
  // MLS/IDX integration: one-time build add (3rd-party IDX fees billed to client).
  mlsBuildAdd: 930,

  // Rush fee: a faster-than-estimated turnaround. $500 for every 5 business days
  // shaved off the estimated lead time (see leadTimeDays). The questionnaire
  // offers 20-60 business days in steps of 5; "no preference" charges nothing and
  // anything under the minimum routes to a custom quote instead of auto-pricing.
  rushFeePerIncrement: 500,
  rushIncrementDays: 5,
  rushMinDays: 20,

  // Estimated lead time (business days) by final build price, as strict "under
  // `below`" bands (so a price exactly on a boundary lands in the higher band).
  // The top band (`below: null`) is open-ended. leadTimeDays() reads this table,
  // and the Logic page renders it, so the two can never drift.
  leadTimeTiers: [
    { below: 7500, days: 45 },
    { below: 10000, days: 50 },
    { below: 12500, days: 55 },
    { below: 15000, days: 60 },
    { below: null, days: 65 },
  ],
} as const;

export type PricingAnswers = {
  pageTier?: keyof typeof PRICING_RULES.pageBase;
  pageCountExact?: string; // exact count, only asked when pageTier === "30+"

  ecommerce?: boolean;
  ecommerceItems?: string; // tier key, or "150+"
  // Exact count, only asked when ecommerceItems === "150+". Info-only: feeds
  // the custom-quote review and AI recommendation, never priced automatically.
  ecommerceItemsExact?: string;
  ecommerceShopify?: boolean;

  animalPages?: boolean;
  animalIndividualPages?: boolean;
  animalCount?: string; // tier key, or "60+"
  animalCountExact?: string; // exact count, only asked when animalCount === "60+" (info-only)

  pedigreePages?: boolean;
  pedigreeIndividualPages?: boolean;
  pedigreeCount?: string; // tier key, or "60+"
  pedigreeCountExact?: string; // exact count, only asked when pedigreeCount === "60+" (info-only)

  realEstate?: boolean; // Property/land listings (+$1,000)
  teamLogins?: boolean; // team/agent logins (+$1,500), only with listings

  blog?: boolean;
  news?: boolean;
  events?: boolean;

  contentProvided?: boolean; // Droptine provides page structure & content (−$500)
  socialFeed?: boolean; // social media feed integration (+$100)
  animations?: string; // "none" | "entrance" (+$150) | "entrance-interactive" (+$950)

  mlsIdx?: boolean; // MLS/IDX real-estate syncing (+$930 build, +$50/mo)
  additionalFunctionality?: string; // free-text custom request (complex → custom)

  // Requested turnaround. "no-preference" (default) → standard lead time, no fee.
  // "20".."60" (steps of 5) → rush fee if faster than the estimated lead time.
  // "under-20" → custom quote (rushDaysExact carries the exact number requested).
  rushTurnaround?: string;
  rushDaysExact?: string; // exact business days, only asked when rushTurnaround === "under-20"
};

export type PricingResult = {
  requiresCustomQuote: boolean;
  reasons: string[];
  total: number;
  monthly: number;
  lineItems: { label: string; amount: number }[];
  // The accelerated turnaround (business days) when a rush fee was applied;
  // undefined when there's no rush. Persisted on the quote so the proposal can
  // show the requested turnaround with the original estimate struck through.
  rushDays?: number;
};

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function computeQuote(answers: PricingAnswers): PricingResult {
  const R = PRICING_RULES;
  const reasons: string[] = [];

  if (answers.additionalFunctionality && answers.additionalFunctionality.trim())
    reasons.push("Custom functionality was requested.");
  if (answers.pageTier === "30+")
    reasons.push("30+ pages needs a custom quote.");
  if (answers.ecommerce && answers.ecommerceItems === "150+")
    reasons.push("Store catalog of 150+ items needs a custom quote.");
  if (answers.animalPages && answers.animalIndividualPages && answers.animalCount === "60+")
    reasons.push("60+ animals with individual pages needs a custom quote.");
  if (answers.pedigreePages && answers.pedigreeIndividualPages && answers.pedigreeCount === "60+")
    reasons.push("60+ pedigrees with individual pages needs a custom quote.");
  if (answers.rushTurnaround === "under-20")
    reasons.push(`A turnaround under ${PRICING_RULES.rushMinDays} business days needs a custom quote.`);

  const lineItems: { label: string; amount: number }[] = [];

  // Base build - by page count for every site, including e-commerce (the
  // storefront fees below are added on top of the page-count base).
  {
    const tier = answers.pageTier ?? "5-9";
    const baseAmt = R.pageBase[tier] ?? R.pageBase["5-9"];
    const pageLabel = tier === "30+" && answers.pageCountExact?.trim() ? answers.pageCountExact.trim() : tier;
    lineItems.push({ label: `Website (${pageLabel} pages)`, amount: baseAmt });
  }

  // E-commerce store
  if (answers.ecommerce) {
    lineItems.push({ label: "E-commerce store", amount: R.ecommerceBaseFee });
    const itemsTier = answers.ecommerceItems ?? "1-25";
    const ecomAmount = R.ecommerceItemTiers[itemsTier] ?? R.ecommerceItemTiers["1-25"];
    lineItems.push({ label: `Store catalog (${itemsTier} items)`, amount: ecomAmount });
    if (answers.ecommerceShopify)
      lineItems.push({ label: "Built on Shopify", amount: R.ecommerceShopifySurcharge });
  }

  // Animal pages
  if (answers.animalPages) {
    lineItems.push({ label: "Animal listing page", amount: R.listingPageFee });
    if (answers.animalIndividualPages && answers.animalCount) {
      const add = R.individualPageTiers[answers.animalCount] ?? 0;
      if (add > 0) lineItems.push({ label: `Individual animal pages (${answers.animalCount})`, amount: add });
    }
  }

  // Pedigree pages
  if (answers.pedigreePages) {
    lineItems.push({ label: "Pedigree page", amount: R.listingPageFee });
    if (answers.pedigreeIndividualPages && answers.pedigreeCount) {
      const add = R.individualPageTiers[answers.pedigreeCount] ?? 0;
      if (add > 0) lineItems.push({ label: `Individual pedigree pages (${answers.pedigreeCount})`, amount: add });
    }
  }

  if (answers.realEstate)
    lineItems.push({ label: "Property/land listings", amount: R.propertyListings });
  // Team/agent logins is a listings sub-feature, so it's only charged when
  // listings are selected (guards against a stale answer if listings is later
  // turned off in the questionnaire).
  if (answers.realEstate && answers.teamLogins)
    lineItems.push({ label: "Team/agent logins", amount: R.teamLogins });

  if (answers.blog) lineItems.push({ label: "Blog", amount: R.contentPage });
  if (answers.news) lineItems.push({ label: "News", amount: R.contentPage });
  if (answers.events) lineItems.push({ label: "Events", amount: R.contentPage });

  if (answers.socialFeed)
    lineItems.push({ label: "Social media feed integration", amount: R.socialFeedFee });

  if (answers.animations && answers.animations !== "none") {
    const animAmt = R.animationTiers[answers.animations] ?? 0;
    if (animAmt > 0)
      lineItems.push({
        label: answers.animations === "entrance-interactive" ? "Entrance & interactive animations" : "Entrance animations",
        amount: animAmt,
      });
  }

  // MLS/IDX is only offered with property/land listings, so it's only charged
  // when listings are selected (guards against a stale answer if listings are
  // later turned off in the questionnaire).
  if (answers.realEstate && answers.mlsIdx)
    lineItems.push({ label: "MLS/IDX integration", amount: R.mlsBuildAdd });

  if (answers.contentProvided)
    lineItems.push({ label: "Structure & content provided by Droptine", amount: -R.contentProvidedReduction });

  const min = answers.contentProvided ? R.minContentProvided : R.min;
  const sub = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const total = Math.max(min, roundUp(sub, R.roundUpTo));

  // Property listings already covers the MLS/IDX case (MLS/IDX requires listings).
  const surcharge = answers.ecommerce || answers.realEstate ? R.monthlySurcharge : 0;
  return { requiresCustomQuote: reasons.length > 0, reasons, total, monthly: R.monthlyBase + surcharge, lineItems };
}

/** Admin-controlled global nudge on demand (busy → raise prices, slow → lower
 *  them). Applied after computeQuote, as a line item appended to the
 *  internal-only breakdown - never shown to the member (see ProposalView /
 *  pdf.tsx, which only render subtotal/discount/total, not lineItems). */
export function applyDemandAdjustment(result: PricingResult, pct: number): PricingResult {
  if (!pct) return result;
  // A negative nudge intentionally lowers the price (slow season), so it's
  // allowed below the usual floor and only stopped at 0. A positive nudge has
  // no cap - there is no maximum price. The breakdown line records the actual
  // delta applied, so the math always reconciles.
  const target = result.total + Math.round((result.total * pct) / 100);
  const total = Math.max(0, target);
  const amount = total - result.total;
  if (amount === 0) return result;
  const label = `Demand adjustment (${pct > 0 ? "+" : ""}${pct}%)`;
  return { ...result, total, lineItems: [...result.lineItems, { label, amount }] };
}

/** Estimated lead time (business days) based on the final price. */
export function leadTimeDays(total: number): number {
  const tiers = PRICING_RULES.leadTimeTiers;
  for (const t of tiers) {
    if (t.below == null || total < t.below) return t.days;
  }
  return tiers[tiers.length - 1].days;
}

/** Rush fee for a faster-than-estimated turnaround. Applied AFTER the build
 *  price is finalized (floor + demand adjustment), so the surcharge is never
 *  scaled by the demand nudge, and the estimated lead time it's measured
 *  against is the real, final one. Charges
 *  rushFeePerIncrement per rushIncrementDays shaved off the estimate. "No
 *  preference" and "under 20" (a custom quote) add nothing here. A turnaround
 *  the same as or slower than the estimate is free (no acceleration). */
export function applyRushFee(result: PricingResult, answers: PricingAnswers): PricingResult {
  const sel = answers.rushTurnaround;
  if (!sel || sel === "no-preference" || sel === "under-20") return result;
  const requested = parseInt(sel, 10);
  if (!Number.isFinite(requested)) return result;
  const estimate = leadTimeDays(result.total);
  if (requested >= estimate) return result;
  const daysOff = estimate - requested;
  const fee =
    Math.ceil(daysOff / PRICING_RULES.rushIncrementDays) * PRICING_RULES.rushFeePerIncrement;
  return {
    ...result,
    total: result.total + fee,
    rushDays: requested,
    lineItems: [...result.lineItems, { label: `Rush Fee - ${requested} business day turnaround`, amount: fee }],
  };
}

/** Full deterministic price from saved answers: base build → demand nudge →
 *  rush fee. The single composition every server action should use so the order
 *  (and the guardrails it protects) can't drift between call sites. */
export function priceQuote(answers: PricingAnswers, demandPct = 0): PricingResult {
  return applyRushFee(applyDemandAdjustment(computeQuote(answers), demandPct), answers);
}
