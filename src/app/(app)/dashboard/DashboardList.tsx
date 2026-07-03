"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Sparkles, Handshake, type LucideIcon } from "lucide-react";
import { fmtDate } from "@/lib/quote";
import PromoteButton from "./PromoteButton";

export type QuoteItem = {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
  price: number | null;
  requestedBy: string;
  shared: boolean;
  custom: boolean;
  expired: boolean;
  signed: boolean;
  awaitingCountersign: boolean;
  sentForSignature: boolean;
  // Which dashboard tab the quote belongs to.
  origin: "LUNA_REQUEST" | "CLIENT";
  // A Luna request that began life as a client-portal quote (handshake marker).
  convertedFromClient: boolean;
  // Client requested content help, so promoting must ask the content question.
  contentHelp: boolean;
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const fmtShortDate = (s: string) => fmtDate(s, { month: "short", day: "numeric" });

// Compact, muted icon that sits inline with the status tags and explains itself
// on hover (native tooltip via title). Used for at-a-glance properties of a
// quote that aren't workflow states - e.g. private, custom-priced.
function TagIcon({ Icon, label }: { Icon: LucideIcon; label: string }) {
  return (
    <span className="tag-icon" title={label} aria-label={label}>
      <Icon size={14} aria-hidden />
    </span>
  );
}

// Ready-made row icons. Exposed as components (rather than passing the icon as a
// prop) so server components - e.g. the admin UI reference page - can render
// them without passing a function across the server/client boundary.
export function PrivateIcon() {
  return <TagIcon Icon={Lock} label="Private — visible only to its creator and admins" />;
}
export function CustomIcon() {
  return <TagIcon Icon={Sparkles} label="Custom proposal — individually priced by Luna Creative" />;
}
export function ClientOriginIcon() {
  return <TagIcon Icon={Handshake} label="Started as a client quote — later requested from Luna Creative" />;
}

// Icons render first so they sit to the LEFT of the status tags within the
// right-aligned cluster. All quotes are proposals, so there's no
// "Proposal"/"Approved" tag - a ready quote shows no status tag. We surface only
// the states that mean something: awaiting approval and the signature flow.
// The custom-proposal icon is admin-only - members don't need to see it.
function badges(q: QuoteItem, isAdmin: boolean) {
  return (
    <>
      {q.convertedFromClient && <ClientOriginIcon />}
      {!q.shared && <PrivateIcon />}
      {q.custom && isAdmin && <CustomIcon />}
      {q.status === "CUSTOM_PENDING" && <span className="pill pending">Pending approval</span>}
      {q.signed && <span className="pill signed">Signed</span>}
      {!q.signed && q.awaitingCountersign && <span className="pill awaiting">Awaiting signature</span>}
      {!q.signed && !q.awaitingCountersign && q.sentForSignature && (
        <span className="pill awaiting">Sent for signature</span>
      )}
      {q.expired && <span className="pill expired">Expired</span>}
    </>
  );
}

function Row({ q, attention, locked, isAdmin }: { q: QuoteItem; attention?: boolean; locked: boolean; isAdmin: boolean }) {
  const inner = (
    <>
      <div className="main">
        <div className="name">{q.name}</div>
        <div className="meta">{fmtShortDate(q.createdAt)} · {q.requestedBy} · {q.code}</div>
      </div>
      <div className="right">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{badges(q, isAdmin)}</div>
        <div className="price">{q.price == null ? "-" : money(q.price)}</div>
      </div>
    </>
  );
  if (locked) return <div className="qrow" style={{ opacity: 0.65, cursor: "default" }}>{inner}</div>;
  const cls = `qrow${attention ? " attention" : q.signed ? " signed" : q.awaitingCountersign || q.sentForSignature ? " awaiting" : ""}`;
  return <Link href={`/quote/${q.id}`} className={cls}>{inner}</Link>;
}

function Tile({ q, attention, locked, isAdmin }: { q: QuoteItem; attention?: boolean; locked: boolean; isAdmin: boolean }) {
  const inner = (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{badges(q, isAdmin)}</div>
      <div className="name">{q.name}</div>
      <div className="price">{q.price == null ? "-" : money(q.price)}</div>
      <div className="meta">{fmtShortDate(q.createdAt)} · {q.requestedBy} · {q.code}</div>
    </>
  );
  if (locked) return <div className="qtile" style={{ opacity: 0.65, cursor: "default" }}>{inner}</div>;
  const cls = `qtile${attention ? " attention" : q.signed ? " signed" : q.awaitingCountersign || q.sentForSignature ? " awaiting" : ""}`;
  return <Link href={`/quote/${q.id}`} className={cls}>{inner}</Link>;
}

function Group({ items, view, isAdmin, attention }: { items: QuoteItem[]; view: "list" | "tiles"; isAdmin: boolean; attention?: boolean }) {
  const locked = (q: QuoteItem) => q.expired && !isAdmin;
  if (view === "tiles") {
    return (
      <div className="qtiles">
        {items.map((q) => <Tile key={q.id} q={q} attention={attention} locked={locked(q)} isAdmin={isAdmin} />)}
      </div>
    );
  }
  return <>{items.map((q) => <Row key={q.id} q={q} attention={attention} locked={locked(q)} isAdmin={isAdmin} />)}</>;
}

// Client-tab rows can't be whole-row <a> links because the "Request Quote from
// Luna Creative" button sits inside them (a button can't nest in an anchor) -
// so the row navigates via onClick instead, and the button cluster stops the
// click from bubbling. The name stays a real link for middle-click/a11y.
function ClientRow({ q, locked, isAdmin }: { q: QuoteItem; locked: boolean; isAdmin: boolean }) {
  const router = useRouter();
  return (
    <div
      className="qrow"
      style={{ cursor: locked ? "default" : "pointer", opacity: locked ? 0.65 : 1 }}
      onClick={locked ? undefined : () => router.push(`/quote/${q.id}`)}
    >
      <div className="main">
        {locked ? (
          <div className="name">{q.name}</div>
        ) : (
          <Link href={`/quote/${q.id}`} className="name" style={{ color: "inherit", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
            {q.name}
          </Link>
        )}
        <div className="meta">{fmtShortDate(q.createdAt)} · {q.requestedBy} · {q.code}</div>
      </div>
      <div className="right">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{badges(q, isAdmin)}</div>
        <div className="price">{q.price == null ? "-" : money(q.price)}</div>
        {!locked && (
          <div onClick={(e) => e.stopPropagation()}>
            <PromoteButton quoteId={q.id} contentHelp={q.contentHelp} />
          </div>
        )}
      </div>
    </div>
  );
}

function ClientTile({ q, locked, isAdmin }: { q: QuoteItem; locked: boolean; isAdmin: boolean }) {
  const router = useRouter();
  return (
    <div
      className="qtile"
      style={{ cursor: locked ? "default" : "pointer", opacity: locked ? 0.65 : 1 }}
      onClick={locked ? undefined : () => router.push(`/quote/${q.id}`)}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{badges(q, isAdmin)}</div>
      {locked ? (
        <div className="name">{q.name}</div>
      ) : (
        <Link href={`/quote/${q.id}`} className="name" style={{ color: "inherit", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
          {q.name}
        </Link>
      )}
      <div className="price">{q.price == null ? "-" : money(q.price)}</div>
      <div className="meta">{fmtShortDate(q.createdAt)} · {q.requestedBy} · {q.code}</div>
      {!locked && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          <PromoteButton quoteId={q.id} contentHelp={q.contentHelp} />
        </div>
      )}
    </div>
  );
}

function ClientGroup({ items, view, isAdmin }: { items: QuoteItem[]; view: "list" | "tiles"; isAdmin: boolean }) {
  const locked = (q: QuoteItem) => q.expired && !isAdmin;
  if (view === "tiles") {
    return (
      <div className="qtiles">
        {items.map((q) => <ClientTile key={q.id} q={q} locked={locked(q)} isAdmin={isAdmin} />)}
      </div>
    );
  }
  return <>{items.map((q) => <ClientRow key={q.id} q={q} locked={locked(q)} isAdmin={isAdmin} />)}</>;
}

export default function DashboardList({ items, isAdmin, showTabs = false }: { items: QuoteItem[]; isAdmin: boolean; showTabs?: boolean }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "tiles">("list");
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<"luna" | "client">("luna");

  // Remember the member's list/tile choice across visits so they don't have to
  // re-pick it every time. Read once on mount; write whenever it changes.
  useEffect(() => {
    const saved = window.localStorage.getItem("dashboardView");
    if (saved === "list" || saved === "tiles") setView(saved);
  }, []);
  const chooseView = (v: "list" | "tiles") => {
    setView(v);
    window.localStorage.setItem("dashboardView", v);
  };

  // On mobile, always use the list view (no tile toggle).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const effectiveView = isMobile ? "list" : view;

  // Split by origin so the two tabs each show their own quotes. When tabs are
  // off (non-portal members), everything is a Luna request anyway.
  const lunaItems = useMemo(() => items.filter((i) => i.origin !== "CLIENT"), [items]);
  const clientItems = useMemo(() => items.filter((i) => i.origin === "CLIENT"), [items]);
  const base = !showTabs ? items : tab === "client" ? clientItems : lunaItems;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? base.filter((i) => i.name.toLowerCase().includes(q)) : base;
  }, [base, query]);

  // Top section = anything where the next move is Luna Creative's: a custom
  // quote awaiting pricing/approval, or a proposal the member signed that still
  // needs Luna's counter-signature. (awaitingCountersign already implies the
  // member has signed and Luna hasn't.)
  const needsLuna = (i: QuoteItem) => i.status === "CUSTOM_PENDING" || i.awaitingCountersign;
  const pending = filtered.filter(needsLuna);
  const rest = filtered.filter((i) => !needsLuna(i));

  const onClientTab = showTabs && tab === "client";

  return (
    <>
      {showTabs && (
        <div className="admin-tabs" role="tablist" aria-label="Quote source">
          <button type="button" role="tab" aria-selected={tab === "luna"} className={tab === "luna" ? "active" : ""} onClick={() => setTab("luna")}>
            Luna Creative requests · {lunaItems.length}
          </button>
          <button type="button" role="tab" aria-selected={tab === "client"} className={tab === "client" ? "active" : ""} onClick={() => setTab("client")}>
            Client quotes · {clientItems.length}
          </button>
        </div>
      )}

      <div className="searchbar">
        <div className="search-field">
          <span className="icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <input type="search" placeholder="Search by client…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {!isMobile && (
          <div className="viewtoggle">
            <button type="button" className={view === "list" ? "on" : ""} onClick={() => chooseView("list")} title="List view" aria-label="List view">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
            <button type="button" className={view === "tiles" ? "on" : ""} onClick={() => chooseView("tiles")} title="Tile view" aria-label="Tile view">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" /><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          </div>
        )}

        <Link href="/new" className="btn-primary" style={{ flex: "none", whiteSpace: "nowrap" }}>+ New Quote</Link>
      </div>

      {filtered.length === 0 && (
        <div className="card">
          <p className="help">
            {query
              ? "No quotes match."
              : onClientTab
                ? "No client quotes yet. Generate one in Presentation Mode."
                : "No quotes yet."}
          </p>
        </div>
      )}

      {onClientTab ? (
        filtered.length > 0 && (
          <section>
            <div className="section-label">All client quotes</div>
            <ClientGroup items={filtered} view={effectiveView} isAdmin={isAdmin} />
          </section>
        )
      ) : (
        <>
          {pending.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <div className="section-label attention">{isAdmin ? "Needs attention" : "Awaiting Luna Creative"} · {pending.length}</div>
              <Group items={pending} view={effectiveView} isAdmin={isAdmin} attention />
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <div className="section-label">All quotes</div>
              <Group items={rest} view={effectiveView} isAdmin={isAdmin} />
            </section>
          )}
        </>
      )}
    </>
  );
}
