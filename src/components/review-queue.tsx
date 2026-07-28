"use client";

import { useState, useTransition } from "react";
import { ReviewCard, type ReviewItem } from "@/components/review-card";
import { RunAiButton } from "@/components/run-ai-button";
import { bulkApprove, bulkDiscard } from "@/app/(app)/register/actions";

export function ReviewQueue({
  items,
  themes,
  unclassified,
}: {
  items: ReviewItem[];
  themes: { id: string; title: string }[];
  unclassified: number;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clear = () => setSel(new Set());
  const allSelected = items.length > 0 && sel.size === items.length;
  const ids = [...sel];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RunAiButton count={unclassified} />
        {items.length > 0 && (
          <button
            onClick={() => (allSelected ? clear() : setSel(new Set(items.map((i) => i.id))))}
            className="text-[12px] font-semibold text-muted hover:text-fg"
          >
            {allSelected ? "Clear selection" : "Select all"}
          </button>
        )}
      </div>

      {items.map((it) => (
        <ReviewCard
          key={it.id}
          item={it}
          themes={themes}
          selectable
          selected={sel.has(it.id)}
          onToggle={() => toggle(it.id)}
        />
      ))}

      <p className="text-[12px] text-muted">
        Nothing here counts in themes, dashboards or digests until a human approves it.
      </p>

      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[12px] bg-fg px-4 py-2.5 text-bg shadow-[var(--shadow-lg)]">
          <b className="text-[13px]">{sel.size} selected</b>
          <span className="h-5 w-px bg-[var(--muted)] opacity-40" />
          <button
            disabled={pending}
            onClick={() => start(async () => { await bulkApprove(ids); clear(); })}
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
