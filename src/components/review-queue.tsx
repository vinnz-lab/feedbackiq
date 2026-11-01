"use client";

import { useRef, useState, useTransition } from "react";
import { ReviewCard, type ReviewItem } from "@/components/review-card";
import { RunAiButton } from "@/components/run-ai-button";
import { SPLIT_THRESHOLD_CHARS } from "@/lib/ai/limits";
import { bulkApprove, bulkDiscard } from "@/app/(app)/register/actions";

export function ReviewQueue({
  items,
  themes,
  unclassified,
  readOnly = false,
}: {
  items: ReviewItem[];
  themes: { id: string; title: string }[];
  unclassified: number;
  /** Viewers: see the queue, change nothing. */
  readOnly?: boolean;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  /** Anchor for shift-click range selection. */
  const lastIndex = useRef<number | null>(null);

  const clear = () => {
    setSel(new Set());
    lastIndex.current = null;
  };
  const selectAll = () => setSel(new Set(items.map((i) => i.id)));

  /**
   * Toggling one item, or — with shift held — everything between this item and
   * the previous click. A batch arriving from one upload lands as a contiguous
   * run, so a range select is what actually clears it in two clicks.
   */
  const toggle = (index: number, shiftKey: boolean) => {
    // Computed outside setState on purpose. An earlier version read the anchor
    // ref inside the updater and then reassigned the ref straight afterwards —
    // React may invoke an updater more than once, so the second pass saw the
    // new anchor, took the single-toggle branch, and undid part of the range.
    const anchor = lastIndex.current;
    const next = new Set(sel);

    if (shiftKey && anchor !== null && anchor !== index) {
      const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
      // Apply one consistent action across the run, based on the clicked item.
      const turningOn = !sel.has(items[index].id);
      for (let i = from; i <= to; i++) {
        if (turningOn) next.add(items[i].id);
        else next.delete(items[i].id);
      }
    } else {
      const id = items[index].id;
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }

    lastIndex.current = index;
    setSel(next);
  };

  const allSelected = items.length > 0 && sel.size === items.length;
  const someSelected = sel.size > 0 && !allSelected;
  const ids = [...sel];
  // Ticked rows that still need AI: unclassified, or a long source not yet split.
  const eligible = items.filter(
    (i) => sel.has(i.id) && (!i.type || i.quote.length > SPLIT_THRESHOLD_CHARS),
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!readOnly && <RunAiButton count={unclassified} selectedIds={ids} selectedEligible={eligible} />}
        {readOnly && <span className="text-[12px] text-muted">👁 View only — you can see the queue but not approve, discard or run AI.</span>}
      </div>

      {/* Selection toolbar. Sticky because the queue can run to dozens of
          items, and a control you have scrolled past may as well not exist —
          which is exactly how 40 rows got discarded one at a time. */}
      {items.length > 0 && !readOnly && (
        <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-surface px-3 py-2 shadow-[var(--shadow)]">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={() => (allSelected ? clear() : selectAll())}
              className="h-4 w-4 cursor-pointer accent-[var(--indigo)]"
            />
            {allSelected ? "Clear selection" : `Select all ${items.length}`}
          </label>

          {sel.size > 0 && (
            <span className="text-[12px] text-muted">
              {sel.size} of {items.length} selected
            </span>
          )}

          <span className="ml-auto hidden text-[11.5px] text-muted sm:block">
            Tip: hold <kbd className="rounded border border-border px-1 font-mono">Shift</kbd> to
            select a range
          </span>
        </div>
      )}

      {items.map((it, i) => (
        <ReviewCard
          key={it.id}
          item={it}
          themes={themes}
          selectable={!readOnly}
          readOnly={readOnly}
          selected={sel.has(it.id)}
          onToggle={(shiftKey) => toggle(i, shiftKey)}
        />
      ))}

      {note && <p className="text-[12.5px] font-medium text-amber">⚠ {note}</p>}
      <p className="text-[12px] text-muted">
        Nothing here counts in themes, dashboards or digests until a human approves it.
      </p>

      {sel.size > 0 && !readOnly && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[12px] bg-fg px-4 py-2.5 text-bg shadow-[var(--shadow-lg)]">
          <b className="text-[13px]">{sel.size} selected</b>
          <span className="h-5 w-px bg-[var(--muted)] opacity-40" />
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await bulkApprove(ids);
                setNote(
                  r.skipped
                    ? `Approved ${r.approved}. ${r.skipped} not approved — run AI analysis on them first.`
                    : null,
                );
                clear();
              })
            }
            className="rounded-[7px] bg-[var(--indigo)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "…" : `✓ Approve ${sel.size}`}
          </button>
          <button
            disabled={pending}
            onClick={() => start(async () => { await bulkDiscard(ids); clear(); })}
            className="rounded-[7px] border border-[var(--muted)] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            🗑 Discard {sel.size}
          </button>
          <button onClick={clear} className="text-[12px] font-semibold opacity-70 hover:opacity-100">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
