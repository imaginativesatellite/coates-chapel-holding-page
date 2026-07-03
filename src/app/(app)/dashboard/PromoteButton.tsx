"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft } from "lucide-react";
import { requestQuoteFromLuna } from "./actions";

const CONFIRM =
  "Request a quote from Luna Creative for this client? It moves to your Luna Creative quotes and notifies the team.";
const CONTENT_QUESTION = "The client asked for content help. Will Droptine be providing it to Luna Creative?";

const smallBtn = { padding: "6px 14px", fontSize: "0.85rem" } as const;

/** "Request Quote from Luna Creative" - promotes a client quote (see actions.ts).
 *  When the client asked for content help, a required Yes/No decides whether
 *  Droptine supplies the content (and thus whether the $500 discount stays). */
export default function PromoteButton({ quoteId, contentHelp }: { quoteId: string; contentHelp: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const promote = (contentProvidedByDroptine?: boolean) => {
    setError(null);
    setAsking(false);
    startTransition(async () => {
      const res = await requestQuoteFromLuna(quoteId, contentProvidedByDroptine);
      if (res?.error) setError(res.error);
    });
  };

  const onClick = () => {
    if (contentHelp) { setAsking(true); return; }
    if (!window.confirm(CONFIRM)) return;
    promote();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      {asking ? (
        <div className="promote-ask">
          <p className="promote-ask-q">{CONTENT_QUESTION}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn-secondary" onClick={() => setAsking(false)} disabled={pending} style={smallBtn}>Cancel</button>
            <button type="button" className="btn-secondary" onClick={() => promote(false)} disabled={pending} style={smallBtn}>No</button>
            <button type="button" className="btn-primary" onClick={() => promote(true)} disabled={pending} style={smallBtn}>Yes</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-secondary"
          onClick={onClick}
          disabled={pending}
          // whiteSpace normal + maxWidth so the long label wraps INSIDE a
          // narrow tile instead of overflowing past the card edge.
          style={{ padding: "8px 14px", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "normal", maxWidth: "100%", textAlign: "left" }}
        >
          <ArrowRightLeft size={14} aria-hidden style={{ flex: "none" }} />
          {pending ? "Requesting…" : "Request Quote from Luna Creative"}
        </button>
      )}
      {error && <span style={{ color: "#b3261e", fontSize: "0.8rem" }}>{error}</span>}
    </div>
  );
}
