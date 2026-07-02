"use client";

import { useState } from "react";

export default function ClientNameInput({
  id,
  value,
  placeholder,
  suggestions,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  suggestions: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Keyboard highlight within the suggestion list (mouse hover uses CSS alone).
  const [active, setActive] = useState(-1);
  const q = value.trim().toLowerCase();
  const matches = q
    ? suggestions.filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q).slice(0, 8)
    : [];

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.min(matches.length - 1, Math.max(0, i + delta)));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="autocomplete-wrap">
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && matches.length > 0 && (
        <div className="autocomplete-list">
          {matches.map((m, i) => (
            <div
              key={m}
              className={`autocomplete-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
            >
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
