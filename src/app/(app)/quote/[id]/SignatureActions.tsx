"use client";

import { useEffect, useRef, useState, useTransition } from "react";
// SVG-only light build: no CDN, no WASM - everything ships in the bundle, so
// it works on booth wifi. The JSON is extracted from the committed
// public/animations/checkwhite.lottie (a .lottie is a zip around this JSON).
import lottie from "lottie-web/build/player/lottie_light";
import animationData from "@/animations/signature-sent.json";
import { requestSignature, sendForSignature } from "./actions";

// How long the "sent" confirmation (animation + text) stays on screen before
// settling back to the button (which then reads "Resend for signature").
// ~4s: long enough to read the line, short enough not to feel stuck.
const HOLD_MS = 4000;

/**
 * The success animation: the checkwhite Lottie, played once. The artwork is a
 * pure white check, so it sits on a green circular badge (see .sig-lottie) to
 * stay visible on the white card.
 */
function SuccessCheck() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const anim = lottie.loadAnimation({
      container: ref.current!,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData,
    });
    return () => anim.destroy();
  }, []);
  return <span className="sig-lottie" ref={ref} aria-hidden />;
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

// One-time challenge before the FIRST signature send on a Presentation-Mode
// quote where the client asked for content help: the member confirms whether
// Droptine actually provides it ("No" removes the -$500 and re-prices).
const CONTENT_QUESTION = "The client asked for content help. Will Droptine be providing it to Luna Creative?";

function ContentConfirmPanel({
  pending,
  onAnswer,
  onCancel,
}: {
  pending: boolean;
  onAnswer: (providedByDroptine: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <div className="promote-ask">
      <p className="promote-ask-q">{CONTENT_QUESTION}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending} style={{ padding: "6px 14px", fontSize: "0.85rem" }}>Cancel</button>
        <button type="button" className="btn-secondary" onClick={() => onAnswer(false)} disabled={pending} style={{ padding: "6px 14px", fontSize: "0.85rem" }}>No</button>
        <button type="button" className="btn-primary" onClick={() => onAnswer(true)} disabled={pending} style={{ padding: "6px 14px", fontSize: "0.85rem" }}>Yes</button>
      </div>
    </div>
  );
}

/** Member one-click "Accept & sign" with a held success confirmation. When
 *  the content-help challenge is still open, it interposes once. */
export function RequestSignatureButton({
  quoteId,
  resend,
  email,
  needsContentConfirm = false,
}: {
  quoteId: string;
  resend: boolean;
  email: string;
  needsContentConfirm?: boolean;
}) {
  const { pending, sent, error, run } = useSendPhases();
  const [asking, setAsking] = useState(false);

  if (sent) {
    return (
      <div className="sig-done" role="status">
        <SuccessCheck />
        <span>Sent for signature - check {email}</span>
      </div>
    );
  }
  if (asking) {
    return (
      <>
        <ContentConfirmPanel
          pending={pending}
          onCancel={() => setAsking(false)}
          onAnswer={(provided) => { setAsking(false); run(() => requestSignature(quoteId, provided)); }}
        />
        {error && <p className="help" style={{ color: "#b3261e", marginTop: 8 }}>{error}</p>}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn-gold"
        disabled={pending}
        onClick={() => (needsContentConfirm ? setAsking(true) : run(() => requestSignature(quoteId)))}
      >
        {pending ? "Sending…" : resend ? "Resend for signature" : "Accept & sign"}
      </button>
      {error && <p className="help" style={{ color: "#b3261e", marginTop: 8 }}>{error}</p>}
    </>
  );
}

/** Admin send-for-signature form (editable signer email) with the same
 *  held success confirmation and content challenge. */
export function SendForSignatureForm({
  quoteId,
  defaultEmail,
  resend,
  needsContentConfirm = false,
}: {
  quoteId: string;
  defaultEmail: string;
  resend: boolean;
  needsContentConfirm?: boolean;
}) {
  const { pending, sent, error, run } = useSendPhases();
  const [email, setEmail] = useState(defaultEmail);
  const [asking, setAsking] = useState(false);

  if (sent) {
    return (
      <div className="sig-done" role="status">
        <SuccessCheck />
        <span>Sent to {email} for signature</span>
      </div>
    );
  }
  if (asking) {
    return (
      <>
        <ContentConfirmPanel
          pending={pending}
          onCancel={() => setAsking(false)}
          onAnswer={(provided) => { setAsking(false); run(() => sendForSignature(quoteId, email, provided)); }}
        />
        {error && <p className="help" style={{ color: "#b3261e", marginTop: 8 }}>{error}</p>}
      </>
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
          onClick={() => (needsContentConfirm ? setAsking(true) : run(() => sendForSignature(quoteId, email)))}
        >
          {pending ? "Sending…" : resend ? "Resend for signature" : "Send for signature"}
        </button>
      </div>
      {error && <p className="help" style={{ color: "#b3261e", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
