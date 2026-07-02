import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDate } from "@/lib/quote";
import ProfileForm from "./ProfileForm";
import PasswordForm from "./PasswordForm";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>;
}) {
  const sessionUser = await requireUser();
  const { pin } = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });

  return (
    <div className="container">
      <h1>Account</h1>
      <p className="lede">Your contact details and password.</p>

      {pin === "required" && (
        <div className="card" style={{ borderColor: "var(--gold)", marginBottom: 18 }}>
          Add a phone number to use Presentation Mode - its last 4 digits become the PIN
          you&apos;ll enter to exit back to the app.
        </div>
      )}

      <div className="account-grid">
        <ProfileForm defaultName={user.name} defaultPhone={user.phone ?? ""} />
        <PasswordForm />
      </div>

      {user.role === "MEMBER" && user.termsAcceptedAt && (
        <div className="account-terms">
          <h3>Platform terms</h3>
          <p className="help" style={{ marginBottom: 10 }}>
            Accepted {fmtDate(user.termsAcceptedAt, { year: "numeric", month: "long", day: "numeric" })}
          </p>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{user.termsAcceptedText}</p>
        </div>
      )}
    </div>
  );
}
