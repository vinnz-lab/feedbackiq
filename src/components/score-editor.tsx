"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEnhancementEstimates, reestimateEnhancement } from "@/app/(app)/roadmap/actions";

/** Benefit and effort inputs for one roadmap row, plus a re-estimate button. */
export function ScoreEditor({ id, benefit, effort }: { id: string; benefit: number; effort: number }) {
  const [b, setB] = useState(benefit);
  const [e, setE] = useState(effort);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = (nb: number, ne: number) =>
    start(async () => {
      const r = await updateEnhancementEstimates(id, nb, ne);
      setNote(r.ok ? null : r.error ?? "Could not save");
      router.refresh();
    });

  const input = (value: number, set: (n: number) => void, label: string, onCommit: (n: number) => void) => (
    <input
      type="number"
      min={1}
      max={10}
      step={1}
      aria-label={label}
      value={value}
      disabled={pending}
      onChange={(ev) => set(Number(ev.target.value))}
      onBlur={() => {
        const clamped = Math.min(10, Math.max(1, Math.round(value) || 1));
        set(clamped);
        onCommit(clamped);
      }}
      className="w-14 rounded-[6px] border border-border bg-bg px-1.5 py-0.5 text-center text-[12px] disabled:opacity-50"
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-[11px] text-muted">
        Benefit {input(b, setB, "Benefit", (n) => save(n, e))}
      </label>
      <label className="flex items-center gap-1 text-[11px] text-muted">
        Effort {input(e, setE, "Effort", (n) => save(b, n))}
      </label>
      <button
        type="button"
        disabled={pending}
        title="Recalculate from the feedback behind this item"
        onClick={() =>
          start(async () => {
            const r = await reestimateEnhancement(id);
            setNote(r.ok ? `Re-estimated: ${r.reason}` : r.error ?? "Could not re-estimate");
            router.refresh();
          })
        }
        className="rounded-[6px] border border-border px-2 py-0.5 text-[11px] font-semibold text-indigo hover:bg-hover disabled:opacity-50"
      >
        ↻ Re-estimate
      </button>
      {note && <span className="basis-full text-[11px] text-muted">{note}</span>}
    </div>
  );
}
