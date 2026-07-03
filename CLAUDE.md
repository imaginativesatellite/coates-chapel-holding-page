# Droptine Pricing Model - project context

## What this is
Internal tool that turns a short member questionnaire into a deterministic
website-build price and a branded, login-protected PDF. Complex/custom
requests route to an admin-approved custom quote instead of an automatic
price. (There is no longer a public proposal web page - the PDF, downloadable
only from inside the app, is the deliverable.)

## The relationship
- **Luna Creative** owns and operates this tool.
- **Droptine** is Luna's reseller/partner - Droptine's team sells Luna's
  Webflow builds to their own ranch/hunting/breeder clients and uses this
  tool to generate those clients' proposals.
- **MEMBER** accounts = Droptine's team. They run the questionnaire and
  generate proposals day-to-day. They do not see pricing internals beyond
  the breakdown on their own proposals. (The role enum was renamed from
  `STAFF` to `MEMBER` - see the migration that runs `ALTER TYPE "Role"
  RENAME VALUE`.)
- **ADMIN** accounts = Luna Creative. Admins approve custom quotes, can
  override any price, edit the pricing rules, and can see every quote
  (including ones a member marked private).

## Hard rule: a new/changed questionnaire question always touches 3 places
Adding or changing a question is never just a `questionnaire.ts` edit.
Every question that affects price needs matching changes in:
1. **`src/lib/pricing.ts`** - add the field to `PricingAnswers`, and add the
   actual pricing logic in `computeQuote` (line item amount, and a
   custom-quote trigger if the option should route to a custom quote).
2. **`src/app/(app)/(admin)/pricing-rules/page.tsx`** - the admin-facing "Logic"
   tab that documents what the calculator charges, the turnaround it estimates,
   and why. It must stay accurate, or admins will be looking at stale rules.
3. **`src/lib/anthropic.ts` (`describeScope`)** - only if the new option
   should be mentioned in the AI-drafted scope prose. Skip if it's purely
   pricing with no prose impact.

Never ship a questionnaire question with no corresponding pricing rule, and
never add a pricing rule with no way to trigger it from the questionnaire.

## Hard rule: the admin portal documents the app - keep it in sync
Several admin tabs are living documentation of how the app behaves. When you
change the behavior, update its reference page **in the same commit**, or admins
will be reading stale docs:
- **UI tab** (`src/app/(app)/(admin)/ui/page.tsx`) - the canonical reference for
  every status tag (`.pill`), row icon (`TagIcon`), and dashboard card color
  (`.qrow`/`.qtile` accents). Adding, removing, renaming, or recoloring any of
  these means editing the UI page too. It deliberately imports the live
  `TagIcon` and reuses the real `.pill`/`.qrow` classes so styling can't drift,
  but the *set* of indicators and their meanings is hand-maintained.
- **Logic tab** (`src/app/(app)/(admin)/pricing-rules/page.tsx`) - what the
  calculator charges and the turnaround it estimates (see the questionnaire hard
  rule above). Organized as Pricing / Turnaround / Proposal content / Client
  portal (Presentation Mode) / Adjustments. The Client-portal section documents
  the markup + increment + discount layer; its defaults come from
  `DEFAULT_MARKUP`/`MAX_INCREMENTS` in `src/lib/portal.ts` so they can't drift.
- **Emails tab** - the default templates live in `src/lib/email-templates.ts`;
  keep their copy and the listed template variables accurate.

## Pricing engine
- `src/lib/pricing.ts` is the single source of truth for price. It is fully
  deterministic - no AI involvement, ever.
- AI (`src/lib/anthropic.ts`, Anthropic SDK) is opt-in and writes **prose
  only**, never a price. Two independent env gates:
  - `ENABLE_AI` - proposal scope-summary prose (used on every proposal).
  - `ENABLE_AI_PRICING` - the admin "AI price recommendation" button shown
    only on pending custom quotes.
  Both default off and both require `ANTHROPIC_API_KEY`.

## Client-facing Presentation Mode (pilot)
A client-facing mode of the same app, currently gated to one pilot member
(`gallardodesigngroup@gmail.com`) plus all admins via the per-user
`User.clientPortalEnabled` flag (`canUseClientPortal` in `src/lib/portal.ts`,
seeded on in `prisma/seed.ts`). Eventually opened to all members.
- **Entering/leaving**: the account menu's "Enter Presentation Mode" sets an
  httpOnly cookie (`src/lib/presentation.ts`) and opens `/portal`. While that
  cookie is set, the whole internal `(app)` area redirects to `/portal` (route
  lockdown in `(app)/layout.tsx`), so a client can't reach the dashboard/admin.
  Leaving requires the exit PIN = the last 4 digits of the member's phone
  (shown only as "PIN"); a phone is required BEFORE entering (no phone →
  redirected to Account), and if the phone was cleared mid-session the exit
  falls back to the account password - the exit screen must never let the
  device holder set their own PIN. PIN attempts are rate-limited. In this
  mode the header is orange (`.portalnav`).
- **The portal** (`/portal`) is the questionnaire reworded for the client
  (`clientLabel`/`clientHelp` on questions in `questionnaire.ts`), with no
  visibility toggle and "(custom quote)" stripped from the option labels. A
  faint far-left rail adds price increments. "See your price" shows a big
  number and "Save and Close". A faint pencil anchored lower-right opens the
  deliberately-administrative "Form PO-1" override modal (set value / add
  amount / deduct amount + optional "note for record" saved to
  `Quote.priceReason`, acknowledgment checkbox required); deductions strike
  through the price, additions just show the higher number, floor $0.
- **Client pricing is a layer on top of `pricing.ts`, never inside it**: the
  client price = Luna price (the deterministic engine) + the member's markup +
  increments − discount. The markup (per member, set on `/markup`) and
  `computeClientPrice` live in `src/lib/portal.ts`. `pricing.ts` stays the lone
  source of truth for the *Luna* price.
- **Client quotes** save with `Quote.origin = CLIENT` and show on the
  dashboard's "Client quotes" tab. "Request Quote from Luna Creative"
  promotes one (re-prices at Luna's rate, notifies admins, stamps
  `convertedToLunaAt`, which renders the handshake icon). Custom-quote answers
  save as `CUSTOM_PENDING`. No PDF/email - these are instant, in-person, and
  stay an on-screen number until promoted: the quote detail page shows only
  the scope paragraph + price composition (`clientPricing`), and every
  proposal surface (PDF route, signatures, resend email, edit, approve,
  reactivate) is blocked for `origin = CLIENT` quotes. Promotion keeps the
  `clientPricing` snapshot, rendered as a "Client quote (Presentation Mode)"
  reference card (no scope) beneath the Luna proposal.

## Git workflow (read this - it ends the recurring "Unverified" nag)
- Commit and push directly to `main` - no PR workflow on this repo unless
  explicitly asked for one.
- **Push to `main` only.** Even though sessions run on a harness branch
  (e.g. `claude/…`), do not push the harness branch - the single target is
  `main`:
  ```
  git push origin HEAD:main          # the only target
  ```
- The "Unverified" / `%G? = N` part of the stop-hook warning is a **false
  positive in this container**: commits *are* SSH-signed with the correct
  committer (`Claude <noreply@anthropic.com>`), but git can't verify them
  locally because no `gpg.ssh.allowedSignersFile` is configured. GitHub
  verifies against the registered key and shows them as Verified. **Do not**
  "fix" it with `git commit --amend --reset-author` - that rewrites
  already-pushed history for no benefit.

## UI conventions
- **Dropdowns**: always use `src/components/BrandSelect.tsx`, never a raw
  `<select>`. It carries a hidden native `<select name=…>` so it still submits
  inside a plain/server-action form - pass `name` for those cases.
- Brand palette lives as CSS custom properties at the top of
  `src/app/globals.css` (`--charcoal`, `--ink`, `--gold`, `--gold-dark`,
  `--bg`, `--card`, `--line`, `--muted`, `--good`). Reuse these instead of
  hard-coding new colors.

## Other conventions
- Quotes expire 60 days after `validFrom`. Admins can reactivate an expired
  quote, which mints a fresh access code and refreshes pricing if the model
  changed since it was created.
- Visibility: a new quote's initial shared/private state comes from the
  creator's per-user `User.quotesDefaultPrivate` flag, which admins set on the
  Users tab ("New quotes default to private"); the creator can still toggle
  `shared` per quote. The migration that adds the flag backfills it `true` for
  admins and portal (pilot) members and `false` for everyone else, preserving
  the old "members shared / admins + pilot private" defaults. See `defaultShared`
  in `(app)/new/page.tsx`. Client-portal quotes (`origin = CLIENT`) are always
  saved private regardless.
