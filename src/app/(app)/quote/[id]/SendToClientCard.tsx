"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { sendQuoteToClientById } from "@/app/portal/actions";

/**
 * Internal-app entry point for emailing the client-facing quote straight to the
 * end client - the same capability as the Presentation-Mode client list, but on
 * the quote's own page so a member can send without first entering Presentation
 * Mode. It reuses `sendQuoteToClientById`, so it surfaces ONLY the client price
 * (Luna + markup - discount), never Luna's underlying number and never a PDF,
 * and every send is logged to the "Client email history" card below.
 *
 * The address is pre-filled from the client's saved contact but editable: a
 * changed address delivers THIS send there without altering the saved contact
 * (a one-off override, matching the client-list behavior).
 *
 * Shown on any proposal the viewer can open, but the send is disabled - with a
 * reason - when there's no client email on file (`hasClientInfo`) or no client-
 * facing price to send yet (`hasPrice`).
 */
export default function SendToClientCard({
  quoteId,
  defaultEmail,
  businessName,
  hasClientInfo,
  hasPrice,
}: {
  quoteId: string;
  defaultEmail: string;
  businessName: string;
  hasClientInfo: boolean;
  hasPrice: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sending, startSending] = useTransition();

  // Why sending is unavailable (if it is) - drives the disabled state + note.
  const blockedReason = !hasClientInfo
    ? "Add a client email to this proposal before it can be sent."
    : !hasPrice
      ? "This proposal has no client-facing price to send yet."
      : null;
  const blocked = blockedReason !== null;

  const send = () => {
    setMsg(null);
    const to = email.trim();
    startSending(async () => {
      const res = await sendQuoteToClientById(quoteId, to);
      if ("error" in res) setMsg({ text: res.error, ok: false });
      else {
        setMsg({ text: `Sent to ${to}.`, ok: true });
        // Pull in the new row on the "Client email history" card below.
        router.refresh();
      }
    });
  };

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Email quote to client</div>
      <p className="help" style={{ marginTop: 0, marginBottom: 10 }}>
        Sends the client-facing price (your markup included) from Droptine Studios &mdash; no Luna
        pricing, no breakdown, no PDF. Sending to a changed address delivers this quote there without
        altering {businessName}&rsquo;s saved contact.
      </p>
      <label className="qlabel" htmlFor="send-to-client">Send to</label>
      <input
        id="send-to-client"
        type="email"
        value={email}
        disabled={blocked || sending}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="client@example.com"
      />
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn-good"
          disabled={blocked || sending || email.trim() === ""}
          onClick={send}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Mail size={15} aria-hidden /> {sending ? "Sending…" : "Send to client"}
        </button>
      </div>
      {blockedReason && (
        <p className="help" style={{ marginTop: 8 }}>{blockedReason}</p>
      )}
      {msg && (
        <p style={{ marginTop: 8, fontSize: "0.88rem", color: msg.ok ? "var(--good)" : "#b3261e" }}>{msg.text}</p>
      )}
    </div>
  );
}
