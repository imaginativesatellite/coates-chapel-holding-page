"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, ShoppingCart, FileText, PawPrint, Newspaper, FolderOpen, PlusCircle, Sparkles, Clock, type LucideIcon } from "lucide-react";
import { QUESTIONNAIRE, isFollowUp, isVisible, splitLabel, type Question } from "@/lib/questionnaire";
import ClientNameInput from "@/components/ClientNameInput";
import BrandSelect from "@/components/BrandSelect";
import AutoGrowTextarea from "@/components/AutoGrowTextarea";
import { VISIBILITY_TIP } from "@/lib/quote";
import { createQuote } from "./actions";

const DRAFT_KEY = "droptine-quote-draft";

// Icon per questionnaire section, to make the long form easier to scan.
const SECTION_ICONS: Record<string, LucideIcon> = {
  "Existing site": Globe,
  "E-commerce": ShoppingCart,
  "Pages": FileText,
  "Animals & pedigrees": PawPrint,
  "Content": Newspaper,
  "Add-ons": PlusCircle,
  "Turnaround Time": Clock,
  "Custom": Sparkles,
};

// "No preference" is the default turnaround so the dropdown never blocks
// submission and a member who skips it gets the standard (no-fee) lead time.
const DEFAULT_ANSWERS: Answers = { rushTurnaround: "no-preference" };
const FALLBACK_SECTION_ICON: LucideIcon = FolderOpen;

type Answers = Record<string, string | boolean | string[] | undefined>;

// Every visible question must be answered, except the free-text box at the end.
function isAnswered(q: Question, answers: Answers): boolean {
  const v = answers[q.id];
  if (q.type === "boolean") return v === true || v === false;
  if (q.type === "multi") return Array.isArray(v) && v.length > 0;
  return v !== undefined && String(v).trim() !== "";
}

export default function NewQuoteForm({ clientNames, defaultShared }: { clientNames: string[]; defaultShared: boolean }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [shared, setShared] = useState(defaultShared);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const loaded = useRef(false);

  // Restore an in-progress draft from this device (survives a dropped connection).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setAnswers({ ...DEFAULT_ANSWERS, ...JSON.parse(raw) });
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
    } catch {}
  }, [answers]);

  const set = (id: string, value: Answers[string]) => setAnswers((a) => ({ ...a, [id]: value }));
  const questions = QUESTIONNAIRE.filter((q) => isVisible(q, answers));
  const unanswered = questions.filter((q) => q.id !== "additionalFunctionality" && !isAnswered(q, answers));
  const canSubmit = unanswered.length === 0;

  // The disabled button alone doesn't say WHY - point at the first gap.
  const jumpToUnanswered = () =>
    document.getElementById(`q-${unanswered[0]?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createQuote(answers, shared);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // Clear the draft only once the save is confirmed, so an unexpected
      // failure (even one that trips the error boundary) never loses answers.
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      router.push(`/quote/${res.id}`);
    });
  };

  const clearAll = () => {
    setAnswers(DEFAULT_ANSWERS);
    setError(null);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>New Quote</h1>
        <button type="button" className="clear-all-link" onClick={clearAll}>
          Clear
        </button>
      </div>
      <div className="card qform">
        {questions.map((q, i) => {
          const showHeader = q.section && q.section !== questions[i - 1]?.section;
          const followUp = isFollowUp(q, questions[i - 1]);
          const hasFollowUp = Boolean(questions[i + 1] && isFollowUp(questions[i + 1], q));
          const qClass = ["q", followUp && "q-followup", hasFollowUp && "q-has-followup"].filter(Boolean).join(" ");
          return (
            <Fragment key={q.id}>
              {showHeader && (() => {
                const SectionIcon = SECTION_ICONS[q.section!] ?? FALLBACK_SECTION_ICON;
                return (
                  <h3 className="section-head">
                    <SectionIcon size={15} aria-hidden /> {q.section}
                  </h3>
                );
              })()}
              {/* id anchors the "jump to the next one" scroll (labels alone
                  have no target for boolean/multi questions). */}
              <div className={qClass} id={`q-${q.id}`}>
                <label className="qlabel" htmlFor={q.id}>
                  {splitLabel(q).map((p, idx) => (p.bold ? <strong key={idx}>{p.text}</strong> : p.text))}
                  {q.id !== "additionalFunctionality" && <span className="req">*</span>}
                </label>
                {q.help && <div className="help">{q.help}</div>}
                {q.id === "proposalName" ? (
                  <ClientNameInput
                    id={q.id}
                    value={String(answers[q.id] ?? "")}
                    placeholder={(q as { placeholder?: string }).placeholder}
                    suggestions={clientNames}
                    onChange={(v) => set(q.id, v)}
                  />
                ) : (
                  renderInput(q, answers, set)
                )}
              </div>
            </Fragment>
          );
        })}
      </div>

      {error && (
        <p style={{ color: "#b3261e", fontSize: "0.9rem", marginTop: 12 }}>
          {error} Your answers are saved on this device - just press the button again.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <label className="switch-row">
          <span className="switch">
            <input type="checkbox" checked={!shared} onChange={(e) => setShared(!e.target.checked)} />
            <span className="slider" />
          </span>
          <span>
            Private{" "}
            <span className="tip" title={VISIBILITY_TIP}>ⓘ</span>
          </span>
        </label>
      </div>

      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn-primary" disabled={pending || !canSubmit} onClick={submit}>
          {pending ? "Saving…" : "Generate Proposal"}
        </button>
        {!canSubmit && (
          <p className="help" style={{ marginTop: 8 }}>
            {unanswered.length} required question{unanswered.length === 1 ? "" : "s"} left -{" "}
            <button type="button" className="jump-link" onClick={jumpToUnanswered}>jump to the next one</button>
          </p>
        )}
      </div>
    </div>
  );
}

function renderInput(q: Question, answers: Answers, set: (id: string, v: Answers[string]) => void) {
  switch (q.type) {
    case "boolean":
      return (
        <div className="toggle">
          <button type="button" className={answers[q.id] === true ? "on" : ""} onClick={() => set(q.id, true)}>Yes</button>
          <button type="button" className={answers[q.id] === false ? "on" : ""} onClick={() => set(q.id, false)}>No</button>
        </div>
      );
    case "single":
      return (
        <BrandSelect
          id={q.id}
          value={(answers[q.id] as string) ?? ""}
          onChange={(v) => set(q.id, v || undefined)}
          options={q.options}
        />
      );
    case "multi":
      return (
        <div>
          {q.options.map((o) => {
            const arr = (answers[q.id] as string[]) ?? [];
            const checked = arr.includes(o.value);
            return (
              <label key={o.value} style={{ display: "block", fontSize: "0.9rem", padding: "3px 0" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => set(q.id, checked ? arr.filter((v) => v !== o.value) : [...arr, o.value])}
                  style={{ width: "auto", marginRight: 8 }}
                />
                {o.label}
              </label>
            );
          })}
        </div>
      );
    case "longtext":
      return (
        <AutoGrowTextarea id={q.id} placeholder={q.placeholder} value={(answers[q.id] as string) ?? ""} onChange={(v) => set(q.id, v)} />
      );
    default: {
      const numeric = "numeric" in q && q.numeric;
      return (
        <input
          id={q.id}
          type={q.type}
          inputMode={numeric ? "numeric" : undefined}
          placeholder={q.placeholder}
          value={(answers[q.id] as string) ?? ""}
          onChange={(e) => set(q.id, numeric ? e.target.value.replace(/[^0-9]/g, "") : e.target.value)}
        />
      );
    }
  }
}
