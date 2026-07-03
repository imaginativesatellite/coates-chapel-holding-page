/**
 * Seeds the first admin from SEED_ADMIN_* env vars - create-only.
 *
 * If the admin already exists it is left untouched, so passwords changed in-app
 * (or member accounts) survive redeploys. To force a password reset, delete the
 * user first or change it from the in-app account screen.
 *   npm run db:seed
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TEMPLATE_MAP, type TemplateKey } from "../src/lib/email-templates";

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "david@luna-creative.com").trim().toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "David";
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    console.log("SEED_ADMIN_PASSWORD not set - skipping admin seed.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists - leaving as-is.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role: Role.ADMIN },
  });
  console.log(`Seeded admin: ${user.email}`);
}

// One-time defaults requested directly (the admin Emails tab's on/off toggle
// was broken while the `enabled` column's migration was stuck - see start.sh).
// Create-only: an admin's later choice from the Emails tab always wins, this
// only sets the initial state the first time each row is created.
const DEFAULT_DISABLED: TemplateKey[] = ["proposal_to_member", "client_signed", "proposal_fully_signed"];

async function seedDisabledEmailDefaults() {
  for (const key of DEFAULT_DISABLED) {
    const existing = await prisma.emailTemplate.findUnique({ where: { key } });
    if (existing) continue;
    const def = TEMPLATE_MAP[key];
    await prisma.emailTemplate.create({
      data: { key, subject: def.subject, body: def.body, enabled: false },
    });
    console.log(`Disabled email by default: ${key}`);
  }
}

// One-time refresh: emails no longer attach the proposal PDF - the stock copy
// changed from "...is attached" to a {{proposalUrl}} link. Override rows that
// still carry the OLD stock body (e.g. the rows created by
// seedDisabledEmailDefaults above, or an untouched toggle row) are updated to
// the new default. Rows an admin actually reworded never match and are left
// alone; the enabled/disabled state is never touched. No-op once refreshed.
const OLD_STOCK_BODIES: Partial<Record<TemplateKey, string>> = {
  proposal_to_member:
    `<p>Your proposal for <strong>{{proposalName}}</strong> is ready.</p>` +
    `<p>One-time build <strong>{{total}}</strong> &middot; {{monthly}}/mo.</p>` +
    `<p>Your proposal is attached.</p>` +
    `<p>- Luna Creative</p>`,
  proposal_fully_signed:
    `<p>The proposal for <strong>{{proposalName}}</strong> is signed by both parties and complete.</p>` +
    `<p>The signed copy is attached.</p>` +
    `<p>- Luna Creative</p>`,
  approved_quote_to_requester:
    `<p>Your custom quote for <strong>{{proposalName}}</strong> has been approved.</p>` +
    `<p>One-time build <strong>{{total}}</strong> &middot; {{monthly}}/mo.</p>` +
    `<p>The proposal is attached.</p>` +
    `<p>- Luna Creative</p>`,
};

async function refreshStockEmailCopy() {
  for (const [key, oldBody] of Object.entries(OLD_STOCK_BODIES)) {
    const def = TEMPLATE_MAP[key as TemplateKey];
    const res = await prisma.emailTemplate.updateMany({
      where: { key, body: oldBody },
      data: { subject: def.subject, body: def.body },
    });
    if (res.count > 0) console.log(`Refreshed stock copy for email template: ${key}`);
  }
}

// Pilot accounts that get the client-facing Presentation Mode while it's being
// tested. Enable-if-off (so a redeploy doesn't clobber a deliberate toggle once
// portal access is managed from the admin UI). Remove this once that UI exists.
const PILOT_PORTAL_EMAILS = ["gallardodesigngroup@gmail.com"];

async function seedClientPortalAccess() {
  for (const raw of PILOT_PORTAL_EMAILS) {
    const email = raw.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`Client portal: ${email} not found yet - skipping.`);
      continue;
    }
    if (user.clientPortalEnabled) continue;
    await prisma.user.update({ where: { email }, data: { clientPortalEnabled: true } });
    console.log(`Enabled client portal for ${email}`);
  }
}

async function main() {
  await seedAdmin();
  await seedDisabledEmailDefaults();
  await refreshStockEmailCopy();
  await seedClientPortalAccess();
}

main()
  .catch((e) => {
    console.error("SEED ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
