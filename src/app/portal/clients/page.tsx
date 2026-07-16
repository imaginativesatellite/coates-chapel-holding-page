import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import ClientList, { type ClientRow } from "./ClientList";

// Always read fresh - a quote saved moments ago should appear immediately.
export const dynamic = "force-dynamic";

/**
 * Client-facing re-send list (Presentation Mode). Lives under /portal, so the
 * portal layout's guards (portal access + Presentation Mode) already apply. It
 * shows ONLY basic contact info for the operator's own client quotes - never any
 * price, scope, or other detail - so it's safe to have open in front of one
 * client while it lists others. Each row can re-send its quote to an address the
 * operator confirms (and may override) at send time.
 */
export default async function PortalClientsPage() {
  const user = await requireUser();

  const quotes = await prisma.quote.findMany({
    where: { createdById: user.id, origin: "CLIENT" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      proposalName: true,
      createdAt: true,
      clientPricing: true, // presence only → whether there's a price to send
      client: { select: { name: true, contactName: true, email: true, phone: true } },
      emailSends: {
        where: { status: "SENT" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const rows: ClientRow[] = quotes.map((qt) => ({
    id: qt.id,
    businessName: qt.proposalName || qt.client.name,
    contactName: qt.client.contactName,
    email: qt.client.email,
    phone: qt.client.phone,
    createdAt: qt.createdAt.toISOString(),
    // Custom quotes have no clientPricing snapshot and therefore no set price
    // to email - the row shows but its send button is disabled.
    sendable: qt.clientPricing != null,
    lastSentAt: qt.emailSends[0]?.createdAt.toISOString() ?? null,
  }));

  return <ClientList rows={rows} />;
}
