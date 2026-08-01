"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pollTranscriptions } from "@/app/(app)/register/transcribe-actions";

/** Shown when recordings are mid-transcription. Transcription is asynchronous
 *  and the host has no background workers, so the check happens on demand. */
export function CheckTranscriptionsButton({ pending }: { pending: number }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);
  const router = useRouter();

  if (!pending) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button
        disabled={busy}
        onClick={() =>
          start(async () => {
            setMsg(null);
            setWarn(false);
            const r = await pollTranscriptions();

            const parts: string[] = [];
            if (r.completed) parts.push(`✓ ${r.completed} transcribed`);
            if (r.stillRunning) parts.push(`${r.stillRunning} still running`);
            if (r.failed) parts.push(`${r.failed} failed`);
            const summary = parts.join(" · ") || "Nothing in progress";

            setWarn(Boolean(r.error) || r.failed > 0);
            setMsg(r.error ? `${summary} — ${r.error}` : summary);
            router.refresh();
          })
        }
        className="rounded-[var(--radius-btn)] border border-border bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold shadow-[var(--shadow)] transition hover:bg-hover disabled:opacity-50"
      >
        {busy ? "🎙 Checking…" : `🎙 Check transcriptions (${pending})`}
      </button>
      {!busy && msg && (
        <span className={`text-[12px] ${warn ? "text-amber" : "text-muted"}`}>
          {warn ? "⚠ " : ""}
          {msg}
        </span>
      )}
      {busy && (
        <span className="text-[12px] text-muted">
          A long recording can take a few minutes to come back.
        </span>
      )}
    </div>
  );
}
