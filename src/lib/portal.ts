/**
 * Client-facing Presentation Mode - shared helpers.
 *
 * Pricing stays deterministic: src/lib/pricing.ts computes Luna Creative's price
 * with no knowledge of markup. The markup here is a separate layer applied ONLY
 * to quotes generated in the client portal (origin = CLIENT), never to the Luna
 * engine itself.
 */

import { priceQuote, type PricingAnswers } from "./pricing";

/** Default markup, mirrored by the schema column defaults (see schema.prisma). */
export const DEFAULT_MARKUP = {
  website: 5000,
  websiteIsPercent: false,
  monthly: 50,
  increment: 500,
} as const;

/** Most increments the price arrows can add on the client questionnaire. */
export const MAX_INCREMENTS = 20;

export type Markup = {
  website: number;
  websiteIsPercent: boolean;
  monthly: number;
  increment: number;
};

/** A member's saved markup, falling back to the defaults for any missing field. */
export function readMarkup(u: Partial<Markup> | null | undefined): Markup {
  return {
    website: u?.website ?? DEFAULT_MARKUP.website,
    websiteIsPercent: u?.websiteIsPercent ?? DEFAULT_MARKUP.websiteIsPercent,
    monthly: u?.monthly ?? DEFAULT_MARKUP.monthly,
    increment: u?.increment ?? DEFAULT_MARKUP.increment,
  };
}

/**
 * Who can use the client portal + markup tools: every admin, plus any member
 * with the per-account flag turned on (the pilot today, everyone later). Kept
 * dependency-free so it's safe to import from client components too.
 */
export function canUseClientPortal(user: { role: string; clientPortalEnabled?: boolean }): boolean {
  return user.role === "ADMIN" || user.clientPortalEnabled === true;
}

export type ClientPrice = {
  // True when the answers route to a custom quote - no instant price; the portal
  // shows the "we'll follow up" screen instead.
  requiresFollowUp: boolean;
  reasons: string[]; // why a custom quote is needed (empty unless requiresFollowUp)
  build: number; // client-facing one-time price (Luna + markup + increments)
  monthly: number; // client-facing monthly (Luna + monthly markup)
  lunaBuild: number; // Luna Creative's base build price, before markup
  markupApplied: number; // the website markup portion ($)
  increments: number; // how many price-arrow increments were added
  incrementAmount: number; // $ per increment at quote time
};

/**
 * The price a client sees: Luna Creative's deterministic price (src/lib/pricing.ts)
 * plus the member's markup and any price-arrow increments. Pure, so the portal
 * computes it live in the browser and the Save action recomputes it on the
 * server from the same inputs. Never mutates the Luna engine.
 */
export function computeClientPrice(
  answers: PricingAnswers,
  markup: Markup,
  demandPct: number,
  increments: number,
): ClientPrice {
  const luna = priceQuote(answers, demandPct);
  const incrementAmount = markup.increment;
  if (luna.requiresCustomQuote) {
    return { requiresFollowUp: true, reasons: luna.reasons, build: 0, monthly: 0, lunaBuild: luna.total, markupApplied: 0, increments, incrementAmount };
  }
  const markupApplied = markup.websiteIsPercent
    ? Math.round((luna.total * markup.website) / 100)
    : markup.website;
  return {
    requiresFollowUp: false,
    reasons: [],
    build: luna.total + markupApplied + increments * incrementAmount,
    monthly: luna.monthly + markup.monthly,
    lunaBuild: luna.total,
    markupApplied,
    increments,
    incrementAmount,
  };
}

/** The clientPricing JSON snapshot stored on a CLIENT-origin quote. */
export type ClientPricingSnapshot = {
  lunaBase?: number;
  markup?: number;
  markupIsPercent?: boolean;
  markupApplied?: number;
  increments?: number;
  incrementAmount?: number;
  monthlyMarkup?: number;
  adjustment?: number;
  discount?: number;
};

/**
 * Recover the client-facing price (one-time build + monthly) that was shown in
 * Presentation Mode from a saved quote's `clientPricing` snapshot. Mirrors the
 * composition in saveClientQuote and the quote detail page exactly, so the
 * client email and the re-send list surface only Droptine's price and never
 * Luna Creative's underlying number. Pure - safe to import anywhere.
 */
export function clientPriceFromSnapshot(
  snap: ClientPricingSnapshot | null | undefined,
  lunaMonthly: number,
): { build: number; monthly: number } {
  const s = snap ?? {};
  const base =
    (s.lunaBase ?? 0) + (s.markupApplied ?? s.markup ?? 0) + (s.increments ?? 0) * (s.incrementAmount ?? 0);
  const adjustment = s.adjustment ?? -(s.discount ?? 0);
  return {
    build: Math.max(0, base + adjustment),
    monthly: lunaMonthly + (s.monthlyMarkup ?? 0),
  };
}
