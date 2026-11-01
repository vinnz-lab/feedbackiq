"use client";

import { useActionState } from "react";
import { deleteBriefing, type BriefingState } from "@/app/(app)/briefings/actions";
import type { ScriptJson } from "@/lib/briefings";

export type BriefingView = {
  id: string;
  title: string;
  themeTitles: string[];
  nameMode: string;
  status: string;
  error: string | null;
  hasAudio: boolean;
  durationSec: number | null;
  sizeBytes: number | null;
  script: ScriptJson | null;
  createdAt: string;
  expiresAt: string;
};

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const NAMES: Record<string, string> = { mask: "initials", include: "names said", remove: "names left out" };

export function BriefingItem({ b, canEdit }: { b: BriefingView; canEdit: boolean }) {
  const [, del, deleting] = useActionState<BriefingState, FormData>(deleteBriefing, {});
  const daysLeft = Math.max(0, Math.ceil((new Date(b.expiresAt).getTime() - Date.now()) / 86_400_000));
  const pending = b.status === "writing" || b.status === "voicing";
  return (
    <article data-testid="briefing" data-status={b.status} className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold">{b.title}</h3>
          <p className="text-[11.5px] text-muted">
            {new Date(b.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {b.themeTitles.join(", ")} · {NAMES[b.nameMode] ?? b.nameMode}
            {b.durationSec ? ` · ${fmtDur(b.durationSec)}` : ""}
          </p>
        </div>
        <span
          className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-semibold"
          style={
            b.status === "ready"
              ? { background: "var(--emerald-soft)", color: "var(--emerald)" }
              : b.status === "failed"
                ? { background: "var(--rose-soft)", color: "var(--rose)" }
                : { background: "var(--amber-soft)", color: "var(--amber)" }
          }
        >
          {b.status === "ready" ? (b.hasAudio ? "Ready" : "Script only") : b.status === "failed" ? "Failed" : b.status === "voicing" ? "◐ Recording voices…" : "◐ Writing the script…"}
        </span>
      </div>

      {pending && <p className="mt-2 text-[12px] text-muted">This usually takes a minute or two. You can leave this page — the bell will tell you when it&apos;s ready.</p>}
      {b.status === "failed" && b.error && <p className="mt-2 text-[12.5px] text-rose">⚠ {b.error}</p>}

      {b.status === "ready" && b.hasAudio && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <audio controls preload="none" src={`/api/briefings/${b.id}/audio`} className="h-10 min-w-0 flex-1" aria-label={`Play ${b.title}`} />
          <a href={`/api/briefings/${b.id}/audio?download=1`} className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-hover">
            ⬇ Download MP3{b.sizeBytes ? ` (${(b.sizeBytes / 1_000_000).toFixed(1)} MB)` : ""}
          </a>
        </div>
      )}

      {b.script && (
        <details className="mt-3 rounded-[10px] border border-border bg-bg p-3 text-[12.5px]">
          <summary className="cursor-pointer font-semibold">Read the script</summary>
          <div className="mt-2 flex flex-col gap-2">
            {b.script.turns.map((t, i) => (
              <p key={i}>
                <b className={t.speaker === "Ava" ? "text-indigo" : "text-[var(--emerald)]"}>{t.speaker}:</b> {t.text}
              </p>
            ))}
          </div>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11.5px] text-muted">
        <span>{b.status === "ready" ? `Deleted automatically in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${new Date(b.expiresAt).toLocaleDateString("en-GB")}) — download it to keep it.` : ""}</span>
        {canEdit && (
          <form action={del} className="ml-auto" onSubmit={(e) => { if (!confirm("Delete this briefing?")) e.preventDefault(); }}>
            <input type="hidden" name="id" value={b.id} />
            <button type="submit" disabled={deleting} className="font-semibold text-rose hover:underline disabled:opacity-50">Delete</button>
          </form>
        )}
      </div>
    </article>
  );
}
