"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PRESENTATION_COOKIE } from "@/lib/presentation";

export type ExitState = { error: string } | undefined;

// Brute-force guard: the exit PIN is only 4 digits and the person holding the
// device is, by design, not the account owner. Same in-memory pattern as the
// login guard in src/auth.ts (resets on redeploy; fine for a single instance).
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; first: number }>();

function lockedOut(userId: string): boolean {
  const a = attempts.get(userId);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) {
    attempts.delete(userId);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}
function recordFailure(userId: string) {
  const a = attempts.get(userId);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(userId, { count: 1, first: Date.now() });
  else a.count += 1;
}

/**
 * Leave Presentation Mode. The gate is the last four digits of the operator's
 * phone number (shown to the client only as "PIN"). A phone is required to
 * ENTER the mode (see enterPresentationMode), so the no-phone case only occurs
 * if the number was cleared mid-session - it falls back to the account
 * password, which the client holding the device can't know. (Never let this
 * screen SET a phone: that would let the client pick their own PIN and walk
 * into the internal app.) Only on success is the mode cookie cleared.
 */
export async function exitPresentationMode(_prev: ExitState, formData: FormData): Promise<ExitState> {
  const user = await requireUser();
  if (lockedOut(user.id)) return { error: "Too many attempts - try again in a few minutes." };

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true, passwordHash: true } });
  const digits = (dbUser?.phone ?? "").replace(/\D/g, "");

  if (digits.length >= 4) {
    const pin = String(formData.get("pin") ?? "").replace(/\D/g, "");
    if (pin !== digits.slice(-4)) {
      recordFailure(user.id);
      return { error: "Incorrect PIN. Please try again." };
    }
  } else {
    const password = String(formData.get("password") ?? "");
    const ok = password && dbUser ? await bcrypt.compare(password, dbUser.passwordHash) : false;
    if (!ok) {
      recordFailure(user.id);
      return { error: "Incorrect password. Please try again." };
    }
  }

  attempts.delete(user.id); // success clears the counter
  const store = await cookies();
  store.delete(PRESENTATION_COOKIE);
  redirect("/dashboard");
}
