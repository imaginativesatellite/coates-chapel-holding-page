"use client";

import { useEffect, useRef, useState } from "react";

/** Small copy-to-clipboard button, styled like the AI-recommendation copy
 *  buttons on the admin side ("Copied ✓" feedback, reverting after a moment). */
export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (old webview): fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setDone(true);
    timer.current = setTimeout(() => setDone(false), 2000);
  };

  return (
    <button
      type="button"
      className="btn-secondary"
      style={{ padding: "4px 10px", fontSize: "0.8rem", flex: "none" }}
      onClick={copy}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
