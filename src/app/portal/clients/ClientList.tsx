"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Mail, Check } from "lucide-react";
import { fmtDate } from "@/lib/quote";
import { sendQuoteToClientById } from "../actions";

export type ClientRow = {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string; // ISO
  sendable: boolean;
  lastSentAt: string | null; // ISO or null
};

/**
 * The list itself. Deliberately shows only contact info (business + contact
 * name, email, phone) - never a price. "Email quote" reveals the destination
 * address, pre-filled from the client's saved email but editable: sending to a
 * changed address delivers THIS quote there without altering the client's saved
 * contact.
 */
export default function ClientList({ rows }: { rows: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [sending, startSending] = useTransition();

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.businessName.toLowerCase().includes(s) ||
        (r.contactName ?? "").toLowerCase().includes(s) ||
        (r.email ?? "").toLowerCase().includes(s),
    );
  }, [query, rows]);

  const open = (r: ClientRow) => {
    setMsg(null);
    setDraftEmail(r.email ?? "");
    setOpenId(r.id);
  };
  const send = (id: string) => {
    setMsg(null);
    const to = draftEmail.trim();
    startSending(async () => {
      const res = await sendQuoteToClientById(id, to);
      if ("error" in res) setMsg({ id, text: res.error, ok: false });
      else {
        setMsg({ id, text: `Sent to ${to}.`, ok: true });
        setOpenId(null);
      }
    });
  };

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: 14 }}>Your clients</h1>

      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={16} aria-hidden style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          aria-label="Search your clients"
          style={{ paddingLeft: 32 }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="help">{rows.length === 0 ? "No client quotes yet." : "No matches."}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((r) => (
            <li key={r.id} className="card" style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: "1rem" }}>{r.businessName}</strong>
                {r.lastSentAt && (
                  <span
                    title={`Last emailed ${fmtDate(r.lastSentAt)}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.78rem", color: "var(--good)" }}
                  >
                    <Check size={13} aria-hidden /> Sent
                  </span>
                )}
              </div>
              {(r.contactName || r.phone || r.email) && (
                <div style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 2 }}>
                  {[r.contactName, r.phone, r.email].filter(Boolean).join(" · ")}
                </div>
              )}

              {openId === r.id ? (
                <div style={{ marginTop: 10 }}>
                  <label className="qlabel" htmlFor={`to-${r.id}`}>Send to</label>
                  <input
                    id={`to-${r.id}`}
                    type="email"
                    value={draftEmail}
                    onChange={(e) => setDraftEmail(e.target.value)}
                    placeholder="client@example.com"
                  />
                  <p className="help" style={{ marginTop: 6 }}>
                    Sends this quote to this address only — it doesn&rsquo;t change {r.businessName}&rsquo;s saved contact.
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn-good" disabled={sending || draftEmail.trim() === ""} onClick={() => send(r.id)}>
                      {sending ? "Sending…" : "Send"}
                    </button>
                    <button type="button" className="pr-restart" onClick={() => setOpenId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!r.sendable}
                    onClick={() => open(r)}
                    title={r.sendable ? undefined : "This is a custom quote with no set price yet."}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Mail size={15} aria-hidden /> {r.sendable ? "Email quote" : "No price to send"}
                  </button>
                </div>
              )}

              {msg?.id === r.id && (
                <p style={{ marginTop: 8, fontSize: "0.88rem", color: msg.ok ? "var(--good)" : "#b3261e" }}>{msg.text}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
