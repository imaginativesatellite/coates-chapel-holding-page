"use client";

import { useActionState, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { MAX_INCREMENTS, type Markup } from "@/lib/portal";
import { saveMarkup, type FormState } from "./actions";

const unitStyle = { color: "var(--muted)", fontSize: "1rem" } as const;
const fieldRow = { display: "flex", alignItems: "center", gap: 6 } as const;

export default function MarkupForm({ markup }: { markup: Markup }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMarkup, undefined);
  const [unit, setUnit] = useState(markup.websiteIsPercent ? "percent" : "flat");
  const isPercent = unit === "percent";

  return (
    <form action={action} className="card">
      <h3 style={{ marginBottom: 4 }}>Website markup</h3>
      <p className="help" style={{ marginBottom: 10 }}>
        Added on top of Luna Creative&rsquo;s website build price. Use a flat dollar
        amount, or a percentage of the build price.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={fieldRow}>
          {!isPercent && <span style={unitStyle}>$</span>}
          <input
            name="markupWebsite"
            type="text"
            inputMode="decimal"
            defaultValue={String(markup.website)}
            style={{ width: 140 }}
          />
          {isPercent && <span style={unitStyle}>%</span>}
        </div>
        <div style={{ minWidth: 180 }}>
          <input type="hidden" name="markupWebsiteIsPercent" value={unit} />
          <BrandSelect
            value={unit}
            onChange={setUnit}
            options={[
              { value: "flat", label: "Flat dollars ($)" },
              { value: "percent", label: "Percentage (%)" },
            ]}
          />
        </div>
      </div>

      <h3 style={{ margin: "22px 0 4px" }}>Monthly markup</h3>
      <p className="help" style={{ marginBottom: 10 }}>
        Added on top of Luna Creative&rsquo;s monthly hosting &amp; maintenance price.
      </p>
      <div style={fieldRow}>
        <span style={unitStyle}>$</span>
        <input name="markupMonthly" type="text" inputMode="decimal" defaultValue={String(markup.monthly)} style={{ width: 140 }} />
      </div>

      <h3 style={{ margin: "22px 0 4px" }}>Increment amount</h3>
      <p className="help" style={{ marginBottom: 10 }}>
        Each tap of the price arrows on the questionnaire adds this much, up to {MAX_INCREMENTS} times.
      </p>
      <div style={fieldRow}>
        <span style={unitStyle}>$</span>
        <input name="markupIncrement" type="text" inputMode="decimal" defaultValue={String(markup.increment)} style={{ width: 140 }} />
      </div>

      {state && (
        <p style={{ marginTop: 14, fontSize: "0.9rem", color: state.ok ? "var(--good)" : "#b3261e" }}>
          {state.message}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 18 }}>
        {pending ? "Saving…" : "Save markup"}
      </button>
    </form>
  );
}
