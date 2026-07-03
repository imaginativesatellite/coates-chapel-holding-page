import type { Prisma, Quote, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { companyEmail } from "@/lib/documenso";
import { notifyClientSigned, notifyFullySigned } from "@/lib/email";
import { appUrl } from "@/lib/quote";

export type SignatureRecipient = {
  email?: string;
  signingStatus?: string;
  signedAt?: string | null;
};

type QuoteWithCreator = Quote & { createdBy: User };

/**
 * Recomputes a quote's signature status/timestamps from a Documenso
 * recipients array and fires the same side-effect notifications a fresh
 * client signature or full completion triggers.
 *
 * Shared by the webhook handler (recipients from a push delivery) and the
 * admin "Sync from Documenso" action (recipients from a pulled envelope
 * status) so the two paths can never compute a different result for the
 * same Documenso state.
 */
export async function syncSignatureFromRecipients(
  quote: QuoteWithCreator,
  recipients: SignatureRecipient[],
  meta: unknown,
): Promise<{ signatureStatus: string }> {
  // The first party who signs is the member the proposal was prepared for
  // (Droptine), not their downstream client. We identify them as the recipient
  // that ISN'T the shared company identity, so this works regardless of which
  // email the envelope was addressed to.
  const company = recipients.find((r) => r.email?.toLowerCase() === companyEmail().toLowerCase());
  const member = recipients.find((r) => r.email && r.email.toLowerCase() !== companyEmail().toLowerCase());

  const status = (r?: SignatureRecipient) => (r?.signingStatus ?? "").toUpperCase();
  const clientSignedAt = status(member) === "SIGNED" ? new Date(member!.signedAt ?? Date.now()) : quote.clientSignedAt;
  const companySignedAt = status(company) === "SIGNED" ? new Date(company!.signedAt ?? Date.now()) : quote.companySignedAt;

  const declined = recipients.some((r) => ["REJECTED", "DECLINED"].includes(status(r)));
  const signatureStatus = declined
    ? "DECLINED"
    : clientSignedAt && companySignedAt
    ? "SIGNED"
    : clientSignedAt || companySignedAt
    ? "PARTIALLY_SIGNED"
    : "SENT";

  // Transitions we react to, computed against the state we had BEFORE this update.
  const memberJustSigned = !quote.clientSignedAt && Boolean(clientSignedAt);
  const wasFullySigned = Boolean(quote.clientSignedAt && quote.companySignedAt);
  const nowFullySigned = Boolean(clientSignedAt && companySignedAt);
  const justFullySigned = !wasFullySigned && nowFullySigned;

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      signatureStatus,
      clientSignedAt,
      companySignedAt,
      signatureMeta: meta as Prisma.InputJsonValue,
    },
  });

  // Member signed, but the company signature is still outstanding: ask an admin
  // to sign (this proposal needs both signatures).
  if (memberJustSigned && !companySignedAt) {
    try {
      await notifyClientSigned({
        proposalName: quote.proposalName,
        requestedByName: quote.createdBy.name ?? quote.createdBy.email,
        clientEmail: member?.email ?? quote.createdBy.email,
        manageUrl: `${appUrl()}/quote/${quote.id}`,
        code: quote.publicCode,
      });
    } catch {
      // The signature state is already saved - don't let a notification failure affect the caller.
    }
  }

  // Both parties have now signed: tell everyone it's complete. The email links
  // to the PDF route, which serves the signed copy once status is SIGNED.
  if (justFullySigned) {
    try {
      await notifyFullySigned({
        proposalName: quote.proposalName,
        memberName: quote.createdBy.name ?? quote.createdBy.email,
        memberEmail: quote.createdBy.email,
        code: quote.publicCode,
      });
    } catch {
      // Notification failure must not affect the caller.
    }
  }

  return { signatureStatus };
}
