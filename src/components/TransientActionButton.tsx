"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * A button that runs a (bound) server action and briefly shows a success
 * label before reverting - quiet confirmation for fire-and-forget actions
 * like "Resend email" or "Sync from Documenso" that otherwise give no
 * feedback. Errors show inline (generic in production, where thrown
 * server-action messages are masked).
 */
export default function TransientActionButton({
  action,
  label,
  pendingLabel,
  doneLabel,
  className = "btn-secondary",
  style,
  title,
  holdMs = 2500,
}: {
  action: () => Promise<unknown>;
  label: string;
  pendingLabel: string;
  doneLabel: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  holdMs?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setDone(true);
        timer.current = setTimeout(() => setDone(false), holdMs);
      } catch {
        setError("Couldn't complete - try again.");
      }
    });
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        className={className}
        style={{ ...style, ...(done ? { color: "var(--good)", borderColor: "var(--good)" } : {}) }}
        disabled={pending || done}
        onClick={run}
        title={title}
      >
        {pending ? pendingLabel : done ? doneLabel : label}
      </button>
      {error && <span className="help" style={{ color: "#b3261e" }}>{error}</span>}
    </span>
  );
}
