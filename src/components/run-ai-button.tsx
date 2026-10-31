"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAiAnalysis } from "@/app/(app)/register/ai-actions";

export function RunAiButton({
  count,
  selectedIds = [],
  selectedEligible = 0,
}: {
  /** Everything waiting for AI. */
  count: number;
  /** Rows the user has ticked. When any, the run is limited to them. */
  selectedIds?: string[];
  /** How many of the ticked rows actually need AI (others are skipped). */
  selectedEligible?: number;
}) {
  const scoped = selectedIds.length > 0;
  const shown = scoped ? selectedEligible : count;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);
  const router = useRouter();

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button
        disabled={pending || shown === 0}
        onClick={() =>
          start(async () => {
            setMsg(null);
            setWarn(false);
            const r = await runAiAnalysis(scoped ? selectedIds : undefined);

            // Report the whole picture. Surfacing only successes is what made a
            // 5-of-40 run look like a clean success and left the rest stuck on
            // "Awaiting AI" with no explanation.
            const parts: string[] = [];
            if (r.split)
              parts.push(
                `✂ Split ${r.split} long source${r.split === 1 ? "" : "s"} into ${r.extracted} items`,
              );
            if (r.processed) parts.push(`✓ Analysed ${r.processed}`);
            if (r.duplicatesSkipped)
              parts.push(`${r.duplicatesSkipped} already present, skipped`);
            if (r.failed) parts.push(`${r.failed} failed`);
            if (r.remaining) parts.push(`${r.remaining} still waiting`);
            const summary = parts.join(" · ") || "Nothing to analyse";

            setWarn(Boolean(r.error) || r.failed > 0);
            setMsg(
              r.error
                ? parts.length
                  ? `${summary} — ${r.error}`
                  : r.error.charAt(0).toUpperCase() + r.error.slice(1) // nothing ran: the reason is the whole story
                : r.remaining
                  ? `${summary} — run again to continue`
                  : summary,
            );
            router.refresh();
          })
        }
        className="rounded-[var(--radius-btn)] bg-indigo px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {pending
          ? "✨ Analysing…"
          : scoped
            ? `✨ Run AI analysis on selected (${shown})`
            : `✨ Run AI analysis${count ? ` (${count})` : ""}`}
      </button>

      {pending && (
        <span className="text-[12px] text-muted">
          A large batch can take a minute or two.
        </span>
      )}
      {!pending && scoped && selectedEligible < selectedIds.length && (
        <span className="text-[12px] text-muted">
          {selectedIds.length - selectedEligible} selected already analysed — skipped
        </span>
      )}
      {!pending && msg && (
        <span className={`text-[12px] ${warn ? "text-amber" : "text-muted"}`}>
          {warn ? "⚠ " : ""}
          {msg}
        </span>
      )}
    </div>
  );
}
