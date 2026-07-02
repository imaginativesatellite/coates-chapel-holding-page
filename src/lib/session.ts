import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** Returns the signed-in user, or redirects to /login.
 *
 *  Role and existence are re-read from the DB rather than trusted from the
 *  (90-day) JWT, so demoting a user, promoting them, or deleting their
 *  account takes effect immediately on their next request instead of lingering
 *  until the token expires. Wrapped in React cache() so the layout, page, and
 *  nested components share one DB read per request instead of one each. */
export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, clientPortalEnabled: true },
  });
  if (!dbUser) redirect("/login");

  return {
    ...session.user,
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as "MEMBER" | "ADMIN",
    clientPortalEnabled: dbUser.clientPortalEnabled,
  };
});

/** Returns the signed-in admin, or redirects (to login or dashboard). */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
