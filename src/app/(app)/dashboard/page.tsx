import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { finalPrice, isExpired } from "@/lib/quote";
import DashboardList, { type QuoteItem } from "./DashboardList";

export default async function Dashboard() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  // Admins see everything; members see their own quotes plus any shared ones.
  const quotes = await prisma.quote.findMany({
    where: isAdmin ? {} : { OR: [{ createdById: user.id }, { shared: true }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      proposalName: true,
      status: true,
      createdAt: true,
      createdById: true,
      computedTotal: true,
      overrideTotal: true,
      discount: true,
      shared: true,
      validFrom: true,
      customReasons: true,
      origin: true,
      signatureStatus: true,
      signatureSentAt: true,
      clientSignedAt: true,
      companySignedAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  const items: QuoteItem[] = quotes
    // Members don't see expired quotes at all - they can't open or price them,
    // so listing them only causes confusion. Admins still see everything.
    .filter((q) => isAdmin || !isExpired(q))
    .map((q) => {
    const expired = isExpired(q);
    return {
      id: q.id,
      code: q.code,
      name: q.proposalName,
      status: q.status,
      createdAt: q.createdAt.toISOString(),
      // Members don't see the price on expired quotes.
      price: q.status === "CUSTOM_PENDING" || (!isAdmin && expired) ? null : finalPrice(q),
      requestedBy: q.createdBy.name || q.createdBy.email,
      shared: q.shared,
      // A custom proposal: routed to a custom quote (has reasons) and/or was
      // given an admin override price, rather than auto-priced by the engine.
      custom: q.customReasons.length > 0 || q.overrideTotal != null,
      expired,
      origin: q.origin,
      mine: q.createdById === user.id,
      signed: Boolean(q.clientSignedAt && q.companySignedAt),
      // Member has accepted/signed, but Luna Creative's counter-signature is
      // still outstanding - shown distinctly so it's clearly mid-flow.
      awaitingCountersign: Boolean(q.clientSignedAt && !q.companySignedAt),
      // Sent out for signature, but no one has signed yet.
      sentForSignature: Boolean(
        q.signatureSentAt && !q.clientSignedAt && !q.companySignedAt && q.signatureStatus !== "DECLINED",
      ),
    };
  });

  return (
    <div className="container">
      <h1 style={{ marginBottom: 20 }}>Dashboard</h1>

      {items.length === 0 ? (
        <div className="card"><p>No quotes yet. <Link href="/new">Create your first quote →</Link></p></div>
      ) : (
        <DashboardList items={items} isAdmin={isAdmin} />
      )}
    </div>
  );
}
