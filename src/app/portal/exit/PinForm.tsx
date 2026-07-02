"use client";

import { useActionState } from "react";
import Link from "next/link";
import { exitPresentationMode, type ExitState } from "./actions";

export default function PinForm({ hasPin }: { hasPin: boolean }) {
  const [state, action, pending] = useActionState<ExitState, FormData>(exitPresentationMode, undefined);

  return (
    <form action={action}>
      <h2 style={{ marginBottom: hasPin ? 16 : 6 }}>{hasPin ? "Enter your PIN" : "Enter your password"}</h2>
      {!hasPin && (
        <p className="help" style={{ marginBottom: 16 }}>
          No phone number is on file for this account, so exiting requires your account password.
        </p>
      )}

      {hasPin ? (
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={4}
          placeholder="••••"
          style={{ width: "100%", display: "block", textAlign: "center", letterSpacing: "0.4em", fontSize: "1.5rem", padding: "12px" }}
        />
      ) : (
        <input name="password" type="password" autoComplete="current-password" autoFocus />
      )}

      {state?.error && (
        <p style={{ color: "#b3261e", fontSize: "0.9rem", marginTop: 12 }}>{state.error}</p>
      )}

      <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 18, width: "100%" }}>
        {pending ? "Checking…" : "Continue"}
      </button>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <Link href="/portal" className="help" style={{ textDecoration: "none" }}>← Back</Link>
      </div>
    </form>
  );
}
