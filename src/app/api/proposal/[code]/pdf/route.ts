import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { renderProposalPdf } from "@/lib/pdf";
import { buildProposalData } from "@/lib/proposal-data";
import { downloadSignedPdf } from "@/lib/documenso";
import { isExpired } from "@/lib/quote";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  // The proposal PDF is no longer public - it's only downloadable from inside
  // the app, so an unauthenticated request is bounced to the login page.
  const session = await auth();
  if (!session?.user?.id) return Response.redirect(new URL("/login", req.url), 302);

  // Re-read the user from the DB (like requireUser) so a deleted account or a
  // demoted role can't keep using a still-valid 90-day JWT.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (!user) return Response.redirect(new URL("/login", req.url), 302);

  const { code } = await params;
  const quote = await prisma.quote.findUnique({ where: { publicCode: code }, include: { client: true, createdBy: true } });

  // Custom quotes have no proposal until approved; client-portal quotes are an
  // on-screen number only (no proposal until promoted); expired links stop working.
  if (!quote || quote.status === "CUSTOM_PENDING" || quote.origin === "CLIENT" || isExpired(quote)) {
    return new Response("Not found", { status: 404 });
  }

  // Same visibility rules as the quote page: private to the creator (and
  // admins) unless shared - knowing the link isn't enough.
  if (user.role !== "ADMIN" && quote.createdById !== user.id && !quote.shared) {
    return new Response("Not found", { status: 404 });
  }

  // Once both parties have signed, hand back the fully signed copy rather than a
  // fresh render. Falls back to the rendered proposal if it can't be retrieved.
  const signed = quote.signatureStatus === "SIGNED" && quote.signatureEnvelopeId
    ? await downloadSignedPdf(quote.signatureEnvelopeId)
    : null;
  const pdf = signed ?? (await renderProposalPdf(buildProposalData(quote)));
  const filename = signed
    ? `${quote.proposalName.replace(/[^a-z0-9]+/gi, "-")}-signed.pdf`
    : `${quote.proposalName.replace(/[^a-z0-9]+/gi, "-")}-proposal.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
