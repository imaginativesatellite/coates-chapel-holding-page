import Anthropic from "@anthropic-ai/sdk";
import { computeQuote, type PricingAnswers } from "./pricing";

/** Plain-English list of what's included, derived from the answers. */
export function describeScope(answers: PricingAnswers): string[] {
  const items: string[] = [];
  // Page count applies to every site, e-commerce included (the store stacks on top).
  const pages =
    answers.pageTier === "30+" && answers.pageCountExact?.trim()
      ? answers.pageCountExact.trim()
      : answers.pageTier ?? "5-9";
  items.push(`a ${pages}-page website`);
  // Prefer the exact count captured for a custom-quote tier over the tier label.
  const count = (tier: string | undefined, exact: string | undefined) =>
    tier?.endsWith("+") && exact?.trim() ? `~${exact.trim()}` : tier ?? "";
  if (answers.ecommerce)
    items.push(
      `an online store${answers.ecommerceShopify ? " on Shopify" : ""}` +
        (answers.ecommerceItems ? ` (${count(answers.ecommerceItems, answers.ecommerceItemsExact)} items)` : ""),
    );
  if (answers.animalPages)
    items.push(
      answers.animalIndividualPages
        ? `individual animal pages (${count(answers.animalCount, answers.animalCountExact)})`
        : "an animal listing page",
    );
  if (answers.pedigreePages)
    items.push(
      answers.pedigreeIndividualPages
        ? `individual pedigree pages (${count(answers.pedigreeCount, answers.pedigreeCountExact)})`
        : "a pedigree page",
    );
  if (answers.realEstate) items.push("property/land listings");
  if (answers.realEstate && answers.teamLogins) items.push("team/agent logins");
  if (answers.blog) items.push("a blog");
  if (answers.news) items.push("a news section");
  if (answers.events) items.push("an events page");
  if (answers.socialFeed) items.push("social media feed integration");
  if (answers.animations === "entrance") items.push("entrance animations");
  if (answers.animations === "entrance-interactive") items.push("entrance & interactive animations");
  if (answers.realEstate && answers.mlsIdx) items.push("live MLS/IDX real-estate syncing");
  if (answers.contentProvided) items.push("page structure & content organized and provided by Droptine");
  if (answers.additionalFunctionality?.trim()) items.push(`custom functionality: ${answers.additionalFunctionality.trim()}`);
  return items;
}

/**
 * Drafts the human-readable scope summary for a proposal.
 *
 * The Anthropic model writes prose ONLY. It is never given authority over the
 * price - the total is computed deterministically in src/lib/pricing.ts.
 */
export async function generateScopeSummary(input: {
  proposalName: string;
  industry?: string;
  answers: PricingAnswers;
}): Promise<string> {
  // AI is opt-in: it only runs when ENABLE_AI=true AND a key is present.
  // Otherwise we use the deterministic template (no API call, no cost).
  const aiEnabled = process.env.ENABLE_AI === "true";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!aiEnabled || !apiKey) {
    return defaultSummary(input);
  }

  // Short timeout + a single retry: this runs inside the "Generate Proposal"
  // server action, and the SDK's default 10-minute timeout would let a slow
  // API call hang the save. On any failure we fall back to the template below.
  const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
  const scope = describeScope(input.answers).join("; ") || "a standard website";

  // AI is prose-only and must never break quote creation: any failure here
  // (rate limit, timeout, network) falls back to the deterministic template.
  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 500,
      system:
        "You write concise, professional website-proposal scope summaries for Luna Creative, " +
        "a web design studio building Webflow sites for the ranch, hunting, and breeder community. " +
        "Write 2-3 short paragraphs. Do NOT mention or invent any prices, hours, or dollar amounts. " +
        "Be confident and benefit-focused, not salesy.",
      messages: [
        {
          role: "user",
          content:
            `Project: ${input.proposalName}\n` +
            `Industry: ${input.industry ?? "n/a"}\n` +
            `Scope includes: ${scope}\n\n` +
            "Write the scope summary describing what we'll build.",
        },
      ],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return text || defaultSummary(input);
  } catch (e) {
    console.error("generateScopeSummary: AI call failed, using template", e);
    return defaultSummary(input);
  }
}

function defaultSummary(input: { proposalName: string; answers: PricingAnswers }): string {
  const scope = describeScope(input.answers);
  const scopeLine = scope.length ? ` This includes ${scope.join(", ")}.` : "";
  return (
    `Luna Creative will design and develop a custom Webflow website for ${input.proposalName}, ` +
    `tailored to your goals with a clean, mobile-first design and the standard feature set ` +
    `(mobile optimization, interactive location map, basic SEO, fillable contact form, and photo/video gallery).` +
    scopeLine
  );
}

// Re-export so callers can compute alongside prose if needed.
export { computeQuote };

export type CustomRecommendation = {
  price?: number; // recommended one-time build price (whole USD)
  leadDays?: number; // recommended turnaround (business days)
  monthly?: number; // recommended monthly hosting & maintenance (whole USD)
  reasoning: string;
  scope: string;
};

/**
 * Admin tool: recommend a one-time price, turnaround, monthly cost, reasoning,
 * and a proposed scope for a custom quote - considering the standard breakdown
 * plus the complex functionality requested. Each value is returned separately so
 * the UI can copy it into the matching field. The model may keep the standard
 * price/turnaround/monthly unchanged. Gated behind ENABLE_AI_PRICING.
 */
export async function recommendCustomPrice(input: {
  proposalName: string;
  lineItems: { label: string; amount: number }[];
  customReasons: string[];
  additionalFunctionality?: string;
  pageCountExact?: string;
  answers?: PricingAnswers;
  standardTotal: number;
  standardMonthly: number;
  standardLeadDays: number;
}): Promise<CustomRecommendation | { error: string }> {
  const aiEnabled = process.env.ENABLE_AI_PRICING === "true";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!aiEnabled || !apiKey) {
    return { error: "AI price recommendations are off. Set ENABLE_AI_PRICING=true in the environment to use this." };
  }

  // An admin is waiting on this click, but a hung call is worse than a retry -
  // keep the SDK's 10-minute default well out of the picture.
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

  const itemized = input.lineItems.map((li) => `- ${li.label}: $${li.amount}`).join("\n") || "(none priced)";
  // The deterministic "standard" scope prose. We hand this to the model and ask
  // it to keep this language intact, only layering technical detail for the
  // complex functionality on top - so the proposed scope doesn't drift.
  const standardScope = input.answers
    ? defaultSummary({ proposalName: input.proposalName, answers: input.answers })
    : "";

  const msg = await client.messages.create({
    model,
    max_tokens: 900,
    system:
      "You price custom Webflow website builds for Luna Creative (ranch / hunting / breeder clients). " +
      "The standard calculator starts at $4,000 and has no upper cap - price what the build genuinely warrants. " +
      "You are given the STANDARD deterministic price, turnaround (business days), and monthly hosting cost. " +
      "Recommend a one-time build PRICE, a TURNAROUND in business days, and a MONTHLY cost. You may keep any of " +
      "the standard values unchanged if the complex functionality doesn't warrant a change - only move a value " +
      "when the extra build effort, risk, or ongoing maintenance justifies it. " +
      "Reply in EXACTLY this format, each on its own line, then the SCOPE block last:\n" +
      "PRICE: <whole dollars, digits only>\n" +
      "TURNAROUND: <business days, digits only>\n" +
      "MONTHLY: <whole dollars, digits only>\n" +
      "REASONING: <2–4 sentences justifying any changes from the standard values>\n" +
      "SCOPE:\n<client-facing scope summary>\n" +
      "For SCOPE, begin from the STANDARD SCOPE provided and keep that standard language intact - do NOT rewrite " +
      "or restyle it unless strictly necessary. Then add the requested complex/custom functionality, described " +
      "in precise technical terms (name the actual mechanisms - e.g. authenticated member portal, headless " +
      "CMS collections, Stripe checkout, third-party API integration, booking/reservation engine). " +
      "Never mention prices, hours, or dollar amounts inside the SCOPE section.",
    messages: [
      {
        role: "user",
        content:
          `Project: ${input.proposalName}\n` +
          `Standard line items:\n${itemized}\n\n` +
          `STANDARD price: $${input.standardTotal}\n` +
          `STANDARD turnaround: ${input.standardLeadDays} business days\n` +
          `STANDARD monthly: $${input.standardMonthly}\n\n` +
          `Why it's custom: ${input.customReasons.join("; ") || "n/a"}\n` +
          (input.pageCountExact ? `Page count requested: ${input.pageCountExact}\n` : "") +
          (input.additionalFunctionality ? `Complex / additional functionality requested:\n${input.additionalFunctionality}\n` : "") +
          (standardScope ? `\nSTANDARD SCOPE (keep this language intact):\n${standardScope}\n` : "") +
          `\nRecommend PRICE, TURNAROUND, MONTHLY, REASONING, then SCOPE.`,
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Pull out the labelled single-line values.
  const grab = (label: string): string => {
    const m = text.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  };
  const toNum = (s: string): number | undefined => {
    const m = s.match(/[\d,]+/);
    if (!m) return undefined;
    const n = parseInt(m[0].replace(/,/g, ""), 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const price = toNum(grab("PRICE"));
  const leadDays = toNum(grab("TURNAROUND"));
  const monthly = toNum(grab("MONTHLY"));

  // REASONING runs from its label up to the SCOPE block; SCOPE is everything after.
  const scopeIdx = text.search(/^\s*SCOPE:/im);
  const reasoningIdx = text.search(/^\s*REASONING:/im);
  let reasoning = "";
  if (reasoningIdx !== -1) {
    const end = scopeIdx !== -1 ? scopeIdx : text.length;
    reasoning = text.slice(reasoningIdx, end).replace(/^\s*REASONING:\s*/i, "").trim();
  }
  const scope = scopeIdx !== -1 ? text.slice(scopeIdx).replace(/^\s*SCOPE:\s*/i, "").trim() : "";

  // Fallback: if the model ignored the format entirely, surface the raw text.
  if (!reasoning && price === undefined && !scope) {
    return { reasoning: text || "No recommendation returned.", scope: "" };
  }
  return { price, leadDays, monthly, reasoning: reasoning || "No recommendation returned.", scope };
}
