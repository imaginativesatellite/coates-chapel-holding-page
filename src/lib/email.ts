import { Resend } from "resend";
import { renderEmail } from "./email-templates";
import { appUrl } from "./quote";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.EMAIL_FROM ?? "Luna Creative <proposals@notifications.luna-creative.com>";

/** Escape text before placing it in email HTML (client names are user-supplied). */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const COMPANY_NAME = "Luna Creative";
// Login-protected PDF link. Emails carry this link instead of attaching the
// PDF - the proposal is only ever downloadable from inside the app.
const proposalPdfUrl = (publicCode: string) => `${appUrl()}/api/proposal/${publicCode}/pdf`;
// Proposals are billed 50% to begin, 50% on completion - expose both halves
// as template variables so admins can spell out the payment split in any email.
const deposit = (total: number) => Math.round(total / 2);

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// No email ever attaches the proposal - PDFs are login-protected and linked
// via {{proposalUrl}} instead (see proposalPdfUrl above).
type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  // Flags the message as high importance for emails that need Luna Creative to
  // act (review a custom quote, add a signature) so they stand out in the inbox.
  priority?: boolean;
};

async function send({ to, subject, html, priority }: SendArgs) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set - skipping send:", subject);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    headers: priority
      ? { "X-Priority": "1", Importance: "high", "X-MSMail-Priority": "High" }
      : undefined,
  });
}

/** Proposal email - always goes to the logged-in member. Links to the
 *  login-protected PDF instead of attaching it. */
export async function sendProposalToMember(args: {
  memberEmail: string;
  proposalName: string;
  total: number;
  monthly: number;
  code: string;
}) {
  const name = esc(args.proposalName);
  const dep = deposit(args.total);
  const { subject, html, enabled } = await renderEmail("proposal_to_member", {
    proposalName: name,
    total: money(args.total),
    monthly: money(args.monthly),    deposit: money(dep),
    balance: money(args.total - dep),
    code: esc(args.code),
    proposalUrl: proposalPdfUrl(args.code),
    memberEmail: esc(args.memberEmail),
    companyName: COMPANY_NAME,
  });
  if (!enabled) return;
  await send({ to: args.memberEmail, subject, html });
}

/** Notify admins on EVERY quote request (proposal or custom). */
export async function notifyAdmins(args: {
  proposalName: string;
  memberEmail: string;
  isCustom: boolean;
  total?: number;
  code: string;
  reasons?: string[];
  manageUrl: string; // link into the app (approve for custom; view for proposals)
}) {
  const to = adminEmails();
  if (to.length === 0) return;

  const name = esc(args.proposalName);
  const who = esc(args.memberEmail);
  const total = args.total ?? 0;
  const dep = deposit(total);
  const { subject, html, enabled } = args.isCustom
    ? await renderEmail("admin_custom_requested", {
        memberEmail: who,
        proposalName: name,
        reasons: esc((args.reasons ?? []).join("; ") || "complex functionality"),
        manageUrl: args.manageUrl,
        code: esc(args.code),
        companyName: COMPANY_NAME,
      })
    : await renderEmail("admin_proposal_generated", {
        memberEmail: who,
        proposalName: name,
        total: money(total),
        manageUrl: args.manageUrl,
        code: esc(args.code),
        deposit: money(dep),
        balance: money(total - dep),
        companyName: COMPANY_NAME,
      });

  if (!enabled) return;
  // A custom-quote request needs an admin to act, so flag it high priority.
  await send({ to, subject, html, priority: args.isCustom });
}

/** Notify admins once the client has signed - the moment an admin actually
 *  needs to step in and complete the company signature. Held back until then
 *  rather than firing the moment a member requests it, so admins aren't pinged
 *  before there's anything for them to do. */
export async function notifyClientSigned(args: {
  proposalName: string;
  requestedByName: string;
  clientEmail: string;
  manageUrl: string;
  code?: string;
}) {
  const to = adminEmails();
  if (to.length === 0) return;

  const name = esc(args.proposalName);
  const who = esc(args.requestedByName);
  const signerEmail = esc(args.clientEmail);

  const { subject, html, enabled } = await renderEmail("client_signed", {
    signerEmail,
    proposalName: name,
    memberName: who,
    manageUrl: args.manageUrl,    code: esc(args.code ?? ""),
    companyName: COMPANY_NAME,
  });
  if (!enabled) return;
  // Luna Creative needs to add its signature, so flag it high priority.
  await send({ to, subject, html, priority: true });
}

/** Once BOTH parties have signed, tell everyone the proposal is complete: the
 *  member it was prepared for and the Luna Creative admins. Links to the PDF
 *  route, which serves the fully signed copy once signing completes. */
export async function notifyFullySigned(args: {
  proposalName: string;
  memberName: string;
  memberEmail: string;
  code: string;
}) {
  const to = Array.from(new Set([args.memberEmail, ...adminEmails()].filter(Boolean)));
  if (to.length === 0) return;

  const name = esc(args.proposalName);
  const { subject, html, enabled } = await renderEmail("proposal_fully_signed", {
    proposalName: name,
    memberName: esc(args.memberName),
    memberEmail: esc(args.memberEmail),    code: esc(args.code),
    proposalUrl: proposalPdfUrl(args.code),
    companyName: COMPANY_NAME,
  });
  if (!enabled) return;
  await send({ to, subject, html });
}

/**
 * After an admin approves a custom quote - emailed to the requester (Droptine
 * member) with a link to the proposal PDF and a link to their quotes.
 */
export async function sendApprovedQuoteToRequester(args: {
  requesterEmail: string;
  proposalName: string;
  total: number;
  monthly: number;
  code: string;
  dashboardUrl: string;
}) {
  const name = esc(args.proposalName);
  const dep = deposit(args.total);
  const { subject, html, enabled } = await renderEmail("approved_quote_to_requester", {
    proposalName: name,
    total: money(args.total),
    monthly: money(args.monthly),    code: esc(args.code),
    proposalUrl: proposalPdfUrl(args.code),
    dashboardUrl: args.dashboardUrl,
    deposit: money(dep),
    balance: money(args.total - dep),
    memberEmail: esc(args.requesterEmail),
    companyName: COMPANY_NAME,
  });
  if (!enabled) return;
  await send({ to: args.requesterEmail, subject, html });
}
