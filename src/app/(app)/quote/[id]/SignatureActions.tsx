"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { requestSignature, sendForSignature } from "./actions";

// How long the "sent" confirmation (animation + text) stays on screen before
// settling back to the button (which then reads "Resend for signature").
// ~4s: long enough to read the line, short enough not to feel stuck.
const HOLD_MS = 4000;

/**
 * The success animation. Currently a lightweight SVG draw-on checkmark; this
 * component is the single swap point for the Lottie animation - once the
 * exported file lands at public/animations/signature-sent.lottie, replace
 * this SVG with the dotLottie player pointed at that path.
 */
function SuccessCheck() {
  return (
    <span className="sig-check" aria-hidden>
      <svg viewBox="0 0 36 36" width="26" height="26" fill="none">
        <circle className="sig-anim-circle" cx="18" cy="18" r="16" stroke="var(--good)" strokeWidth="2.5" />
        <path className="sig-anim-tick" d="M11 18.5l5 5 9-11" stroke="var(--good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Shared staged-state machinery: idle → sending → sent (held) → idle. */
function useSendPhases() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = (action: () => Promise<{ error: string } | { ok: true }>) => {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSent(true);
      timer.current = setTimeout(() => setSent(false), HOLD_MS);
    });
  };

  return { pending, sent, error, run };
}

/** Member one-click "Accept & sign" with a held success confirmation. */
export function RequestSignatureButton({
  quoteId,
  resend,
  email,
}: {
  quoteId: string;
  resend: boolean;
  email: string;
}) {
  const { pending, sent, error, run } = useSendPhases();

  if (sent) {
    return (
      <div className="sig-done" role="status">
        <SuccessCheck />
        <span>Sent for signature - check {email}</span>
      </div>
    );
  }
  return (
    <>
      <button type="button" className="btn-gold" disabled={pending} onClick={() => run(() => requestSignature(quoteId))}>
        {pending ? "Sending…" : resend ? "Resend for signature" : "Accept & sign"}
      </button>
      {error && <p className="help" style={{ color: "#b3261e", marginTop: 8 }}>{error}</p>}
    </>
  );
}

/** Admin send-for-signature form (editable signer email) with the same
 *  held success confirmation. */
export function SendForSignatureForm({
  quoteId,
  defaultEmail,
  resend,
}: {
  quoteId: string;
  defaultEmail: string;
  resend: boolean;
}) {
  const { pending, sent, error, run } = useSendPhases();
  const [email, setEmail] = useState(defaultEmail);

  if (sent) {
    return (
      <div className="sig-done" role="status">
        <SuccessCheck />
        <span>Sent to {email} for signature</span>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="qlabel" htmlFor="clientEmail">Signer email</label>
          <input
            id="clientEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button
          type="button"
          className="btn-gold"
          disabled={pending || !email.trim()}
          onClick={() => run(() => sendForSignature(quoteId, email))}
        >
          {pending ? "Sending…" : resend ? "Resend for signature" : "Send for signature"}
        </button>
      </div>
      {error && <p className="help" style={{ color: "#b3261e", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
