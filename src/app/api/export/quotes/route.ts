import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { finalPrice } from "@/lib/quote";
import { priceQuote, type PricingAnswers } from "@/lib/pricing";

function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  // Excel/Sheets treat leading =, +, -, @ as a formula - neutralize
  // user-supplied text (client names) so a crafted name can't execute.
  // Numbers are passed as numbers, so negatives stay clean.
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A readable summary of what was selected + each item's price. */
function breakdown(answers: PricingAnswers): string {
  const r = priceQuote(answers);
  if (r.requiresCustomQuote) return `CUSTOM: ${r.reasons.join("; ")}`;
  return r.lineItems.map((li) => `${li.label} $${li.amount}`).join(" | ");
}

export async function GET() {
  // Re-read the role from the DB (like requireAdmin) so a demoted admin's
  // still-valid 90-day JWT can't keep exporting every quote.
  const session = await auth();
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  if (user?.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: true },
  });

  const header = [
    "Created", "Client", "Owner", "Status", "Origin", "Code",
    "Computed", "Override", "Discount", "Final", "ActualCharged", "Monthly", "Breakdown",
  ];
  const rows = quotes.map((q) => [
    new Date(q.createdAt).toISOString().slice(0, 10),
    q.proposalName,
    q.createdBy.email,
    q.status,
    // CLIENT rows' Computed/Final are the client-facing price (Luna + markup).
    q.origin,
    q.code,
    q.computedTotal,
    q.overrideTotal ?? "",
    q.discount,
    q.status === "CUSTOM_PENDING" ? "" : finalPrice(q),
    q.actualCharged ?? "",
    q.monthly,
    breakdown(q.answers as unknown as PricingAnswers),
  ]);

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="droptine-quotes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
