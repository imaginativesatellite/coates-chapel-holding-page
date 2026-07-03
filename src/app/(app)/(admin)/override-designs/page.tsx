import { requireAdmin } from "@/lib/session";

/**
 * TEMPORARY decision page: ten candidate designs for the Presentation-Mode
 * price-override modal (opened by the pencil anchored at the lower-right of
 * the client price screen). All ten share the agreed constraints - square
 * corners, standard-height fields, a technical typeface, and an explicit
 * red "you're about to override" warning - and differ in tone/structure.
 * Static mockups only. Once an option is picked, it replaces the interim
 * modal in PortalQuote/.ovr-* and this page + its tab get deleted.
 */

const V = "Verdana, Geneva, Tahoma, sans-serif";
const MONO = "'Courier New', ui-monospace, monospace";

// Sample values every mock uses, so options compare like-for-like.
const CURRENT = "$12,500";
const DISCOUNT = "500";
const NEW = "$12,000";

const sq = { borderRadius: 0 } as const;
const inputBase = {
  ...sq,
  width: "100%",
  height: 34,
  border: "1px solid #888",
  padding: "0 10px",
  fontSize: 13,
  background: "#fff",
  fontFamily: "inherit",
} as const;
const btnBase = {
  ...sq,
  height: 32,
  padding: "0 16px",
  fontSize: 12,
  cursor: "default",
  fontFamily: "inherit",
} as const;
const btnGray = { ...btnBase, background: "#e9e9e9", border: "1px solid #999", color: "#222" } as const;
const btnRed = { ...btnBase, background: "#b3261e", border: "1px solid #b3261e", color: "#fff" } as const;

function Frame({ n, title, blurb, children }: { n: number; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>Option {n} — {title}</div>
      <p className="help" style={{ marginTop: 0 }}>{blurb}</p>
      <div
        aria-hidden
        style={{
          background: "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), #f6f5f3",
          padding: "36px 20px",
          display: "flex",
          justifyContent: "center",
          borderRadius: 8,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const Btns = ({ cancel = btnGray, confirm = btnRed, confirmLabel = "Override" }: { cancel?: React.CSSProperties; confirm?: React.CSSProperties; confirmLabel?: string }) => (
  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
    <button type="button" style={cancel}>Cancel</button>
    <button type="button" style={confirm}>{confirmLabel}</button>
  </div>
);

const label = (color = "#555") =>
  ({ display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color, marginBottom: 4 } as const);

export default async function OverrideDesignsPage() {
  await requireAdmin();

  return (
    <div>
      <h1>Override modal — pick a design</h1>
      <p className="lede">
        Ten candidates for the Presentation-Mode price-override modal (the anchored pencil opens it).
        All use square corners, standard-height fields, a technical typeface, and a red override
        warning. Reply with an option number to ship it; this page is temporary and gets removed after.
      </p>

      <Frame n={1} title="System dialog" blurb="Classic OS dialog: dark title bar, light-gray body, Verdana. Closest to the interim modal currently live in the portal.">
        <div style={{ ...sq, width: 340, background: "#f2f2f2", border: "1px solid #444", fontFamily: V, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          <div style={{ background: "#2f2f2f", color: "#fff", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", padding: "8px 12px" }}>Price override</div>
          <div style={{ padding: 16 }}>
            <p style={{ color: "#b3261e", fontSize: 12, fontWeight: 700, margin: "0 0 14px" }}>⚠ You are about to override this price.</p>
            <label style={label()}>Discount ($)</label>
            <input readOnly defaultValue={DISCOUNT} style={inputBase} />
            <Btns />
          </div>
        </div>
      </Frame>

      <Frame n={2} title="Hazard stripe" blurb="A black-and-yellow caution stripe across the top signals 'restricted area' before a word is read.">
        <div style={{ ...sq, width: 340, background: "#fff", border: "1px solid #333", fontFamily: V, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          <div style={{ height: 10, background: "repeating-linear-gradient(45deg, #111 0 12px, #f2c200 12px 24px)" }} />
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 6px" }}>Admin override</div>
            <p style={{ color: "#b3261e", fontSize: 12, fontWeight: 700, margin: "0 0 14px" }}>You are about to override this price.</p>
            <label style={label()}>Discount ($)</label>
            <input readOnly defaultValue={DISCOUNT} style={inputBase} />
            <Btns />
          </div>
        </div>
      </Frame>

      <Frame n={3} title="Red-line minimal" blurb="No chrome at all - a heavy red border and one warning line carry the whole message. Quietest of the ten.">
        <div style={{ ...sq, width: 320, background: "#fff", border: "2px solid #b3261e", fontFamily: "Tahoma, Verdana, sans-serif", padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          <p style={{ color: "#b3261e", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", margin: "0 0 14px" }}>⚠ Price override</p>
          <label style={label()}>Discount ($)</label>
          <input readOnly defaultValue={DISCOUNT} style={inputBase} />
          <Btns />
        </div>
      </Frame>

      <Frame n={4} title="Dark console" blurb="Charcoal panel with monospace type - reads as an internal tool that happens to be on a client screen.">
        <div style={{ ...sq, width: 340, background: "#1e1e1e", border: "1px solid #555", fontFamily: MONO, color: "#ddd", padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>Price override</div>
          <p style={{ color: "#ff6b60", fontSize: 12, fontWeight: 700, margin: "0 0 14px" }}>WARNING: overriding client-facing price</p>
          <label style={label("#999")}>Discount ($)</label>
          <input readOnly defaultValue={DISCOUNT} style={{ ...inputBase, background: "#111", border: "1px solid #555", color: "#eee" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" style={{ ...btnBase, background: "none", border: "1px solid #666", color: "#ccc" }}>Cancel</button>
            <button type="button" style={btnRed}>Override</button>
          </div>
        </div>
      </Frame>

      <Frame n={5} title="Terminal" blurb="Full command-line pastiche: prompt lines, green-on-black, bracketed buttons. The most theatrical option.">
        <div style={{ ...sq, width: 360, background: "#000", border: "1px solid #333", fontFamily: MONO, color: "#3ddc84", padding: 16, fontSize: 12.5, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          <div>&gt; price --override</div>
          <div style={{ color: "#ff5f56", margin: "8px 0" }}>! WARNING: you are about to override this price</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 4px" }}>
            <span>DISCOUNT&nbsp;$</span>
            <input readOnly defaultValue={DISCOUNT} style={{ ...inputBase, width: 120, height: 30, background: "#000", border: "1px solid #2a5c3f", color: "#3ddc84", fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 14 }}>
            <button type="button" style={{ ...btnBase, background: "none", border: "none", color: "#8a8a8a", padding: 0 }}>[ CANCEL ]</button>
            <button type="button" style={{ ...btnBase, background: "none", border: "none", color: "#ff5f56", padding: 0 }}>[ CONFIRM ]</button>
          </div>
        </div>
      </Frame>

      <Frame n={6} title="Paper form" blurb="Bureaucratic 'Form PO-1' look: ruled sections, Courier values, and an acknowledgment checkbox before the button arms.">
        <div style={{ ...sq, width: 360, background: "#fff", border: "1px solid #222", fontFamily: V, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          <div style={{ borderBottom: "1px solid #222", padding: "8px 12px", display: "flex", justifyContent: "space-between", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>
            <span>Form PO-1</span><span>Price override</span>
          </div>
          <div style={{ padding: 16 }}>
            <p style={{ color: "#b3261e", fontSize: 11, fontWeight: 700, margin: "0 0 12px" }}>This action changes the client-facing price.</p>
            <label style={label()}>Discount ($)</label>
            <input readOnly defaultValue={DISCOUNT} style={{ ...inputBase, fontFamily: MONO }} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, margin: "12px 0 0", color: "#333" }}>
              <input type="checkbox" readOnly checked style={{ width: "auto" }} /> I understand this overrides the quoted price.
            </label>
            <Btns confirmLabel="File override" />
          </div>
        </div>
      </Frame>

      <Frame n={7} title="Two-step confirm" blurb="Red banner plus a required acknowledgment checkbox that enables the Override button - the most deliberate flow.">
        <div style={{ ...sq, width: 340, background: "#f7f7f7", border: "1px solid #666", fontFamily: V, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          <div style={{ background: "#b3261e", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "8px 12px" }}>⚠ Price override</div>
          <div style={{ padding: 16 }}>
            <label style={label()}>Discount ($)</label>
            <input readOnly defaultValue={DISCOUNT} style={inputBase} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, margin: "12px 0 0", color: "#333" }}>
              <input type="checkbox" readOnly checked style={{ width: "auto" }} /> Yes, override this price
            </label>
            <Btns />
          </div>
        </div>
      </Frame>

      <Frame n={8} title="Ledger" blurb="Shows the math it's changing: current price, discount entry, computed new price in tabular monospace. Most informative.">
        <div style={{ ...sq, width: 360, background: "#fff", border: "1px solid #444", fontFamily: V, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          <div style={{ background: "#2f2f2f", color: "#fff", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", padding: "8px 12px" }}>Price override</div>
          <div style={{ padding: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={{ padding: "8px 0", color: "#555" }}>Current price</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: MONO }}>{CURRENT}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={{ padding: "8px 0", color: "#555" }}>Discount</td>
                  <td style={{ padding: "8px 0", textAlign: "right" }}>
                    <input readOnly defaultValue={DISCOUNT} style={{ ...inputBase, width: 110, height: 30, textAlign: "right", fontFamily: MONO, display: "inline-block" }} />
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 0", fontWeight: 700 }}>New price</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: MONO, fontWeight: 700 }}>{NEW}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ color: "#b3261e", fontSize: 11, fontWeight: 700, margin: "12px 0 0" }}>⚠ You are about to override this price.</p>
            <Btns />
          </div>
        </div>
      </Frame>

      <Frame n={9} title="Retro beveled" blurb="Full Windows-98 treatment: navy title bar, beveled buttons, inset field. Unmistakably 'not the pretty app'.">
        <div style={{ width: 340, background: "#d4d0c8", border: "2px outset #fff", fontFamily: V, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          <div style={{ background: "linear-gradient(90deg, #000080, #1e5aa8)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "5px 8px" }}>Price Override</div>
          <div style={{ padding: 16 }}>
            <p style={{ color: "#a40000", fontSize: 12, fontWeight: 700, margin: "0 0 14px" }}>⚠ You are about to override this price.</p>
            <label style={{ ...label("#333"), textTransform: "none", fontSize: 12, letterSpacing: 0 }}>Discount ($):</label>
            <input readOnly defaultValue={DISCOUNT} style={{ ...inputBase, border: "2px inset #fff", background: "#fff" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" style={{ ...btnBase, background: "#d4d0c8", border: "2px outset #fff", minWidth: 78 }}>Cancel</button>
              <button type="button" style={{ ...btnBase, background: "#d4d0c8", border: "2px outset #fff", minWidth: 78, fontWeight: 700 }}>OK</button>
            </div>
          </div>
        </div>
      </Frame>

      <Frame n={10} title="Red-band alert" blurb="Modern alert dialog: solid red header, clean white body, gray footer rail with right-aligned actions. Serious without being retro.">
        <div style={{ ...sq, width: 360, background: "#fff", border: "1px solid #999", fontFamily: V, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          <div style={{ background: "#b3261e", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "10px 14px" }}>⚠ Price override</div>
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 12, color: "#333", margin: "0 0 14px" }}>
              This changes the price shown to the client. Current price: <strong style={{ fontFamily: MONO }}>{CURRENT}</strong>
            </p>
            <label style={label()}>Discount ($)</label>
            <input readOnly defaultValue={DISCOUNT} style={inputBase} />
          </div>
          <div style={{ background: "#efefef", borderTop: "1px solid #ccc", padding: "10px 14px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" style={btnGray}>Cancel</button>
            <button type="button" style={btnRed}>Override price</button>
          </div>
        </div>
      </Frame>
    </div>
  );
}
