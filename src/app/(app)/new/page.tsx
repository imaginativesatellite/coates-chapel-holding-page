import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import NewQuoteForm from "./NewQuoteForm";

export default async function NewQuotePage() {
  const user = await requireUser();
  // Initial visibility comes from the per-member default an admin sets on the
  // Users tab; the creator can still flip it per quote.
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { quotesDefaultPrivate: true } });
  const defaultShared = !(me?.quotesDefaultPrivate ?? false);

  // Suggest client names that still have at least one quote - but only names
  // this member is allowed to see (their own quotes + shared ones), so one
  // member's private client list never leaks into another's autocomplete.
  const named = await prisma.quote.findMany({
    where: user.role === "ADMIN" ? {} : { OR: [{ createdById: user.id }, { shared: true }] },
    select: { proposalName: true },
    distinct: ["proposalName"],
    orderBy: { proposalName: "asc" },
  });

  return (
    <div className="container">
      <NewQuoteForm clientNames={named.map((q) => q.proposalName)} defaultShared={defaultShared} />
    </div>
  );
}
