"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, SlidersHorizontal, Mail, CheckCircle, LineChart, Download, Palette, type LucideIcon } from "lucide-react";

// Secondary navigation for the admin area. Rendered by the admin layout so it
// persists across every admin page and highlights the active section.
const TABS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/users", label: "Users", Icon: Users },
  { href: "/pricing-rules", label: "Logic", Icon: SlidersHorizontal },
  { href: "/emails", label: "Emails", Icon: Mail },
  { href: "/tests", label: "Tests", Icon: CheckCircle },
  { href: "/pricing-preview", label: "Pricing Preview", Icon: LineChart },
  { href: "/export", label: "Export", Icon: Download },
  { href: "/ui", label: "UI", Icon: Palette },
];

export default function AdminTabs() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // When the bar overflows (narrow screens), keep the active tab centered so
  // the current section is always in view rather than clipped at an edge.
  useEffect(() => {
    const bar = barRef.current;
    const active = bar?.querySelector<HTMLElement>("a.active");
    if (!bar || !active) return;
    const target = active.offsetLeft - (bar.clientWidth - active.clientWidth) / 2;
    bar.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [pathname]);

  return (
    <div className="admin-tabs" ref={barRef}>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={isActive(t.href) ? "active" : ""}>
          <t.Icon size={15} aria-hidden /> {t.label}
        </Link>
      ))}
    </div>
  );
}
