"use client";

import { useActionState, useMemo, useState } from "react";
import { saveDemandAdjustment, type FormState } from "./actions";
import BrandSelect from "@/components/BrandSelect";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const PREVIEW_LEVELS = [15000, 12500, 10000, 7500, 5000];

export default function DemandAdjustmentForm({ initialPct }: { initialPct: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDemandAdjustment, undefined);
  const [magnitude, setMagnitude] = useState(String(Math.abs(initialPct)));
  const [direction, setDirection] = useState(initialPct < 0 ? "decrease" : "increase");

  const pct = (Number(magnitude) || 0) * (direction === "decrease" ? -1 : 1);

  // Mirrors applyDemandAdjustment: uncapped upward, floored at $0 downward.
  const preview = useMemo(
    () => PREVIEW_LEVELS.map((level) => {
      const final = Math.max(0, level + Math.round((level * pct) / 100));
      return { level, amount: final - level, final };
    }),
    [pct],
  );

  return (
    <form action={action}>
      <p className="help" style={{ marginBottom: 12 }}>
        Nudges every new or recomputed quote total by a percentage - for slow or busy stretches.
        Visible to admins only; members never see why a price moved.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="q" style={{ padding: 0, borderBottom: "none", flex: "0 0 120px" }}>
          <label className="qlabel" htmlFor="magnitude">Percent</label>
          <input
            id="magnitude"
            name="magnitude"
            type="text"
            inputMode="numeric"
            value={magnitude}
            onChange={(e) => setMagnitude(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div className="q" style={{ padding: 0, borderBottom: "none", flex: "0 0 160px" }}>
          <label className="qlabel" htmlFor="direction">Direction</label>
          <BrandSelect
            id="direction"
            name="direction"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "increase", label: "Increase" },
              { value: "decrease", label: "Decrease" },
            ]}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {state && (
        <p style={{ fontSize: "0.9rem", margin: "10px 0 0", color: state.ok ? "var(--good)" : "#b3261e" }}>
          {state.message}
        </p>
      )}

      <table className="simple" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Price level</th>
            <th className="amt">Adjustment</th>
            <th className="amt">Final price</th>
          </tr>
        </thead>
        <tbody>
          {preview.map((row) => (
            <tr key={row.level}>
              <td>{money(row.level)}</td>
              <td className="amt">{row.amount === 0 ? "-" : `${row.amount > 0 ? "+" : ""}${money(row.amount)}`}</td>
              <td className="amt">{money(row.final)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </form>
  );
}
