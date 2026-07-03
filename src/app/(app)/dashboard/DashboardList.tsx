"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lock, Sparkles, Handshake, Filter, type LucideIcon } from "lucide-react";
import { fmtDate } from "@/lib/quote";

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
  // Provenance: CLIENT = created in Presentation Mode (handshake icon).
  origin: "LUNA_REQUEST" | "CLIENT";
  // Created by the viewing user (drives the "Mine only" filter).
  mine: boolean;
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
  return <TagIcon Icon={Handshake} label="Created in Presentation Mode — quoted to the client in person" />;
}

// Icons render first so they sit to the LEFT of the status tags within the
// right-aligned cluster. All quotes are proposals, so there's no
// "Proposal"/"Approved" tag - a ready quote shows no status tag. We surface only
// the states that mean something: awaiting approval and the signature flow.
// The custom-proposal icon is admin-only - members don't need to see it.
function badges(q: QuoteItem, isAdmin: boolean) {
  return (
    <>
      {q.origin === "CLIENT" && <ClientOriginIcon />}
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

// --- Dashboard filters (persisted per device, restored on every visit) ---

type StatusFilter = "all" | "attention" | "signature" | "signed" | "quiet";
type SourceFilter = "all" | "client" | "standard";
type Filters = { status: StatusFilter; source: SourceFilter; mineOnly: boolean; showExpired: boolean };

const DEFAULT_FILTERS: Filters = { status: "all", source: "all", mineOnly: false, showExpired: true };
const FILTERS_KEY = "dashboardFilters";

function matchesStatus(q: QuoteItem, s: StatusFilter): boolean {
  switch (s) {
    case "all": return true;
    case "attention": return q.status === "CUSTOM_PENDING" || q.awaitingCountersign;
    case "signature": return q.sentForSignature || q.awaitingCountersign;
    case "signed": return q.signed;
    case "quiet": return q.status !== "CUSTOM_PENDING" && !q.signed && !q.awaitingCountersign && !q.sentForSignature && !q.expired;
  }
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`fil-chip${on ? " on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function DashboardList({ items, isAdmin }: { items: QuoteItem[]; isAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "tiles">("list");
  const [isMobile, setIsMobile] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // Remember the member's list/tile choice AND filters across visits so they
  // don't have to re-pick every time. Read once on mount; write on change.
  useEffect(() => {
    const saved = window.localStorage.getItem("dashboardView");
    if (saved === "list" || saved === "tiles") setView(saved);
    try {
      const raw = window.localStorage.getItem(FILTERS_KEY);
      if (raw) setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(raw) });
    } catch {}
    loaded.current = true;
  }, []);
  const chooseView = (v: "list" | "tiles") => {
    setView(v);
    window.localStorage.setItem("dashboardView", v);
  };
  const setFilter = (patch: Partial<Filters>) =>
    setFilters((f) => {
      const next = { ...f, ...patch };
      try { window.localStorage.setItem(FILTERS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

  // Close the filter popover on any outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // On mobile, always use the list view (no tile toggle).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const effectiveView = isMobile ? "list" : view;

  const filtersActive =
    filters.status !== "all" || filters.source !== "all" || filters.mineOnly || (isAdmin && !filters.showExpired);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (!matchesStatus(i, filters.status)) return false;
      if (filters.source === "client" && i.origin !== "CLIENT") return false;
      if (filters.source === "standard" && i.origin === "CLIENT") return false;
      if (filters.mineOnly && !i.mine) return false;
      if (isAdmin && !filters.showExpired && i.expired) return false;
      return true;
    });
  }, [items, query, filters, isAdmin]);

  // Top section = anything where the next move is Luna Creative's: a custom
  // quote awaiting pricing/approval, or a proposal the member signed that still
  // needs Luna's counter-signature. (awaitingCountersign already implies the
  // member has signed and Luna hasn't.)
  const needsLuna = (i: QuoteItem) => i.status === "CUSTOM_PENDING" || i.awaitingCountersign;
  const pending = filtered.filter(needsLuna);
  const rest = filtered.filter((i) => !needsLuna(i));

  return (
    <>
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

        {/* Filter popover - lives where the view toggle used to; the view
            toggle now sits inside it (still desktop-only). */}
        <div className="filterwrap" ref={filterRef}>
          <button
            type="button"
            className={`filterbtn${filterOpen ? " open" : ""}`}
            onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            aria-label="Filters"
            title="Filters"
          >
            <Filter size={16} aria-hidden />
            {filtersActive && <span className="dot" aria-hidden />}
          </button>
          {filterOpen && (
            <div className="filter-pop">
              <div className="fil-label">Status</div>
              <div className="fil-opts">
                <FilterChip on={filters.status === "all"} onClick={() => setFilter({ status: "all" })}>All</FilterChip>
                <FilterChip on={filters.status === "attention"} onClick={() => setFilter({ status: "attention" })}>Needs attention</FilterChip>
                <FilterChip on={filters.status === "signature"} onClick={() => setFilter({ status: "signature" })}>Awaiting signature</FilterChip>
                <FilterChip on={filters.status === "signed"} onClick={() => setFilter({ status: "signed" })}>Signed</FilterChip>
                <FilterChip on={filters.status === "quiet"} onClick={() => setFilter({ status: "quiet" })}>No outstanding state</FilterChip>
              </div>

              <div className="fil-label">Source</div>
              <div className="fil-opts">
                <FilterChip on={filters.source === "all"} onClick={() => setFilter({ source: "all" })}>All</FilterChip>
                <FilterChip on={filters.source === "client"} onClick={() => setFilter({ source: "client" })}>Presentation Mode</FilterChip>
                <FilterChip on={filters.source === "standard"} onClick={() => setFilter({ source: "standard" })}>Standard</FilterChip>
              </div>

              <label className="fil-switch">
                <span className="switch">
                  <input type="checkbox" checked={filters.mineOnly} onChange={(e) => setFilter({ mineOnly: e.target.checked })} />
                  <span className="slider" />
                </span>
                <span>My quotes only</span>
              </label>

              {isAdmin && (
                <label className="fil-switch">
                  <span className="switch">
                    <input type="checkbox" checked={filters.showExpired} onChange={(e) => setFilter({ showExpired: e.target.checked })} />
                    <span className="slider" />
                  </span>
                  <span>Show expired</span>
                </label>
              )}

              {!isMobile && (
                <>
                  <div className="fil-label" style={{ marginTop: 12 }}>Layout</div>
                  <div className="fil-opts">
                    <FilterChip on={view === "list"} onClick={() => chooseView("list")}>List</FilterChip>
                    <FilterChip on={view === "tiles"} onClick={() => chooseView("tiles")}>Tiles</FilterChip>
                  </div>
                </>
              )}

              {filtersActive && (
                <button type="button" className="jump-link" style={{ marginTop: 8 }} onClick={() => setFilter(DEFAULT_FILTERS)}>
                  Reset filters
                </button>
              )}
            </div>
          )}
        </div>

        <Link href="/new" className="btn-primary" style={{ flex: "none", whiteSpace: "nowrap" }}>+ New Quote</Link>
      </div>

      {filtered.length === 0 && (
        <div className="card">
          <p className="help">{query || filtersActive ? "No quotes match the search/filters." : "No quotes yet."}</p>
        </div>
      )}

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
  );
}
