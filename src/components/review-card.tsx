"use client";

import { useState, useTransition } from "react";
import {
  TypePill,
  SentimentPill,
  type FeedbackType,
  type Sentiment,
} from "@/components/ui";
import { approveItem, discardItem, correctAndApprove } from "@/app/(app)/register/actions";
import type { FeedbackTypeT, SentimentT, PriorityT } from "@/db/schema";

export type ReviewItem = {
  id: string;
  quote: string;
  sourceIcon: string;
  sourceName: string | null;
  reason: string | null;
  type: string | null;
  sentiment: string | null;
  confidence: string | null;
  themeTitle: string | null;
  who: string | null;
};

const TYPES: FeedbackTypeT[] = ["Feature", "Bug", "UX", "Question", "Praise"];
const SENTIMENTS: SentimentT[] = ["Positive", "Neutral", "Negative"];

function reasonChip(reason: string | null) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    "low confidence": { bg: "var(--amber-soft)", fg: "var(--amber)", label: "◐ Low confidence" },
    "awaiting AI": { bg: "var(--slate-soft)", fg: "var(--slate)", label: "✨ Awaiting AI" },
    "arrived unattended": { bg: "var(--indigo-soft)", fg: "var(--indigo)", label: "⚡ Arrived unattended" },
  };
  // No reason left = the AI classified it confidently and it's ready for a
  // human decision. Previously this fell through to "Arrived unattended",
  // which was simply wrong for uploaded files.
  return (
    map[reason ?? ""] ?? {
      bg: "var(--emerald-soft)",
      fg: "var(--emerald)",
      label: "✨ AI classified",
    }
  );
}

export function ReviewCard({
  item,
  themes,
  selectable = false,
  selected = false,
  onToggle,
}: {
  item: ReviewItem;
  themes: { id: string; title: string }[];
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<FeedbackTypeT>((item.type as FeedbackTypeT) || "Feature");
  const [sentiment, setSentiment] = useState<SentimentT>((item.sentiment as SentimentT) || "Neutral");
  const [themeId, setThemeId] = useState<string>(
    themes.find((t) => t.title === item.themeTitle)?.id ?? "",
  );
  const c = reasonChip(item.reason);

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 accent-[var(--indigo)]"
            aria-label="Select item"
          />
        )}
        <span
          className="inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] text-muted"
          style={{ background: "var(--slate-soft)" }}
        >
          {item.sourceIcon} {item.sourceName ?? "source"}
        </span>
        <span
          className="inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-semibold"
          style={{ background: c.bg, color: c.fg }}
        >
          {c.label}
        </span>
        <span className="ml-auto text-[11.5px] text-muted">Confidence: {item.confidence ?? "—"}</span>
      </div>

      <div className="text-[14px] font-medium">“{item.quote}”</div>

      {!editing && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {item.type || item.sentiment ? (
            <>
              <span className="text-[12px] text-muted">✨ AI suggests:</span>
              {item.type && <TypePill type={item.type as FeedbackType} />}
              {item.sentiment && <SentimentPill sentiment={item.sentiment as Sentiment} />}
              {item.themeTitle && (
                <span
                  className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-semibold"
                  style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}
                >
                  {item.themeTitle}
                </span>
              )}
            </>
          ) : (
            <span className="text-[12px] text-muted">Not yet analysed by AI</span>
          )}
          {item.who && <span className="text-[12px] text-muted">· {item.who}</span>}
        </div>
      )}

      {editing && (
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as FeedbackTypeT)} className="fiq-select">
              {TYPES.map((t) => (<option key={t}>{t}</option>))}
            </select>
          </Field>
          <Field label="Sentiment">
            <select value={sentiment} onChange={(e) => setSentiment(e.target.value as SentimentT)} className="fiq-select">
              {SENTIMENTS.map((s) => (<option key={s}>{s}</option>))}
            </select>
          </Field>
          <Field label="Theme">
            <select value={themeId} onChange={(e) => setThemeId(e.target.value)} className="fiq-select">
              <option value="">— none —</option>
              {themes.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
            </select>
          </Field>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!editing ? (
          <>
            <button
              disabled={pending}
              onClick={() => start(() => approveItem(item.id))}
              className="rounded-[var(--radius-btn)] bg-indigo px-3 py-1.5 text-[12px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "…" : "✓ Approve"}
            </button>
            <button
              disabled={pending}
              onClick={() => setEditing(true)}
              className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-hover"
            >
              ✎ Correct
            </button>
            <button
              disabled={pending}
              onClick={() => start(() => discardItem(item.id))}
              className="ml-auto rounded-[var(--radius-btn)] px-3 py-1.5 text-[12px] font-semibold text-rose hover:bg-[var(--rose-soft)] disabled:opacity-50"
            >
              🗑 Discard
            </button>
          </>
        ) : (
          <>
            <button
              disabled={pending}
              onClick={() =>
                start(() =>
                  correctAndApprove(item.id, {
                    type,
                    sentiment,
                    themeId: themeId || null,
                  }),
                )
              }
              className="rounded-[var(--radius-btn)] bg-indigo px-3 py-1.5 text-[12px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save & approve"}
            </button>
            <button
              disabled={pending}
              onClick={() => setEditing(false)}
              className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-hover"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
