"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAiAnalysis } from "@/app/(app)/register/ai-actions";

export function RunAiButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);
  const router = useRouter();

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button
        disabled={pending || count === 0}
        onClick={() =>
          start(async () => {
            setMsg(null);
            setWarn(false);
            const r = await runAiAnalysis();

            // Report the whole picture. Surfacing only successes is what made a
            // 5-of-40 run look like a clean success and left the rest stuck on
            // "Awaiting AI" with no explanation.
            const parts: string[] = [];
            if (r.split)
              parts.push(
                `✂ Split ${r.split} long source${r.split === 1 ? "" : "s"} into ${r.extracted} items`,
              );
            if (r.processed) parts.push(`✓ Analysed ${r.processed}`);
            if (r.failed) parts.push(`${r.failed} failed`);
            if (r.remaining) parts.push(`${r.remaining} still waiting`);
            const summary = parts.join(" · ") || "Nothing to analyse";

            setWarn(Boolean(r.error) || r.failed > 0);
            setMsg(
              r.error
                ? `${summary} — ${r.error}`
                : r.remaining
                  ? `${summary} — run again to continue`
                  : summary,
            );
            router.refresh();
          })
        }
        className="rounded-[var(--radius-btn)] bg-indigo px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "✨ Analysing…" : `✨ Run AI analysis${count ? ` (${count})` : ""}`}
      </button>

      {pending && (
        <span className="text-[12px] text-muted">
          Paced for the free tier — a large batch can take a couple of minutes.
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
