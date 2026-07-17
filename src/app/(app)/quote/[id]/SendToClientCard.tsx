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
 * (a one-off override, matching the client-list behavior). Only rendered for
 * Presentation-Mode (CLIENT-origin) quotes that already have a set price.
 */
export default function SendToClientCard({
  quoteId,
  defaultEmail,
  businessName,
}: {
  quoteId: string;
  defaultEmail: string;
  businessName: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sending, startSending] = useTransition();

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
        onChange={(e) => setEmail(e.target.value)}
        placeholder="client@example.com"
      />
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn-good"
          disabled={sending || email.trim() === ""}
          onClick={send}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Mail size={15} aria-hidden /> {sending ? "Sending…" : "Send to client"}
        </button>
      </div>
      {msg && (
        <p style={{ marginTop: 8, fontSize: "0.88rem", color: msg.ok ? "var(--good)" : "#b3261e" }}>{msg.text}</p>
      )}
    </div>
  );
}
