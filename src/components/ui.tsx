import type { ReactNode } from "react";

/* ---------------- Card ---------------- */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)] ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------- Type pill ---------------- */
export type FeedbackType = "Feature" | "Bug" | "UX" | "Question" | "Praise";

const TYPE_STYLES: Record<FeedbackType, { bg: string; fg: string }> = {
  Feature: { bg: "var(--indigo-soft)", fg: "var(--indigo)" },
  Bug: { bg: "var(--rose-soft)", fg: "var(--rose)" },
  UX: { bg: "var(--amber-soft)", fg: "var(--amber)" },
  Question: { bg: "var(--slate-soft)", fg: "var(--slate)" },
  Praise: { bg: "var(--emerald-soft)", fg: "var(--emerald)" },
};

export function TypePill({ type }: { type: FeedbackType }) {
  const s = TYPE_STYLES[type];
  return (
    <span
      className="inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {type}
    </span>
  );
}

/* ---------------- Sentiment ---------------- */
export type Sentiment = "Positive" | "Neutral" | "Negative";
export const SENTIMENT_COLOR: Record<Sentiment, string> = {
  Positive: "var(--emerald)",
  Neutral: "var(--amber)",
  Negative: "var(--rose)",
};

export function SentimentPill({ sentiment }: { sentiment: Sentiment }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-border px-2 py-0.5 text-[11.5px] font-semibold text-muted">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: SENTIMENT_COLOR[sentiment] }}
      />
      {sentiment}
    </span>
  );
}

/* ---------------- Priority ---------------- */
export type Priority = "High" | "Medium" | "Low";
const PRIORITY_BORDER: Record<Priority, string> = {
  High: "var(--rose)",
  Medium: "var(--amber)",
  Low: "var(--slate)",
};

export function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span
      className="inline-flex items-center rounded-[5px] border border-border px-2 py-0.5 text-[11.5px] font-semibold text-muted"
      style={{ borderLeftWidth: 3, borderLeftColor: PRIORITY_BORDER[priority] }}
    >
      {priority}
    </span>
  );
}

/* ---------------- Delta chip ---------------- */
export function DeltaChip({ value }: { value: number }) {
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const arrow = value > 0 ? "↗" : value < 0 ? "↘" : "—";
  const label = value === 0 ? "0%" : `${value > 0 ? "+" : "−"}${Math.abs(value)}%`;
  const style =
    dir === "up"
      ? { color: "var(--emerald)", background: "var(--emerald-soft)" }
      : dir === "down"
        ? { color: "var(--rose)", background: "var(--rose-soft)" }
        : { color: "var(--slate)", background: "var(--slate-soft)" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-[11.5px] font-bold"
      style={style}
    >
      {arrow} {label}
    </span>
  );
}

/* ---------------- Sentiment bar (signature component) ---------------- */
export function SentimentBar({
  positive,
  neutral,
  negative,
  showLegend = false,
  slim = false,
}: {
  positive: number;
  neutral: number;
  negative: number;
  showLegend?: boolean;
  slim?: boolean;
}) {
  const total = positive + neutral + negative || 1;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div>
      <div
        className={`flex overflow-hidden rounded-[5px] ${slim ? "h-1.5" : "h-2"}`}
        style={{ background: "var(--slate-soft)" }}
      >
        <span style={{ width: pct(positive), background: "var(--emerald)" }} />
        <span style={{ width: pct(neutral), background: "var(--amber)" }} />
        <span style={{ width: pct(negative), background: "var(--rose)" }} />
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-3.5 text-[12px] text-muted">
          <Legend color="var(--emerald)" label="Positive" n={positive} />
          <Legend color="var(--amber)" label="Neutral" n={neutral} />
          <Legend color="var(--rose)" label="Negative" n={negative} />
        </div>
      )}
    </div>
  );
}

function Legend({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label} · <b className="font-semibold">{n}</b>
    </span>
  );
}

/* ---------------- AI text marker ---------------- */
export function AiText({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted">
      <span className="not-italic">✨</span> {children}
    </span>
  );
}
