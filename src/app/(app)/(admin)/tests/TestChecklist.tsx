"use client";

import { useEffect, useMemo, useState } from "react";

type Item = { id: string; title: string; steps: string[] };
type Section = { title: string; items: Item[] };

const STORAGE_KEY = "droptine-test-checklist";

// Each item has a STABLE id - that's the key the checkmark is saved under, so
// reordering or rewording an item won't lose a previously-recorded check.
const SECTIONS: Section[] = [
  {
    title: "Accounts & access",
    items: [
      {
        id: "auth-login-admin",
        title: "Admin can log in",
        steps: [
          "Go to /login and sign in with an admin account.",
          "Confirm you land on the Dashboard.",
          "Confirm the nav shows Admin, Users, Pricing Rules, and Tests.",
        ],
      },
      {
        id: "auth-login-member",
        title: "Member can log in",
        steps: [
          "Sign in with a member (non-admin) account.",
          "Confirm Admin, Users, Pricing Rules, and Tests are NOT in the nav.",
          "Confirm you only see Dashboard and New Quote.",
        ],
      },
      {
        id: "auth-logout",
        title: "Sign out works",
        steps: [
          "Open the avatar menu (top right) and click Sign out.",
          "Confirm you're returned to the login screen.",
        ],
      },
      {
        id: "auth-guard",
        title: "Protected pages are guarded",
        steps: [
          "While logged out, visit /dashboard directly - you should be redirected to /login.",
          "As a member, visit /users and /tests directly - you should be redirected to /dashboard.",
        ],
      },
    ],
  },
  {
    title: "New quote - standard proposal",
    items: [
      {
        id: "new-generate",
        title: "Generate a standard proposal",
        steps: [
          "Go to New Quote and answer the questionnaire with simple options (no complex functionality).",
          "Click Generate Proposal.",
          "Confirm you land on the quote page with a price and breakdown.",
          "Confirm the proposal email arrives with a login-protected link to the proposal (no attachment).",
        ],
      },
      {
        id: "new-rush-fee",
        title: "Rush fee for a faster turnaround",
        steps: [
          "Create a quote and, under Turnaround Time, pick a turnaround faster than the estimated lead time (e.g. 20 business days).",
          "Confirm a 'Rush Fee - X business day turnaround' line appears and the total increases by $500 per 5 business days saved.",
          "Confirm the proposal/PDF show the requested turnaround with the original estimate struck through.",
          "Pick 'No preference' and confirm there's no rush fee and the standard lead time shows.",
        ],
      },
      {
        id: "new-draft-autosave",
        title: "Draft auto-saves and Clear works",
        steps: [
          "Start answering the questionnaire, then refresh the page.",
          "Confirm your answers are still there.",
          "Click Clear (top right) and confirm the form empties.",
        ],
      },
      {
        id: "new-validation",
        title: "Required questions are enforced",
        steps: [
          "Leave a required question (marked with *) blank.",
          "Confirm the Generate Proposal button stays disabled, the count of remaining questions shows beneath it, and 'jump to the next one' scrolls to the first unanswered question.",
        ],
      },
      {
        id: "pdf-login-gated",
        title: "Proposal PDF requires login & respects visibility",
        steps: [
          "Copy a proposal's PDF link (Download PDF) and open it in a private/incognito window.",
          "Confirm it redirects to the login page instead of serving the PDF.",
          "Open the same link while logged in as the creator (or an admin) and confirm the PDF downloads.",
          "Open the same link as a DIFFERENT member while the quote is Private - confirm it returns 'Not found'.",
        ],
      },
    ],
  },
  {
    title: "Custom quotes (admin approval)",
    items: [
      {
        id: "custom-trigger",
        title: "Complex request routes to a custom quote",
        steps: [
          "Create a quote where you describe complex/additional functionality.",
          "Confirm it's created as 'Custom · pending approval' rather than getting an instant price.",
          "Confirm admins receive a 'Custom quote requested' email.",
        ],
      },
      {
        id: "custom-rush-under-min",
        title: "Turnaround under 20 days routes to a custom quote",
        steps: [
          "Create a quote and choose 'Less than 20 business days' for the turnaround.",
          "Confirm the exact-days field appears (numbers only) and is required.",
          "Confirm the quote is created as 'Custom · pending approval' with no instant price.",
        ],
      },
      {
        id: "custom-approve",
        title: "Admin approves a custom quote",
        steps: [
          "As an admin, open the pending quote.",
          "Set an approved price, turnaround, monthly, and scope, then click Approve & send.",
          "Confirm status changes to Approved and the requester is emailed a link to the proposal (no attachment).",
        ],
      },
      {
        id: "custom-ai",
        title: "AI price recommendation (if enabled)",
        steps: [
          "On a pending custom quote, click the AI price recommendation button.",
          "Confirm a suggested price and reasoning appear (requires ENABLE_AI_PRICING).",
        ],
      },
    ],
  },
  {
    title: "Quote editing (admin)",
    items: [
      {
        id: "edit-pricing",
        title: "Edit override / discount / monthly",
        steps: [
          "On an approved or proposal quote, change the override total, discount, and monthly, then Save.",
          "Confirm the totals update correctly.",
          "Confirm the change is recorded in the Activity log.",
        ],
      },
      {
        id: "edit-answers",
        title: "Edit answers recomputes price",
        steps: [
          "Click Edit answers, change a few selections, and save.",
          "Confirm the price recomputes and the Activity log notes 'Edited answers'.",
        ],
      },
      {
        id: "edit-breakdown",
        title: "Internal breakdown is correct",
        steps: [
          "Review the admin Internal breakdown line items and total.",
          "Confirm they match the selections and any override/discount.",
        ],
      },
    ],
  },
  {
    title: "Visibility & sharing",
    items: [
      {
        id: "vis-toggle",
        title: "Creator can toggle Private/Shared",
        steps: [
          "As the member who created a quote, toggle Private on and off.",
          "Confirm the help text updates and there are no errors.",
        ],
      },
      {
        id: "vis-hidden-noncreator",
        title: "Private quotes hidden from other members",
        steps: [
          "Mark a quote Private as its creator.",
          "Log in as a different member and confirm that quote does NOT appear on their dashboard.",
          "Confirm visiting its URL directly shows 'not found'.",
        ],
      },
      {
        id: "vis-no-toggle-noncreator",
        title: "No visibility toggle for non-creators",
        steps: [
          "Share a quote, then view it as a different member.",
          "Confirm they can see it but do NOT see the Visibility toggle.",
        ],
      },
      {
        id: "vis-admin-all",
        title: "Admins see and control everything",
        steps: [
          "As an admin, confirm you can open another member's private quote.",
          "Confirm you can toggle its visibility.",
        ],
      },
    ],
  },
  {
    title: "E-signature (Documenso)",
    items: [
      {
        id: "sig-member-request",
        title: "Member requests a signature in one click",
        steps: [
          "As the creating member, open an approved/proposal quote.",
          "Click Accept & sign.",
          "Confirm the animated 'Sent for signature' confirmation shows for a few seconds, then the button reads Resend for signature.",
          "Confirm status shows 'Sent - awaiting signatures' and the signing email arrives.",
        ],
      },
      {
        id: "sig-no-email",
        title: "Graceful when no client email is on file",
        steps: [
          "Open a quote whose client has no email.",
          "Confirm you see the 'no email on file' message and no send button.",
        ],
      },
      {
        id: "sig-client-signs",
        title: "Client signs → admins notified",
        steps: [
          "Complete the client's signature in Documenso.",
          "Confirm admins receive the 'Client signed' email.",
          "Confirm the quote status updates to Partially signed.",
        ],
      },
      {
        id: "sig-company-signs",
        title: "Admin completes the company signature",
        steps: [
          "As an admin, after the client signs, click 'Sign as Luna Creative' and complete it in the embedded frame.",
          "Confirm status becomes Fully signed and the Signed badge appears on the dashboard.",
        ],
      },
      {
        id: "sig-admin-custom-email",
        title: "Admin can send to a custom email",
        steps: [
          "As an admin, use the Client email field in the E-signature section to send to a specific address.",
          "Confirm the envelope is sent to that address.",
        ],
      },
    ],
  },
  {
    title: "Expiry & reactivation",
    items: [
      {
        id: "expiry-member",
        title: "Members can't open expired quotes",
        steps: [
          "Find (or simulate) an expired quote.",
          "As a member, confirm you see the Expired message and no price/details.",
        ],
      },
      {
        id: "expiry-reactivate",
        title: "Admin reactivates an expired quote",
        steps: [
          "As an admin, open an expired quote and click Reactivate.",
          "Confirm pricing refreshes, the 60-day window resets, and the requester is emailed.",
        ],
      },
    ],
  },
  {
    title: "Emails",
    items: [
      {
        id: "email-proposal",
        title: "Proposal email delivers",
        steps: [
          "After generating a proposal, confirm the email arrives with a working login-protected proposal link (emails never attach the PDF).",
        ],
      },
      {
        id: "email-admin-notify",
        title: "Admins notified on every request",
        steps: [
          "Generate a proposal and a custom quote.",
          "Confirm the addresses in ADMIN_EMAILS receive a notification for each.",
        ],
      },
      {
        id: "email-resend",
        title: "Resend email works",
        steps: [
          "As an admin, click Resend email on a quote.",
          "Confirm it arrives and the Activity log records 'Proposal email re-sent'.",
        ],
      },
    ],
  },
  {
    title: "User management (admin)",
    items: [
      {
        id: "users-add",
        title: "Add a user",
        steps: [
          "On Users, add a new Member (and an Admin) with a temporary password.",
          "Confirm the new account can log in.",
        ],
      },
      {
        id: "users-role",
        title: "Change a user's role",
        steps: [
          "Switch a user between Member and Admin and Save details.",
          "Confirm their nav and permissions change accordingly on their next login.",
        ],
      },
      {
        id: "users-password-delete",
        title: "Reset password & delete safeguards",
        steps: [
          "Reset a user's password and confirm they can log in with it.",
          "Try deleting a user who has quotes/clients - confirm it's blocked with a clear message.",
          "Delete a user with no history - confirm it succeeds.",
        ],
      },
    ],
  },
  {
    title: "Dashboard & UI",
    items: [
      {
        id: "dash-search",
        title: "Search & pagination",
        steps: [
          "On the dashboard, search by client name and change the page size.",
          "Confirm the list filters and paginates correctly.",
        ],
      },
      {
        id: "dash-badges",
        title: "Badges & sections",
        steps: [
          "Confirm pending custom quotes appear under the attention section.",
          "Confirm Signed, Expired, Private, and status pills render on the right quotes.",
        ],
      },
      {
        id: "ui-mobile-dropdown",
        title: "Mobile dropdowns show a down arrow",
        steps: [
          "On a phone, open any form with a dropdown (New Quote, Users).",
          "Confirm each dropdown shows a down arrow and still opens the native picker.",
        ],
      },
      {
        id: "ui-mobile-nav",
        title: "Mobile navigation",
        steps: [
          "On a phone, open the hamburger menu.",
          "Confirm all the appropriate links appear and navigating closes the menu.",
        ],
      },
    ],
  },
];

export default function TestChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChecked(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    } catch {}
  }, [checked, loaded]);

  const allItems = useMemo(() => SECTIONS.flatMap((s) => s.items), []);
  const total = allItems.length;
  const done = allItems.filter((i) => checked[i.id]).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const resetAll = () => {
    if (confirm("Clear all checkmarks?")) setChecked({});
  };

  return (
    <div>
      {/* Progress */}
      <div className="card" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.9rem" }}>
            <strong>{done} / {total} tested</strong>
            <span className="help">{pct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--gold)", transition: "width 0.2s ease" }} />
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={resetAll} style={{ padding: "8px 14px" }}>
          Reset
        </button>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} style={{ marginBottom: 22 }}>
          <h3 className="section-head" style={{ marginBottom: 10 }}>{section.title}</h3>
          {section.items.map((item) => {
            const isDone = Boolean(checked[item.id]);
            return (
              <div className="card" key={item.id} style={{ marginBottom: 10 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => toggle(item.id)}
                    style={{ width: "auto", marginTop: 3, flex: "none" }}
                  />
                  <span style={{ fontWeight: 600, textDecoration: isDone ? "line-through" : "none", color: isDone ? "var(--muted)" : "var(--ink)" }}>
                    {item.title}
                  </span>
                </label>
                <ol style={{ margin: "8px 0 0", paddingLeft: 34, color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.55 }}>
                  {item.steps.map((step, i) => (
                    <li key={i} style={{ marginBottom: 3 }}>{step}</li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
