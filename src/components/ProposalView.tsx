import { money } from "@/lib/quote";
import type { ProposalPdfData } from "@/lib/pdf";
import {
  STANDARD_FEATURES,
  LEAD_TIME_SUFFIX,
  PROPOSAL_DISCLAIMER,
  PROPOSAL_VALIDITY,
  MONTHLY_ITEMS,
  ECOMMERCE_MONTHLY_DISCLAIMER,
  IDX_MONTHLY_DISCLAIMER,
} from "@/lib/proposal-copy";

// Three consistent styles: label, body, and (large) pricing.
const labelStyle = {
  fontSize: "0.72rem",
  color: "var(--muted)",
  textTransform: "uppercase" as const,
  letterSpacing: 1,
  marginBottom: 6,
};
const bodyStyle = { fontSize: "1rem", color: "var(--ink)", lineHeight: 1.5, margin: 0 };
const bodyBold = { ...bodyStyle, fontWeight: 600 };

/** The client-facing proposal (single total). Rendered on the internal quote
 *  page; the "Download PDF" button hits the login-protected PDF route. */
export default function ProposalView({ d }: { d: ProposalPdfData }) {
  const half = Math.round(d.total / 2);
  const preparedBy = [d.preparedByName, d.preparedByEmail, d.preparedByPhone].filter(Boolean).join("  ·  ");
  const monthlyNote = [d.ecommerce ? ECOMMERCE_MONTHLY_DISCLAIMER : "", d.mlsIdx ? IDX_MONTHLY_DISCLAIMER : ""]
    .filter(Boolean)
    .join(" ");
  const features = STANDARD_FEATURES.replace(/^Standard Features:\s*/, "");

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          padding: "22px 28px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: "1.45rem", letterSpacing: 1, color: "var(--gold)" }}>LUNA CREATIVE</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={`/api/proposal/${d.publicCode}/pdf`} className="btn-gold" style={{ padding: "13px 26px", fontSize: "0.98rem" }}>
            Download PDF
          </a>
        </div>
      </div>

      <div style={{ padding: "26px 28px" }}>
        <div style={labelStyle}>Website Proposal · prepared for</div>
        <div style={{ fontWeight: 800, fontSize: "2rem", lineHeight: 1.15, color: "var(--charcoal)" }}>{d.proposalName}</div>

        {preparedBy && (
          <div className="q" style={{ marginTop: 18 }}>
            <div style={labelStyle}>Prepared by</div>
            <p style={bodyStyle}>{preparedBy}</p>
          </div>
        )}

        {d.scopeSummary && (
          <div className="q">
            {d.scopeSummary.split(/\n+/).map((p, i) => (
              <p key={i} style={{ ...bodyStyle, marginBottom: 10 }}>{p}</p>
            ))}
          </div>
        )}

        <div className="q">
          <div style={labelStyle}>Website Development</div>
          <p style={bodyBold}>Coding, Programming, and Implementation of Website</p>
          <ul className="bullets">
            <li><span style={{ fontWeight: 600 }}>Standard Features:</span> {features}</li>
            <li>
              <span style={{ fontWeight: 600 }}>Estimated Lead Time:</span>{" "}
              {d.originalLeadDays != null && (
                <span style={{ fontWeight: 600, textDecoration: "line-through", color: "var(--muted)" }}>
                  {d.originalLeadDays} Business Days{" "}
                </span>
              )}
              <span style={{ fontWeight: 600 }}>{d.leadDays} Business Days</span> {LEAD_TIME_SUFFIX}
            </li>
          </ul>

          {(d.rushFee > 0 || d.discount > 0) && (
            <div style={{ marginTop: 12 }}>
              {d.rushFee > 0 && (
                <>
                  <div style={{ ...bodyStyle, display: "flex", justifyContent: "space-between" }}>
                    <span>Website build</span><span>{money(d.subtotal - d.rushFee)}</span>
                  </div>
                  <div style={{ ...bodyStyle, display: "flex", justifyContent: "space-between" }}>
                    <span>Rush Fee - {d.leadDays} business day turnaround</span><span>{money(d.rushFee)}</span>
                  </div>
                </>
              )}
              {d.discount > 0 && (
                <>
                  {d.rushFee > 0 && (
                    <div style={{ ...bodyStyle, display: "flex", justifyContent: "space-between" }}>
                      <span>Subtotal</span><span>{money(d.subtotal)}</span>
                    </div>
                  )}
                  <div style={{ ...bodyStyle, display: "flex", justifyContent: "space-between", color: "#c62828", fontWeight: 700 }}>
                    <span>Discount</span><span>−{money(d.discount)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="total"><span>Total</span><span className="big">{money(d.total)}</span></div>
          <div style={{ ...bodyStyle, display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span>50% deposit to begin</span><span>{money(half)}</span>
          </div>
          <div style={{ ...bodyStyle, display: "flex", justifyContent: "space-between" }}>
            <span>50% on completion</span><span>{money(d.total - half)}</span>
          </div>
          {d.disclaimers.filter((x) => x.placement === "development").map((x, i) => (
            <p key={i} className="note" style={{ marginTop: i === 0 ? 14 : 4 }}>{x.text}</p>
          ))}
          <p style={{ fontStyle: "italic", fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.5, marginTop: 28 }}>
            {PROPOSAL_DISCLAIMER} {PROPOSAL_VALIDITY}
          </p>
        </div>

        <div className="q">
          <div style={labelStyle}>Monthly Hosting, Security &amp; Maintenance</div>
          <ul className="bullets">
            {MONTHLY_ITEMS.map((m, i) => (
              <li key={i}><span style={{ fontWeight: 600 }}>{m.title}:</span> {m.desc}</li>
            ))}
          </ul>
          <div className="total"><span>Per month</span><span className="big">{money(d.monthly)}</span></div>
          {monthlyNote && <p className="note">{monthlyNote}</p>}
          {d.disclaimers.filter((x) => x.placement === "monthly").map((x, i) => (
            <p key={i} className="note">{x.text}</p>
          ))}
        </div>

        <p className="note">Ref: {d.code}</p>
      </div>
    </div>
  );
}
