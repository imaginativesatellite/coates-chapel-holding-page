"use client";

import { useState } from "react";
import { MAX_DISCLAIMERS, type Disclaimer } from "@/lib/quote";
import BrandSelect from "@/components/BrandSelect";

/** Up to MAX_DISCLAIMERS single-line disclaimers, each placed on the website
 *  price or the monthly section. Renders plain named inputs
 *  (disclaimerText{i} / disclaimerPlacement{i}) so they submit as part of
 *  the surrounding server-action form. */
export default function DisclaimersField({ initial }: { initial: Disclaimer[] }) {
  const [rows, setRows] = useState<Disclaimer[]>(initial);

  const addRow = () => {
    if (rows.length >= MAX_DISCLAIMERS) return;
    setRows([...rows, { text: "", placement: "development" }]);
  };
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<Disclaimer>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <label className="qlabel" style={{ display: "block", marginBottom: 10 }}>Disclaimers (optional)</label>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            name={`disclaimerText${i}`}
            value={row.text}
            onChange={(e) => updateRow(i, { text: e.target.value })}
            placeholder="Disclaimer text"
            style={{ flex: "1 1 180px", minWidth: 0 }}
          />
          <div style={{ width: 160, flex: "none" }}>
            <BrandSelect
              name={`disclaimerPlacement${i}`}
              value={row.placement}
              onChange={(v) => updateRow(i, { placement: v as Disclaimer["placement"] })}
              options={[
                { value: "development", label: "Website price" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(i)}
            aria-label="Remove disclaimer"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "1.1rem", padding: "0 4px" }}
          >
            ×
          </button>
        </div>
      ))}
      {rows.length < MAX_DISCLAIMERS && (
        <button type="button" onClick={addRow} className="btn-secondary" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
          + Add disclaimer
        </button>
      )}
    </div>
  );
}
