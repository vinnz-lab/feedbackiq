"use client";

import { useState, useTransition } from "react";
import { regenerateSummaries } from "@/app/(app)/themes/actions";

export function RegenerateSummariesButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await regenerateSummaries();
            const parts: string[] = [];
            if (r.updated) parts.push(`✓ Summarised ${r.updated}`);
            if (r.failed) parts.push(`${r.failed} failed`);
            const summary = parts.join(" · ") || "Nothing to summarise";
            setMsg(r.error ? `${summary} — ⚠ ${r.error}` : summary);
          })
        }
        className="rounded-[var(--radius-btn)] border border-border bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold shadow-[var(--shadow)] transition hover:bg-hover disabled:opacity-50"
      >
        {pending ? "✨ Summarising…" : "✨ Regenerate summaries"}
      </button>
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
    </div>
  );
}
