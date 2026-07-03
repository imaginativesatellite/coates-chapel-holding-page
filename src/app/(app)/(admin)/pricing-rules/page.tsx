import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PRICING_RULES as R } from "@/lib/pricing";
import { DEFAULT_MARKUP, MAX_INCREMENTS } from "@/lib/portal";
import {
  ECOMMERCE_MONTHLY_DISCLAIMER,
  IDX_MONTHLY_DISCLAIMER,
} from "@/lib/proposal-copy";
import DemandAdjustmentForm from "./DemandAdjustmentForm";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <table className="simple">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <td>{k}</td>
            <td className="amt">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}

// Each top-level section (Pricing, Turnaround, Proposal content, Adjustments)
// carries equal weight.
const sectionTitle = { fontSize: "1.2rem", color: "var(--charcoal)", margin: "8px 0 14px" } as const;
const laterSection = { ...sectionTitle, marginTop: 36 } as const;

export default async function LogicPage() {
  await requireAdmin();

  const settings = await prisma.pricingSettings.findUnique({ where: { id: "singleton" } });

  const pageRows: [string, string][] = Object.entries(R.pageBase).map(([k, v]) => [`${k} pages`, money(v)]);
  pageRows.push(["30+ pages", "Custom quote"]);

  const ecomRows: [string, string][] = [["Being an e-commerce store", money(R.ecommerceBaseFee)]];
  Object.entries(R.ecommerceItemTiers).forEach(([k, v]) => ecomRows.push([`${k} items`, `+ ${money(v)}`]));
  ecomRows.push(["150+ items", "Custom quote"]);
  ecomRows.push(["Built on Shopify", `+ ${money(R.ecommerceShopifySurcharge)}`]);

  const animalRows: [string, string][] = [["Listing page (animals or pedigree)", money(R.listingPageFee)]];
  Object.entries(R.individualPageTiers).forEach(([k, v]) => animalRows.push([`Individual pages, ${k}`, `+ ${money(v)}`]));
  animalRows.push(["60+ animals/pedigrees", "Custom quote"]);

  // Estimated lead-time bands, rendered straight from the pricing table.
  const leadRows: [string, string][] = R.leadTimeTiers.map((t, i) => {
    const prev = i === 0 ? null : R.leadTimeTiers[i - 1].below;
    let label: string;
    if (prev == null) label = `Under ${money(t.below as number)}`;
    else if (t.below == null) label = `${money(prev)} and over`;
    else label = `${money(prev)} – ${money(t.below - 1)}`;
    return [label, `${t.days} business days`];
  });

  return (
    <div>
      <h1>Logic</h1>
      <p className="lede">How the calculator prices a build, the turnaround it estimates, the proposal copy it generates, and the demand adjustment.</p>

      <h2 style={sectionTitle}>Pricing</h2>

      <Card title="Base build (by page count)">
        <p className="help" style={{ marginBottom: 10 }}>
          Page count sets the base price for every site, including e-commerce. Rounded up to the
          nearest {money(R.roundUpTo)}; floor {money(R.min)} ({money(R.minContentProvided)} when
          Droptine provides the content). There is no upper cap - large builds price out itemized.
        </p>
        <Rows rows={pageRows} />
      </Card>

      <Card title="E-commerce">
        <p className="help" style={{ marginBottom: 10 }}>Storefront costs, added on top of the page-count base above.</p>
        <Rows rows={ecomRows} />
      </Card>

      <Card title="Animals & pedigrees">
        <Rows rows={animalRows} />
      </Card>

      <Card title="Other add-ons">
        <Rows
          rows={[
            ["Property/land listings", `+ ${money(R.propertyListings)}`],
            ["Team/agent logins (requires property listings)", `+ ${money(R.teamLogins)}`],
            ["Social media feed integration", `+ ${money(R.socialFeedFee)}`],
            ["Blog", `+ ${money(R.contentPage)}`],
            ["News", `+ ${money(R.contentPage)}`],
            ["Events", `+ ${money(R.contentPage)}`],
            ["Entrance animations", `+ ${money(R.animationTiers["entrance"])}`],
            ["Entrance & interactive animations", `+ ${money(R.animationTiers["entrance-interactive"])}`],
            ["MLS/IDX syncing (one-time build; requires property listings)", `+ ${money(R.mlsBuildAdd)}`],
            ["Structure & content provided by Droptine", `− ${money(R.contentProvidedReduction)} (floor ${money(R.minContentProvided)})`],
          ]}
        />
      </Card>

      <Card title="Monthly hosting, security & maintenance">
        <Rows
          rows={[
            ["Standard", `${money(R.monthlyBase)}/mo`],
            ["E-commerce / property listings / MLS / complex", `${money(R.monthlyBase + R.monthlySurcharge)}/mo`],
          ]}
        />
      </Card>

      <Card title="Routes to a custom quote">
        <ul style={{ marginLeft: 18, fontSize: "0.92rem" }}>
          <li>30+ pages</li>
          <li>150+ store items</li>
          <li>60+ animals or pedigrees with individual pages</li>
          <li>A requested turnaround under {R.rushMinDays} business days</li>
          <li>Any free-text in &ldquo;other / complex functionality&rdquo;</li>
        </ul>
        <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>
          Picking a 30+/150+/60+ tier (or an under-{R.rushMinDays} turnaround) reveals a follow-up
          asking for the exact number. It&apos;s captured for the custom-quote review and the AI
          recommendation only - it never prices automatically.
        </p>
      </Card>

      <h2 style={laterSection}>Turnaround</h2>

      <Card title="Estimated lead time (by build price)">
        <p className="help" style={{ marginBottom: 10 }}>
          Every proposal shows an estimated lead time, stepped by the final build price.
        </p>
        <Rows rows={leadRows} />
      </Card>

      <Card title="Rush fee (faster turnaround)">
        <p className="help" style={{ marginBottom: 10 }}>
          On the New Quote form, &ldquo;Turnaround Time&rdquo; lets a member request a delivery
          window. {money(R.rushFeePerIncrement)} is added for every {R.rushIncrementDays} business
          days shaved off the estimated lead time above. A request the same as or slower than the
          estimate adds nothing.
        </p>
        <Rows
          rows={[
            [`Every ${R.rushIncrementDays} business days faster than the estimate`, `+ ${money(R.rushFeePerIncrement)}`],
            ["No preference (default)", "Standard turnaround, no fee"],
            [`Less than ${R.rushMinDays} business days`, "Custom quote"],
          ]}
        />
      </Card>

      <h2 style={laterSection}>Proposal content</h2>

      <Card title="Scope summary paragraph">
        <p className="help" style={{ marginBottom: 10 }}>
          The plain-English &ldquo;what we&rsquo;ll build&rdquo; paragraph on every proposal. It&rsquo;s
          always built from the answers - never from the price, and the price is never built from it.
        </p>
        <p style={{ fontSize: "0.92rem", marginBottom: 6 }}>
          <strong>Scope phrases, included only when their trigger is met:</strong>
        </p>
        <ul style={{ marginLeft: 18, fontSize: "0.92rem", marginBottom: 14 }}>
          <li>Not e-commerce → &ldquo;a [page tier]-page website&rdquo; (uses the exact page count typed in instead of the literal &ldquo;30+&rdquo; when that follow-up was answered)</li>
          <li>E-commerce → &ldquo;an online store[ on Shopify] ([item count] items)&rdquo;</li>
          <li>Animals page → individual animal pages (with count) if each animal gets its own page, otherwise a single animal listing page</li>
          <li>Pedigree page → individual pedigree pages (with count) if each gets its own page, otherwise a single pedigree page</li>
          <li>Property/land listings → &ldquo;property/land listings&rdquo;; team/agent logins → &ldquo;team/agent logins&rdquo; (only if selected)</li>
          <li>Blog, news, events → one phrase each, only if selected</li>
          <li>Social media feed integration → one phrase, only if selected</li>
          <li>Animations → &ldquo;entrance animations&rdquo; or &ldquo;entrance &amp; interactive animations&rdquo;, only if selected</li>
          <li>MLS/IDX syncing → &ldquo;live MLS/IDX real-estate syncing&rdquo;</li>
          <li>Structure &amp; content provided by Droptine → one phrase, only if selected</li>
          <li>Custom functionality → &ldquo;custom functionality: their answer&rdquo;, only if answered</li>
        </ul>
        <p className="help" style={{ marginBottom: 10 }}>
          The existing-website question and its URL are context only - they describe a site being
          replaced, not something being built - so they&rsquo;re never part of this paragraph.
        </p>
        <p style={{ fontSize: "0.92rem", marginBottom: 6 }}>
          <strong>Two ways that list becomes a paragraph:</strong>
        </p>
        <div style={{ fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <strong>Default template (no AI, no cost):</strong> one fixed sentence introducing Luna
            Creative and the standard feature set, plus a &ldquo;This includes &hellip;&rdquo; sentence
            listing the scope phrases above, comma-separated.
            <div className="help" style={{ marginTop: 2 }}>Used whenever AI scope-writing is off.</div>
          </div>
          <div>
            <strong>AI-drafted:</strong> Claude is given the same scope list plus the client name and
            industry, and writes 2&ndash;3 short paragraphs. It&rsquo;s explicitly instructed to never
            mention prices, hours, or dollar amounts. If the call fails or returns nothing, the default
            template above is used instead.
            <div className="help" style={{ marginTop: 2 }}>Trigger: ENABLE_AI=true and an Anthropic API key are both set.</div>
          </div>
        </div>
      </Card>

      <Card title="Conditional disclaimers (only shown when triggered)">
        <p className="help" style={{ marginBottom: 12 }}>
          Standard features, lead time, the validity notice, and the general terms appear on every
          proposal. The ones below only appear when their trigger is met:
        </p>
        <div style={{ fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <strong>E-commerce (monthly):</strong> {ECOMMERCE_MONTHLY_DISCLAIMER}
            <div className="help" style={{ marginTop: 2, fontStyle: "italic" }}>Trigger: the site includes e-commerce.</div>
          </div>
          <div>
            <strong>MLS/IDX (monthly):</strong> {IDX_MONTHLY_DISCLAIMER}
            <div className="help" style={{ marginTop: 2, fontStyle: "italic" }}>Trigger: MLS/IDX syncing is selected.</div>
          </div>
          <div>
            <strong>Custom disclaimers:</strong> Up to three single-line notes an admin can add when
            approving or editing a quote, each placed on either the website-price or monthly section.
            <div className="help" style={{ marginTop: 2, fontStyle: "italic" }}>Trigger: an admin adds one or more to the quote.</div>
          </div>
        </div>
      </Card>

      <h2 style={laterSection}>Client portal (Presentation Mode)</h2>

      <Card title="Markup on the client-facing price">
        <p className="help" style={{ marginBottom: 10 }}>
          In Presentation Mode the price a client sees is everything above (Luna Creative&rsquo;s
          deterministic build price) plus the operating member&rsquo;s markup, set per member on the
          Markup page. The markup never changes the Luna price &mdash; it&rsquo;s a layer added on top,
          only for client quotes. The values below are the defaults; each member can change their own.
        </p>
        <Rows
          rows={[
            ["Website markup (added to the build price)", `+ ${money(DEFAULT_MARKUP.website)} (flat $ or %)`],
            ["Monthly markup (added to the monthly)", `+ ${money(DEFAULT_MARKUP.monthly)}/mo`],
            [`Price-arrow increment (each tap, up to ${MAX_INCREMENTS}×)`, `+ ${money(DEFAULT_MARKUP.increment)}`],
          ]}
        />
      </Card>

      <Card title="On-screen adjustments (client result screen)">
        <ul style={{ marginLeft: 18, fontSize: "0.92rem" }}>
          <li>The faint up/down rail adds or removes increments (up to {MAX_INCREMENTS}); it never lowers the price below the base build.</li>
          <li>A discreet discount (dollar amount only) can be applied; the original price is struck through and &ldquo;You save $X&rdquo; is shown. It never goes below $0.</li>
          <li>Custom-quote answers (same triggers as above) show a &ldquo;we&rsquo;ll follow up&rdquo; message instead of a price; saving one stores a pending client quote that can later be &ldquo;Requested from Luna Creative.&rdquo;</li>
        </ul>
      </Card>

      <h2 style={laterSection}>Adjustments</h2>

      <Card title="Demand adjustment">
        <DemandAdjustmentForm initialPct={settings?.adjustmentPct ?? 0} />
      </Card>
    </div>
  );
}
