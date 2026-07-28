"use client";

import { useState, useTransition } from "react";
import { runAiAnalysis } from "@/app/(app)/register/ai-actions";

export function RunAiButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="mb-3 flex items-center gap-3">
      <button
        disabled={pending || count === 0}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await runAiAnalysis();
            setMsg(
              r.error
                ? `⚠ ${r.error}`
                : `✓ Analysed ${r.processed} item${r.processed === 1 ? "" : "s"}`,
            );
          })
        }
        className="rounded-[var(--radius-btn)] bg-indigo px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "✨ Analysing…" : `✨ Run AI analysis${count ? ` (${count})` : ""}`}
      </button>
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
    </div>
  );
}
