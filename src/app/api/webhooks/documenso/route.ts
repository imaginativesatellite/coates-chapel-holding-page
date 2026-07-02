import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { syncSignatureFromRecipients, type SignatureRecipient } from "@/lib/signature-sync";

/**
 * Documenso webhook receiver - updates Quote signature status as the client
 * and the shared company recipient view/sign/decline. Configure this URL
 * (https://<your-app>/api/webhooks/documenso) in your Documenso instance's
 * webhook settings.
 *
 * Payload shape confirmed from live deliveries: `event` (e.g.
 * "DOCUMENT_SIGNED") plus a `payload` object whose `id` is a numeric
 * "document" id and whose `recipients[]` carry signingStatus/signedAt/token.
 *
 * We deliberately don't look up the Quote by `payload.id`: the v2
 * envelope-create/distribute response we store as signatureEnvelopeId returns
 * a string envelope id (e.g. "envelope_xxx"), but webhook deliveries carry a
 * different, legacy numeric document id - the two never match. Instead we
 * match by recipient `token`, which is the same value on both the
 * create/distribute response (stored as clientSigningToken/
 * companySigningToken) and every webhook delivery.
 *
 * A delivery can still be missed entirely (instance restart, network blip,
 * webhook misconfigured) - the admin "Sync from Documenso" button on the
 * quote page (see syncSignatureStatus in quote/[id]/actions.ts) is the
 * fallback for that case; it pulls the same recipients shape from Documenso's
 * GET /api/v2/envelope/{id} and re-syncs through the same
 * syncSignatureFromRecipients helper this webhook uses, so the two paths
 * can't disagree.
 */

const WEBHOOK_SECRET = process.env.DOCUMENSO_WEBHOOK_SECRET;

/** Constant-time comparison so a forged header can't be brute-forced one byte
 *  at a time via response-time differences. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

type DocumensoWebhookPayload = {
  event?: string;
  payload?: {
    id?: number | string;
    status?: string;
    recipients?: (SignatureRecipient & { token?: string })[];
  };
};

export async function POST(req: Request) {
  // Fail closed: without a shared secret, anyone who finds this URL could
  // forge recipient states (signed/declined) and flip quote statuses. Set the
  // same value as DOCUMENSO_WEBHOOK_SECRET here and in the Documenso
  // instance's webhook settings; deliveries are rejected until then.
  if (!WEBHOOK_SECRET) {
    console.error(
      "[documenso webhook] DOCUMENSO_WEBHOOK_SECRET is not set - rejecting delivery. " +
        "Set it in the environment AND as the webhook secret in Documenso's settings.",
    );
    return new Response("Webhook secret not configured", { status: 503 });
  }
  const provided = req.headers.get("x-documenso-secret") ?? "";
  if (!safeEqual(provided, WEBHOOK_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as DocumensoWebhookPayload;
  const envelope = body.payload;
  const recipients = envelope?.recipients ?? [];
  // Log status only - a recipient token is their signing URL, so it must
  // never land in the deploy logs.
  console.log(
    "[documenso webhook] event=", body.event, "envelope.id=", envelope?.id,
    "recipients=", recipients.map((r) => ({ email: r.email, signingStatus: r.signingStatus, signedAt: r.signedAt })),
  );
  if (!envelope?.id) {
    console.log("[documenso webhook] no payload.id on this delivery - ignoring");
    return new Response("OK", { status: 200 });
  }

  const tokens = recipients.map((r) => r.token).filter((t): t is string => Boolean(t));
  const quote = tokens.length
    ? await prisma.quote.findFirst({
        where: { OR: [{ clientSigningToken: { in: tokens } }, { companySigningToken: { in: tokens } }] },
        include: { createdBy: true },
      })
    : null;
  if (!quote) {
    console.log(`[documenso webhook] no Quote matching any of the ${tokens.length} recipient token(s) on this delivery`);
    return new Response("OK", { status: 200 });
  }

  const { signatureStatus } = await syncSignatureFromRecipients(quote, recipients, body);
  console.log("[documenso webhook] quote=", quote.id, "signatureStatus=", signatureStatus);

  return new Response("OK", { status: 200 });
}
