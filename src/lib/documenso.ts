/**
 * Self-hosted Documenso e-signature integration (documenso/documenso, AGPL-3.0).
 * Opt-in: requires DOCUMENSO_API_KEY + DOCUMENSO_COMPANY_EMAIL. DOCUMENSO_API_URL
 * is your instance's base URL with no /api suffix (e.g. a Railway deployment),
 * or https://app.documenso.com if you'd rather use their hosted cloud.
 *
 * Two recipients sign sequentially per quote: the client, then a shared
 * "company" identity (DOCUMENSO_COMPANY_EMAIL/NAME) that any logged-in admin
 * can complete - see confirmCompanySignature in quote/[id]/actions.ts for how
 * we record *which* admin actually did it (Documenso only sees the one shared
 * recipient, not our app's individual admin accounts).
 *
 * We embed signing by iframing each recipient's own signing-page URL
 * (`/sign/{token}`, the same page Documenso would otherwise email them a link
 * to) rather than using Documenso's official embed npm packages or `/embed/`
 * routes - those are a separately-licensed product feature on top of the
 * AGPL core, and bundling that SDK into a closed-source app raises the kind
 * of "combined work" question the AGPL is built around. A plain iframe at a
 * normal page URL on our own self-hosted instance avoids that question.
 *
 * Field placement is coordinate-based against a dedicated "Signatures" page
 * we always render last - see lib/signature-layout.ts. Earlier sections
 * (Terms especially) can wrap onto extra physical pages depending on
 * content length, so we count the actual pages in the rendered PDF rather
 * than assuming a fixed page number, and place fields on whatever page
 * comes out as the real last one.
 * Field/endpoint names below are best-effort from Documenso's public docs and
 * source (their docs site returns 403 to automated fetches, so this wasn't
 * verified against a live instance); check your own deploy's /developers/api
 * docs if something doesn't line up.
 */
import { PDFDocument } from "pdf-lib";
import { SIGNATURE_FIELDS } from "./signature-layout";

const API_KEY = process.env.DOCUMENSO_API_KEY;
const API_URL = (process.env.DOCUMENSO_API_URL ?? "https://app.documenso.com").replace(/\/$/, "");
const COMPANY_EMAIL = process.env.DOCUMENSO_COMPANY_EMAIL ?? "";
const COMPANY_NAME = process.env.DOCUMENSO_COMPANY_NAME ?? "Luna Creative LLC";

export function documensoEnabled(): boolean {
  return Boolean(API_KEY && COMPANY_EMAIL);
}

export function companyEmail(): string {
  return COMPANY_EMAIL;
}

/** The recipient's own signing page on our instance - embedded via iframe. */
export function documensoSignUrl(token: string): string {
  return `${API_URL}/sign/${token}`;
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: API_KEY ?? "" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Documenso ${path} failed (${res.status}): ${text || res.statusText}`);
  return (text ? JSON.parse(text) : null) as T;
}

type DocumensoRecipient = { id: number; email: string; token?: string; signingUrl?: string };
type EnvelopeResponse = { id: number | string; recipients?: DocumensoRecipient[] };

function field(type: "SIGNATURE" | "DATE", page: number, box: { positionX: number; positionY: number; width: number; height: number }) {
  return { type, page, positionX: box.positionX, positionY: box.positionY, width: box.width, height: box.height };
}

/** Last page of the rendered PDF - the Signatures page always renders last
 *  in lib/pdf.tsx, but earlier sections can wrap onto extra pages first. */
async function lastPageNumber(pdf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdf);
  return doc.getPageCount();
}

function tokenFor(recipients: DocumensoRecipient[] | undefined, email: string): string | null {
  return recipients?.find((r) => r.email.toLowerCase() === email.toLowerCase())?.token ?? null;
}

/** Deep-clone with signing tokens masked before logging - a recipient token IS
 *  their signing URL, so raw responses must never land in the deploy logs. */
function redactTokens(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (key, val) => (key === "token" || key === "signingUrl" ? "[redacted]" : val)));
}

/** Best-effort void/delete of a previously-sent envelope, so a re-send can't
 *  leave two live signable copies of the same proposal (a signature on the
 *  old one could no longer be matched to the quote once its tokens are
 *  replaced). Endpoint per Documenso's TypeScript SDK source (the docs site
 *  403s automated fetches); failure is logged and non-fatal - the re-send
 *  proceeds either way. */
export async function voidEnvelope(envelopeId: string): Promise<void> {
  if (!documensoEnabled()) return;
  try {
    await call(`/api/v2/envelope/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelopeId }),
    });
  } catch (e) {
    console.warn(`[documenso] couldn't void envelope ${envelopeId} before re-sending:`, e);
  }
}

type EnvelopeStatusRecipient = { email?: string; signingStatus?: string; signedAt?: string | null; token?: string };
type EnvelopeItem = { id: string };
type EnvelopeStatusResponse = {
  id: number | string;
  status?: string;
  recipients?: EnvelopeStatusRecipient[];
  envelopeItems?: EnvelopeItem[];
};

/** Best-effort fetch of the completed (signed) document for an envelope, so a
 *  download after both parties sign returns the signed copy rather than a fresh
 *  render. There's no single "download this envelope" endpoint - per
 *  Documenso's public TypeScript SDK source (the docs site 403s automated
 *  fetches), a document's actual file lives on its envelope item(s), fetched
 *  via GET /api/v2/envelope/item/{envelopeItemId}/download?version=signed,
 *  where the item id comes from GET /api/v2/envelope/{id}'s envelopeItems.
 *  That endpoint's response shape isn't documented beyond "JSON", so this
 *  handles both a JSON wrapper carrying a (usually presigned) URL and a direct
 *  binary response. Returns null if anything doesn't line up - the caller
 *  falls back to the freshly rendered PDF. */
export async function downloadSignedPdf(envelopeId: string): Promise<Buffer | null> {
  if (!documensoEnabled()) return null;
  try {
    const envelope = await getEnvelopeStatus(envelopeId);
    const itemId = envelope.envelopeItems?.[0]?.id;
    if (!itemId) {
      console.warn(`[documenso download] envelope ${envelopeId} has no envelopeItems - cannot fetch signed PDF`);
      return null;
    }

    const res = await fetch(`${API_URL}/api/v2/envelope/item/${encodeURIComponent(itemId)}/download?version=signed`, {
      headers: { Authorization: API_KEY ?? "" },
    });
    if (!res.ok) {
      console.warn(`[documenso download] item ${itemId} download failed (${res.status}): ${await res.text().catch(() => "")}`);
      return null;
    }

    if ((res.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await res.json()) as { url?: string; downloadUrl?: string };
      const url = body.url ?? body.downloadUrl;
      if (!url) {
        console.warn(`[documenso download] item ${itemId} returned JSON with no url/downloadUrl: ${JSON.stringify(body)}`);
        return null;
      }
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
        console.warn(`[documenso download] presigned url for item ${itemId} failed (${fileRes.status})`);
        return null;
      }
      return Buffer.from(await fileRes.arrayBuffer());
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn(`[documenso download] error fetching signed PDF for envelope ${envelopeId}:`, e);
    return null;
  }
}

/** Pulls an envelope's current recipient signing status straight from
 *  Documenso (GET /api/v2/envelope/{id}, confirmed via Documenso's published
 *  TypeScript SDK source - the docs site itself 403s automated fetches). This
 *  is the manual fallback for a missed webhook delivery: see
 *  syncSignatureStatus in quote/[id]/actions.ts. */
export async function getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatusResponse> {
  return call<EnvelopeStatusResponse>(`/api/v2/envelope/${encodeURIComponent(envelopeId)}`, { method: "GET" });
}

/** Creates a two-recipient envelope (client, then the shared company
 *  identity) from a rendered proposal PDF and immediately sends it, returning
 *  each party's signing token for building their embedded signing iframe. */
export async function sendEnvelopeForSignature(args: {
  title: string;
  pdf: Buffer;
  clientEmail: string;
  clientName: string;
}): Promise<{ envelopeId: string; clientToken: string | null; companyToken: string | null; raw: unknown }> {
  const sigPage = await lastPageNumber(args.pdf);
  const payload = {
    title: args.title,
    type: "DOCUMENT",
    // Per-recipient signingOrder (below) is only enforced when the envelope
    // itself is SEQUENTIAL - Documenso defaults to PARALLEL, which would let
    // the company recipient complete their signature before the client's,
    // regardless of the 1/2 index. This is the actual guarantee that Luna
    // can't sign first; the app-side gate in confirmCompanySignature is only
    // a courtesy on top of it.
    meta: { signingOrder: "SEQUENTIAL" },
    recipients: [
      {
        email: args.clientEmail,
        name: args.clientName,
        role: "SIGNER",
        signingOrder: 1,
        fields: [
          field("SIGNATURE", sigPage, SIGNATURE_FIELDS.client.signature),
          field("DATE", sigPage, SIGNATURE_FIELDS.client.date),
        ],
      },
      {
        email: COMPANY_EMAIL,
        name: COMPANY_NAME,
        role: "SIGNER",
        signingOrder: 2,
        fields: [
          field("SIGNATURE", sigPage, SIGNATURE_FIELDS.company.signature),
          field("DATE", sigPage, SIGNATURE_FIELDS.company.date),
        ],
      },
    ],
  };

  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  form.append("files", new Blob([new Uint8Array(args.pdf)], { type: "application/pdf" }), `${args.title}.pdf`);

  const created = await call<EnvelopeResponse>("/api/v2/envelope/create", { method: "POST", body: form });
  console.log("[documenso create] response:", JSON.stringify(redactTokens(created)));

  const distributed = await call<EnvelopeResponse>("/api/v2/envelope/distribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ envelopeId: created.id }),
  });
  console.log("[documenso distribute] response:", JSON.stringify(redactTokens(distributed)));

  const recipients = distributed.recipients ?? created.recipients;

  return {
    envelopeId: String(created.id),
    clientToken: tokenFor(recipients, args.clientEmail),
    companyToken: tokenFor(recipients, COMPANY_EMAIL),
    raw: distributed,
  };
}
