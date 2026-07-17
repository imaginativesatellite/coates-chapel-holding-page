import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { buildProposalData } from "@/lib/proposal-data";
import { money, finalPrice, subtotal, isExpired, asDisclaimers, fmtDateTime } from "@/lib/quote";
import { leadTimeDays, priceQuote, type PricingAnswers } from "@/lib/pricing";
import ProposalView from "@/components/ProposalView";
import CopyButton from "@/components/CopyButton";
import TransientActionButton from "@/components/TransientActionButton";
import { updateQuote, approveQuote, resendProposalEmail, reactivateQuote, confirmCompanySignature, syncSignatureStatus } from "./actions";
import { RequestSignatureButton, SendForSignatureForm } from "./SignatureActions";
import { documensoEnabled, documensoSignUrl } from "@/lib/documenso";
import DeleteQuoteButton from "./DeleteQuoteButton";
import SendToClientCard from "./SendToClientCard";
import VisibilityToggle from "./VisibilityToggle";
import AiRecommendation from "./AiRecommendation";
import DisclaimersField from "./DisclaimersField";

// Status pills mirror the dashboard scheme: all quotes are proposals, so there's
// no "Proposal"/"Approved" tag - a ready quote shows no status pill. We surface
// only meaningful states: awaiting approval and where it is in the signature flow.
const statusPills = (q: {
  status: string;
  signatureStatus: string | null;
  clientSignedAt: Date | null;
  companySignedAt: Date | null;
}) => {
  const signed = Boolean(q.clientSignedAt && q.companySignedAt);
  const awaitingCountersign = Boolean(q.clientSignedAt && !q.companySignedAt);
  const sentForSignature = Boolean(
    q.signatureStatus && !q.clientSignedAt && !q.companySignedAt && q.signatureStatus !== "DECLINED",
  );
  return (
    <>
      {q.status === "CUSTOM_PENDING" && <span className="pill gold">Pending approval</span>}
      {signed && <span className="pill signed">Signed</span>}
      {!signed && awaitingCountersign && <span className="pill awaiting">Awaiting signature</span>}
      {!signed && !awaitingCountersign && sentForSignature && (
        <span className="pill awaiting">Sent for signature</span>
      )}
    </>
  );
};

const signatureStatusLabel: Record<string, string> = {
  SENT: "Sent - awaiting signatures",
  PARTIALLY_SIGNED: "Partially signed",
  SIGNED: "Fully signed",
  DECLINED: "Declined",
};

type SignatureState = {
  signatureStatus: string | null;
  signatureSentAt: Date | null;
  clientSignedAt: Date | null;
  companySignedAt: Date | null;
  companySignedById: string | null;
  companySignedByName: string | null;
};

/** Member view: one sentence for wherever things stand right now - no "sent"
 *  wording once that's no longer the current stage (e.g. fully signed). */
function signatureStage(q: SignatureState): string | null {
  if (!q.signatureStatus) return null;
  if (q.signatureStatus === "DECLINED") return "Signing was declined.";
  if (q.clientSignedAt && q.companySignedAt) return `Fully signed on ${fmtDateTime(q.companySignedAt)}.`;
  if (q.clientSignedAt) return `You signed on ${fmtDateTime(q.clientSignedAt)} - awaiting Luna Creative's countersignature.`;
  if (q.signatureSentAt) return `Sent for your signature on ${fmtDateTime(q.signatureSentAt)}.`;
  return signatureStatusLabel[q.signatureStatus] ?? q.signatureStatus;
}

/** Admin view: every step so far, in order, each with its own date. */
function signatureLog(q: SignatureState): { label: string; date: Date | null }[] {
  const log: { label: string; date: Date | null }[] = [];
  if (q.signatureSentAt) log.push({ label: "Sent for signature", date: q.signatureSentAt });
  if (q.clientSignedAt) log.push({ label: "Member signed", date: q.clientSignedAt });
  if (q.companySignedAt) {
    log.push({ label: `${q.companySignedByName ?? "An admin"} signed as Luna Creative`, date: q.companySignedAt });
  } else if (q.companySignedById) {
    log.push({ label: `${q.companySignedByName} started the Luna Creative signature - awaiting Documenso confirmation`, date: null });
  }
  if (q.signatureStatus === "DECLINED") log.push({ label: "Declined", date: null });
  return log;
}

// Long values (scope prose, notes) would blow a log row up to a wall of text.
const clip = (s: string, n = 180) => (s.length > n ? `${s.slice(0, n)}…` : s);

function describeActivity(e: { field: string; oldValue: string | null; newValue: string | null }): string {
  if (e.field === "email") return e.newValue ?? "Email sent";
  if (e.field === "answers") return `Edited answers - ${clip(e.newValue ?? "")}`;
  if (e.field === "status") return `Status: ${e.oldValue ?? "-"} → ${e.newValue ?? "-"}`;
  return `${e.field}: ${clip(e.oldValue ?? "-")} → ${clip(e.newValue ?? "-")}`;
}

const sublabel = { fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 10 };
// Sub-groups inside the collapsed Edit form (Pricing / Turnaround / …).
const groupLabel = { fontWeight: 600, fontSize: "0.88rem", color: "var(--charcoal)", margin: "18px 0 10px" } as const;
// Section divider + spacing for the admin card (one clean line between groups).
const section = { marginTop: 22, paddingTop: 22, borderTop: "1px solid var(--line)" } as const;
const field = { marginBottom: 14 } as const;
// Destructive actions get their own clearly-separated, red-tinted group so
// they read as deliberate, not part of the routine controls above.
const dangerZone = { marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)" } as const;

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: true,
      edits: { orderBy: { createdAt: "desc" }, include: { editedBy: true } },
      emailSends: { orderBy: { createdAt: "desc" }, include: { sentBy: true } },
    },
  });
  if (!quote) notFound();

  const isCreator = quote!.createdById === user.id;
  // Private to the creator (and admins) unless shared with everyone.
  if (!isAdmin && !isCreator && !quote!.shared) notFound();

  const expired = isExpired(quote!);
  const isPending = quote!.status === "CUSTOM_PENDING";
  // Provenance only: created in Presentation Mode. These are full Luna quotes
  // from the moment they're saved - origin gates nothing except the one-time
  // content-help challenge and the reference card below.
  const fromPresentation = quote!.origin === "CLIENT";
  // When an admin is reviewing a pending custom quote, the approval controls are
  // the point of the visit, so float the Admin card to the top and push the
  // request summary + visibility cards beneath it (via flex order, below).
  const reorderAdminReview = isAdmin && isPending;
  const d = buildProposalData(quote!);
  const ans = quote!.answers as Record<string, unknown>;
  const exactPages = typeof ans.pageCountExact === "string" ? ans.pageCountExact : "";
  const exactItems = typeof ans.ecommerceItemsExact === "string" ? ans.ecommerceItemsExact : "";
  const exactAnimals = typeof ans.animalCountExact === "string" ? ans.animalCountExact : "";
  const exactPedigrees = typeof ans.pedigreeCountExact === "string" ? ans.pedigreeCountExact : "";
  const extraFunctionality = typeof ans.additionalFunctionality === "string" ? ans.additionalFunctionality : "";
  const existingUrl = ans.existingWebsite === true && typeof ans.existingWebsiteUrl === "string" ? ans.existingWebsiteUrl : "";
  // The one client answer not taken at face value: content help. The member
  // confirms it (once) at the signature step - "No" removes the -$500.
  const needsContentConfirm =
    fromPresentation && ans.contentProvided === true && typeof ans.contentConfirmedByDroptine !== "boolean";
  // Admin internal breakdown: prefer the line-item snapshot taken when the
  // quote was priced (it already carries the demand-adjustment and rush lines),
  // falling back to a live recompute for older quotes without one. Any gap
  // between the items and the stored total (rounding up to $250, the price
  // floor, or - on snapshotless quotes - model changes since creation) is
  // surfaced as its own reconciliation row so the table always adds up.
  const snapshotItems =
    Array.isArray(quote!.lineItems) && quote!.lineItems.length
      ? (quote!.lineItems as unknown as { label: string; amount: number }[])
      : null;
  const breakdownItems = snapshotItems ?? priceQuote(ans as unknown as PricingAnswers).lineItems;
  const breakdownDrift = quote!.computedTotal - breakdownItems.reduce((s, li) => s + li.amount, 0);
  const isCustomPricing = isPending || quote!.overrideTotal != null;
  // How much the admin's custom price moved off the deterministic standard.
  const customDelta = (quote!.overrideTotal ?? quote!.computedTotal) - quote!.computedTotal;
  // Presentation-Mode price composition snapshot. Present on CLIENT-origin
  // quotes AND kept after promotion, so the Luna view can still show what the
  // client was quoted in person.
  const clientPricing = (quote!.clientPricing ?? null) as {
    lunaBase?: number;
    markup?: number;
    markupIsPercent?: boolean;
    markupApplied?: number;
    increments?: number;
    incrementAmount?: number;
    monthlyMarkup?: number;
    adjustment?: number; // signed operator override (positive = increase; a reduction shows as discount)
    discount?: number;
  } | null;
  // Everything derives from the snapshot (not the live quote columns), so the
  // same table stays correct after promotion re-prices the quote at Luna's
  // rate. Older snapshots without `adjustment` fall back to their discount.
  const cpLunaBase = clientPricing?.lunaBase ?? 0;
  const cpMarkup = clientPricing?.markupApplied ?? clientPricing?.markup ?? 0;
  const cpIncrementsAmt = (clientPricing?.increments ?? 0) * (clientPricing?.incrementAmount ?? 0);
  const cpAdjustment = clientPricing?.adjustment ?? -(clientPricing?.discount ?? 0);
  const cpTotal = Math.max(0, cpLunaBase + cpMarkup + cpIncrementsAmt + cpAdjustment);
  // What the client was shown monthly: the stored monthly is Luna's, so add
  // the snapshot markup back on top.
  const cpMonthly = quote!.monthly + (clientPricing?.monthlyMarkup ?? 0);
  // Shared composition table (live client quote + post-promotion reference).
  const compositionTable = clientPricing && (
    <table className="simple">
      <tbody>
        <tr><td>Luna Creative price</td><td className="amt">{money(cpLunaBase)}</td></tr>
        <tr>
          <td>Markup{clientPricing.markupIsPercent ? ` (${clientPricing.markup ?? 0}%)` : ""}</td>
          <td className="amt">+{money(cpMarkup)}</td>
        </tr>
        {(clientPricing.increments ?? 0) > 0 && (
          <tr>
            <td>Price increments ({clientPricing.increments} × {money(clientPricing.incrementAmount ?? 0)})</td>
            <td className="amt">+{money(cpIncrementsAmt)}</td>
          </tr>
        )}
        {cpAdjustment > 0 && (
          <tr><td>Operator increase (override)</td><td className="amt">+{money(cpAdjustment)}</td></tr>
        )}
        {cpAdjustment < 0 && (
          <tr style={{ color: "var(--good)" }}><td>Operator reduction (override)</td><td className="amt">−{money(-cpAdjustment)}</td></tr>
        )}
        <tr>
          <td style={{ fontSize: "1.02rem", paddingTop: 10 }}><strong>Droptine price (client total)</strong></td>
          <td className="amt" style={{ fontSize: "1.05rem", paddingTop: 10 }}><strong>{money(cpTotal)}</strong></td>
        </tr>
      </tbody>
    </table>
  );
  const dashboardHref = "/dashboard";

  // Members can't open an expired quote (no details, no price).
  if (!isAdmin && expired) {
    return (
      <div className="container" style={{ maxWidth: 560 }}>
        <Link href={dashboardHref} className="backnav">
          <svg viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Dashboard
        </Link>
        <h1>{quote!.proposalName}</h1>
        <div className="card">
          <span className="pill expired">Expired</span>
          <p className="help" style={{ marginTop: 12 }}>
            This proposal has expired. Ask an admin to reactivate it if you still need it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 820, ...(reorderAdminReview ? { display: "flex", flexDirection: "column" } : {}) }}>
      <Link href={dashboardHref} className="backnav">
        <svg viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Dashboard
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <h1 style={{ flex: 1 }}>{quote!.proposalName}</h1>
        {statusPills(quote!)}
        {expired && <span className="pill expired">Expired</span>}
      </div>

      {isPending ? (
        <div className="card" style={reorderAdminReview ? { order: 2, marginTop: 18 } : undefined}>
          <h3 style={{ marginBottom: 8 }}>Custom quote - awaiting approval</h3>
          <ul style={{ marginLeft: 18 }}>
            {quote!.customReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {!isAdmin && <p className="help" style={{ marginTop: 10 }}>We&apos;ll review this and follow up with pricing.</p>}
        </div>
      ) : (
        <ProposalView d={d} />
      )}

      {/* Contact + Presentation-Mode reference sit BELOW the proposal. */}
      {(quote!.client.contactName || quote!.client.email || quote!.client.phone) && (
        <div className="card" style={{ marginTop: 18, ...(reorderAdminReview ? { order: 3 } : {}) }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Client contact</div>
          {[
            { label: "Contact", value: quote!.client.contactName },
            { label: "Email", value: quote!.client.email },
            { label: "Phone", value: quote!.client.phone },
          ]
            .filter((f): f is { label: string; value: string } => Boolean(f.value))
            .map((f, i) => (
              <div
                key={f.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <span style={{ ...sublabel, marginBottom: 0, minWidth: 64 }}>{f.label}</span>
                <span style={{ flex: 1, overflowWrap: "anywhere" }}>{f.value}</span>
                <CopyButton text={f.value} />
              </div>
            ))}
        </div>
      )}

      {/* Quotes born in Presentation Mode keep the client-facing snapshot as a
          reference: what the client was quoted in person, next to Luna's
          numbers above. (No scope here - the proposal carries its own.) */}
      {clientPricing != null && (
        <div className="card" style={{ marginTop: 18, ...(reorderAdminReview ? { order: 4 } : {}) }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Client quote (Presentation Mode)</div>
          <p className="help" style={{ marginTop: 0, marginBottom: 10 }}>
            What the client was quoted in person when this was saved.
          </p>
          {compositionTable}
          <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>
            + {money(cpMonthly)}/mo hosting &amp; maintenance was shown to the client (includes the
            member&apos;s monthly markup).
          </p>
          {needsContentConfirm && (
            <p className="help" style={{ marginTop: 8, marginBottom: 0, color: "var(--gold-dark)" }}>
              The client asked for Droptine to provide the content - the −$500 stands unconfirmed
              until the signature step asks who actually provides it.
            </p>
          )}
          {isAdmin && quote!.priceReason && (
            <p className="help" style={{ marginTop: 8, marginBottom: 0 }}>
              <strong>Override note for record:</strong> {quote!.priceReason}
            </p>
          )}
        </div>
      )}

      {/* Email the client-facing quote to the client from the internal app -
          the same capability as the Presentation-Mode client list, on the
          quote's own page. Only for Presentation-Mode quotes (they carry a
          client-facing price); the send is disabled when there's no client email
          on file or no client-facing price yet. */}
      {fromPresentation && (
        <SendToClientCard
          quoteId={quote!.id}
          defaultEmail={quote!.client.email ?? ""}
          businessName={quote!.proposalName || quote!.client.name}
          hasClientInfo={Boolean(quote!.client.email?.trim())}
          hasPrice={quote!.clientPricing != null}
        />
      )}

      {/* Audit log of every time this quote was emailed to the end client, with
          the exact address it went to (which may be a one-off override that
          differs from the client's saved contact). */}
      {quote!.emailSends.length > 0 && (
        <div className="card" style={{ marginTop: 18, ...(reorderAdminReview ? { order: 4 } : {}) }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Client email history</div>
          <p className="help" style={{ marginTop: 0, marginBottom: 10 }}>
            Every time this quote was emailed to the client.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {quote!.emailSends.map((s) => (
              <li key={s.id} style={{ fontSize: "0.88rem", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span>
                  <strong>{s.toEmail}</strong>
                  {s.status === "FAILED" && <span style={{ color: "#b3261e", marginLeft: 6 }}>(failed)</span>}
                  {/* Surface WHY it failed so a bad send is diagnosable (e.g. an
                      unverified sending domain) instead of a bare "(failed)". */}
                  {s.status === "FAILED" && s.error && (isAdmin || isCreator) && (
                    <span style={{ display: "block", color: "var(--muted)", fontSize: "0.8rem", marginTop: 2 }}>{s.error}</span>
                  )}
                </span>
                <span style={{ color: "var(--muted)" }}>
                  {/* Always name the account that sent it, so every send is
                      attributable regardless of who's viewing. */}
                  {fmtDateTime(s.createdAt)} · {s.sentBy.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isAdmin && isCreator && !isPending && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Signatures</div>
          {!documensoEnabled() ? (
            <p className="help">E-signature isn&apos;t set up yet - ask an admin to enable it.</p>
          ) : (
            <>
              {signatureStage(quote!) && <p style={{ margin: "0 0 10px" }}>{signatureStage(quote!)}</p>}
              {quote!.signatureStatus !== "SIGNED" && (
                <>
                  <RequestSignatureButton
                    quoteId={quote!.id}
                    resend={Boolean(quote!.signatureStatus)}
                    email={quote!.createdBy.email}
                    needsContentConfirm={needsContentConfirm}
                  />
                  <p className="help" style={{ marginTop: 10 }}>
                    Sends the proposal to your account email ({quote!.createdBy.email}) to review and sign.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Admin controls */}
      {isAdmin && (
        <div className="card" style={{ marginTop: 18, borderColor: "var(--gold)", ...(reorderAdminReview ? { order: 1 } : {}) }}>
          {expired && (
            <div style={{ marginTop: 16 }}>
              <div style={sublabel}>Expired</div>
              <p className="help" style={{ marginBottom: 10 }}>
                The 60-day validity has passed. Reactivating resets the date, refreshes pricing to the current model,
                issues a new link, and <strong>auto-emails the new link to the requester</strong>.
              </p>
              <form action={reactivateQuote.bind(null, quote!.id)}>
                <button type="submit" className="btn-gold">Reactivate</button>
              </form>
            </div>
          )}

          {/* Breakdown - the itemized snapshot taken when the quote was priced
              (or a recompute for older quotes), so the standard build cost
              stays visible even on custom/override quotes. */}
          <div style={expired ? section : { marginTop: 16 }}>
            <div style={sublabel}>{isPending ? "Selection summary (suggested)" : "Internal breakdown"}</div>
            <table className="simple">
              <tbody>
                {breakdownItems.map((li, i) => (
                  <tr key={i}><td>{li.label}</td><td className="amt">{money(li.amount)}</td></tr>
                ))}
                {/* Reconciliation: rounding up to $250 / the price floor (or, on
                    older quotes without a snapshot, model drift since creation). */}
                {breakdownDrift !== 0 && (
                  <tr>
                    <td className="help" style={{ padding: "8px 0" }}>
                      {snapshotItems ? "Rounding (to $250) & price floor" : "Pricing model change since creation"}
                    </td>
                    <td className="amt">{breakdownDrift > 0 ? "+" : "−"}{money(Math.abs(breakdownDrift))}</td>
                  </tr>
                )}
                {/* Standard, deterministic total from the pricing engine. */}
                <tr>
                  <td>{isCustomPricing ? "Standard total (computed)" : "Subtotal"}</td>
                  <td className="amt">{money(quote!.computedTotal)}</td>
                </tr>
                {/* On a custom/override quote, show how much the custom price moved
                    off the standard - positive = added, negative = removed. */}
                {isCustomPricing && quote!.overrideTotal != null && (
                  <tr style={{ color: customDelta < 0 ? "var(--good)" : "var(--ink)" }}>
                    <td>Custom functionality adjustment</td>
                    <td className="amt">
                      {customDelta > 0 ? "+" : customDelta < 0 ? "−" : ""}{money(Math.abs(customDelta))}
                    </td>
                  </tr>
                )}
                {quote!.discount > 0 && (
                  <tr style={{ color: "var(--good)" }}><td>Discount</td><td className="amt">−{money(quote!.discount)}</td></tr>
                )}
                <tr>
                  <td style={{ fontSize: "1.02rem", paddingTop: 10 }}>
                    <strong>{isPending ? "Suggested total" : isCustomPricing ? "Custom quote price" : "Total"}</strong>
                  </td>
                  <td className="amt" style={{ fontSize: "1.05rem", paddingTop: 10 }}><strong>{money(finalPrice(quote!))}</strong></td>
                </tr>
              </tbody>
            </table>
            {/* What pushed this into a custom quote. */}
            {quote!.customReasons.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={sublabel}>What triggered the custom quote</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.9rem" }}>
                  {quote!.customReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {!isPending && (
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                <TransientActionButton
                  action={resendProposalEmail.bind(null, quote!.id)}
                  label="Resend email"
                  pendingLabel="Sending…"
                  doneLabel="Email sent ✓"
                />
                {quote!.emailStatus && (
                  <span className="help" style={{ color: quote!.emailStatus === "FAILED" ? "#b3261e" : "var(--muted)" }}>
                    Email: <strong>{quote!.emailStatus}</strong>{quote!.emailError ? ` - ${quote!.emailError}` : ""}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* E-signature (Documenso) - available once there's a proposal to sign */}
          {!isPending && (
            <div style={section}>
              <div style={sublabel}>E-signature</div>
              {!documensoEnabled() ? (
                <p className="help">Documenso isn&apos;t configured - set DOCUMENSO_API_KEY and DOCUMENSO_COMPANY_EMAIL in the environment to enable this.</p>
              ) : (
                <>
                  {quote!.signatureStatus && (
                    <p style={{ margin: "0 0 10px", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span>
                        <strong>{signatureStatusLabel[quote!.signatureStatus] ?? quote!.signatureStatus}</strong>
                        {quote!.signatureStatus === "SIGNED" && (
                          <> · <a href={`/api/proposal/${quote!.publicCode}/pdf`} target="_blank" rel="noreferrer">Download signed PDF</a></>
                        )}
                      </span>
                      {quote!.signatureEnvelopeId && (
                        <TransientActionButton
                          action={syncSignatureStatus.bind(null, quote!.id)}
                          label="Sync from Documenso"
                          pendingLabel="Syncing…"
                          doneLabel="Synced ✓"
                          style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                          title="Pulls the latest signing status directly from Documenso - use this if a webhook delivery was missed and the status above looks stale."
                        />
                      )}
                    </p>
                  )}
                  {signatureLog(quote!).length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      {signatureLog(quote!).map((step, i) => (
                        <p key={i} className="help" style={{ margin: "0 0 2px" }}>
                          {step.label}{step.date && ` · ${fmtDateTime(step.date)}`}
                        </p>
                      ))}
                    </div>
                  )}

                  {quote!.signatureStatus !== "SIGNED" && (
                    <SendForSignatureForm
                      quoteId={quote!.id}
                      defaultEmail={quote!.client.email ?? ""}
                      resend={Boolean(quote!.signatureStatus)}
                      needsContentConfirm={needsContentConfirm}
                    />
                  )}

                  {quote!.clientSignedAt && quote!.companySigningToken && !quote!.companySignedAt && (
                    <div style={{ marginTop: 16 }}>
                      {!quote!.companySignedById ? (
                        <form action={confirmCompanySignature.bind(null, quote!.id)}>
                          <button type="submit" className="btn-gold">Sign as Luna Creative</button>
                        </form>
                      ) : (
                        <iframe
                          src={documensoSignUrl(quote!.companySigningToken)}
                          style={{ width: "100%", height: 640, border: "1px solid var(--line)", borderRadius: 10 }}
                          title="Sign as Luna Creative"
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Request details + AI recommendation - custom quotes only */}
          {isPending && (extraFunctionality || exactPages || exactItems || exactAnimals || exactPedigrees || existingUrl) && (
            <div style={section}>
              <div style={sublabel}>Request details</div>
              {exactPages && <p style={{ margin: "0 0 8px" }}><strong>Pages requested:</strong> {exactPages}</p>}
              {exactItems && <p style={{ margin: "0 0 8px" }}><strong>Store items (approx.):</strong> {exactItems}</p>}
              {exactAnimals && <p style={{ margin: "0 0 8px" }}><strong>Animals (approx.):</strong> {exactAnimals}</p>}
              {exactPedigrees && <p style={{ margin: "0 0 8px" }}><strong>Pedigrees (approx.):</strong> {exactPedigrees}</p>}
              {existingUrl && <p style={{ margin: "0 0 8px" }}><strong>Existing site:</strong> {existingUrl}</p>}
              {extraFunctionality && (
                <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}><strong>Complex functionality:</strong> {extraFunctionality}</p>
              )}
            </div>
          )}

          {isPending && (
            <div style={section}>
              <div style={sublabel}>AI recommendation</div>
              <p className="help" style={{ marginBottom: 10 }}>
                Suggests a one-time price, turnaround, monthly cost, and a proposed scope from the
                selections and the complex functionality requested. Copy any value into the fields below.
              </p>
              <AiRecommendation quoteId={quote!.id} />
            </div>
          )}

          {/* Approve - custom quotes only (editing is hidden until approved) */}
          {isPending && (
            <div style={section}>
              <div style={sublabel}>Approve custom quote</div>
              <form action={approveQuote.bind(null, quote!.id)}>
                <div style={field}>
                  <label className="qlabel" htmlFor="approve-price">Approved price ($)<span className="req">*</span></label>
                  <input id="approve-price" name="overrideTotal" type="text" inputMode="numeric" defaultValue={quote!.computedTotal || ""} required />
                </div>
                <div style={field}>
                  <label className="qlabel" htmlFor="approve-lead">Turnaround (business days)</label>
                  <input id="approve-lead" name="leadDaysOverride" type="text" inputMode="numeric" defaultValue={quote!.leadDaysOverride ?? leadTimeDays(subtotal(quote!))} />
                </div>
                <div style={field}>
                  <label className="qlabel" htmlFor="approve-monthly">Monthly ($)</label>
                  <input id="approve-monthly" name="monthly" type="text" inputMode="numeric" defaultValue={quote!.monthly} />
                </div>
                <div style={field}>
                  <label className="qlabel" htmlFor="approve-scope">Scope</label>
                  <textarea id="approve-scope" name="scopeSummary" defaultValue={quote!.scopeSummary ?? ""} style={{ minHeight: 110 }} />
                </div>
                <div style={field}>
                  <DisclaimersField initial={asDisclaimers(quote!.disclaimers)} />
                </div>
                <button type="submit" className="btn-gold">Approve &amp; send</button>
                <p className="help" style={{ marginTop: 10 }}>Approving emails the requester a login-protected link to the proposal.</p>
              </form>
            </div>
          )}

          {/* Edit - available once it's no longer a pending custom quote.
              Collapsed by default (mirroring the activity log) and grouped so
              the nine fields read as four decisions, not a wall. */}
          {!isPending && (
            <details style={section}>
              <summary style={{ ...sublabel, marginBottom: 0, cursor: "pointer" }}>Edit</summary>
              <div style={{ margin: "14px 0 16px" }}>
                <Link href={`/quote/${quote!.id}/edit`} className="btn-secondary">Edit answers</Link>
              </div>
              <form action={updateQuote.bind(null, quote!.id)}>
                <div style={groupLabel}>Pricing</div>
                <div style={field}>
                  <label className="qlabel" htmlFor="overrideTotal">Override total ($)</label>
                  <input id="overrideTotal" name="overrideTotal" type="text" inputMode="numeric" defaultValue={quote!.overrideTotal ?? ""} />
                  <div className="help" style={{ marginTop: 4 }}>Replaces the price shown to the client on the proposal (before discount). Leave blank to use the computed price ({money(quote!.computedTotal)}).</div>
                </div>
                <div style={field}>
                  <label className="qlabel" htmlFor="discount">Discount ($)</label>
                  <input id="discount" name="discount" type="text" inputMode="numeric" defaultValue={quote!.discount || ""} />
                </div>
                <div style={field}>
                  <label className="qlabel" htmlFor="actualCharged">Actual charged ($)</label>
                  <input id="actualCharged" name="actualCharged" type="text" inputMode="numeric" defaultValue={quote!.actualCharged ?? ""} />
                  <div className="help" style={{ marginTop: 4 }}>What the client was actually billed - for quoted-vs-actual reporting only. Not shown to the client.</div>
                </div>
                <div style={field}>
                  <label className="qlabel" htmlFor="priceReason">Reason for price adjustment (optional)</label>
                  <input id="priceReason" name="priceReason" type="text" defaultValue={quote!.priceReason ?? ""} />
                  <div className="help" style={{ marginTop: 4 }}>Internal note on why this was charged more or less - feeds future AI pricing review.</div>
                </div>

                <div style={groupLabel}>Turnaround &amp; monthly</div>
                <div style={field}>
                  <label className="qlabel" htmlFor="leadDaysOverride">Turnaround (business days)</label>
                  <input id="leadDaysOverride" name="leadDaysOverride" type="text" inputMode="numeric" defaultValue={quote!.leadDaysOverride ?? ""} />
                  <div className="help" style={{ marginTop: 4 }}>Leave blank to use the price-based default.</div>
                </div>
                <div style={field}>
                  <label className="qlabel" htmlFor="monthly">Monthly ($)</label>
                  <input id="monthly" name="monthly" type="text" inputMode="numeric" defaultValue={quote!.monthly} />
                </div>

                <div style={groupLabel}>Proposal copy</div>
                <div style={field}>
                  <label className="qlabel" htmlFor="proposalName">Proposal name</label>
                  <input id="proposalName" name="proposalName" type="text" defaultValue={quote!.proposalName} />
                </div>
                <div style={field}>
                  <label className="qlabel" htmlFor="scopeSummary">Scope</label>
                  <textarea id="scopeSummary" name="scopeSummary" defaultValue={quote!.scopeSummary ?? ""} style={{ minHeight: 110 }} />
                </div>
                <div style={field}>
                  <DisclaimersField initial={asDisclaimers(quote!.disclaimers)} />
                </div>

                <div style={groupLabel}>Internal notes</div>
                <div style={field}>
                  <label className="qlabel" htmlFor="notes">Notes</label>
                  <textarea id="notes" name="notes" defaultValue={quote!.notes ?? ""} />
                </div>
                <button type="submit" className="btn-primary">Save changes</button>
              </form>
            </details>
          )}

          {/* Activity log */}
          <details style={section}>
            <summary style={{ ...sublabel, marginBottom: 0, cursor: "pointer" }}>
              Activity log ({quote!.edits.length + 1})
            </summary>
            <div style={{ marginTop: 10 }}>
              <div className="help" style={{ padding: "3px 0" }}>
                {fmtDateTime(quote!.createdAt)} · Requested by {quote!.createdBy.email}
              </div>
              {[...quote!.edits].reverse().map((e) => (
                <div key={e.id} className="help" style={{ padding: "3px 0" }}>
                  {fmtDateTime(e.createdAt)} · {e.editedBy.email} · {describeActivity(e)}
                </div>
              ))}
            </div>
          </details>

          {/* Danger zone - destructive, kept apart from routine controls */}
          <div style={dangerZone}>
            <div style={{ ...sublabel, color: "#b3261e", marginBottom: 6 }}>Danger zone</div>
            <p className="help" style={{ marginTop: 0, marginBottom: 10 }}>
              Permanently deletes this proposal and its history. This can&apos;t be undone.
            </p>
            <DeleteQuoteButton quoteId={quote!.id} />
          </div>
        </div>
      )}

      {/* Visibility - collapsed by default and kept last, mirroring the activity
          log. Client-portal quotes are always private, so no toggle for them. */}
      {(isAdmin || isCreator) && (
        <details className="card" style={{ marginTop: 18, ...(reorderAdminReview ? { order: 99 } : {}) }}>
          <summary style={{ fontWeight: 600, cursor: "pointer" }}>Visibility</summary>
          <div style={{ marginTop: 12 }}>
            <VisibilityToggle quoteId={quote!.id} shared={quote!.shared} isCreator={isCreator} />
          </div>
        </details>
      )}
    </div>
  );
}
