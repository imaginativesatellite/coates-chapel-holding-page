"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canUseClientPortal } from "@/lib/portal";
import { PRESENTATION_COOKIE } from "@/lib/presentation";

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

/** Switch into the client-facing portal. Gated to portal users; sets the mode
 *  cookie and drops the operator on the portal. Leaving requires the exit PIN
 *  (the last 4 digits of the operator's phone), so a phone must be on file
 *  BEFORE entering - otherwise whoever is holding the device would get the
 *  exit screen's fallback instead of a PIN the operator knows. */
export async function enterPresentationMode() {
  const user = await requireUser();
  if (!canUseClientPortal(user)) redirect("/dashboard");
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } });
  if ((dbUser?.phone ?? "").replace(/\D/g, "").length < 4) redirect("/account?pin=required");
  const store = await cookies();
  store.set(PRESENTATION_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/portal");
}
