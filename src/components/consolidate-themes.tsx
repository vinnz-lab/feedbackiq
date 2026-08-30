"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reviewThemes,
  applyMerge,
  type ReviewResult,
} from "@/app/(app)/themes/consolidate-actions";

/**
 * Reviews the theme list for duplicates and offers each merge for approval.
 *
 * Approval is per group rather than "apply all" on purpose: the model is right
 * about most groups and wrong about some, and a wrong merge permanently folds a
 * distinct theme into another. One bad suggestion should not ride along with
 * five good ones.
 */
export function ConsolidateThemes({ themeCount }: { themeCount: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [notes, setNotes] = useState<{ ok: boolean; text: string }[]>([]);
  const router = useRouter();

  const groups = result?.proposals ?? [];
  const remaining = groups.filter((g) => !done.includes(g.themeIds.join(",")));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || themeCount < 2}
          onClick={() =>
            start(async () => {
              setResult(null);
              setDone([]);
              setNotes([]);
              setResult(await reviewThemes());
              router.refresh();
            })
          }
          className="rounded-[var(--radius-btn)] border border-border bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold shadow-[var(--shadow)] transition hover:bg-hover disabled:opacity-50"
        >
          {pending ? "✨ Reviewing…" : `✨ Review & consolidate (${themeCount})`}
        </button>
        {pending && (
          <span className="text-[12px] text-muted">
            Looking for themes that describe the same problem…
          </span>
        )}
        {result?.error && <span className="text-[12px] text-amber">⚠ {result.error}</span>}
        {result && !result.error && groups.length === 0 && (
          <span className="text-[12px] text-emerald">
            ✓ Nothing worth merging — these all look distinct.
          </span>
        )}
      </div>

      {/* Results stay on screen until the next review. A destructive action that
          finishes silently is indistinguishable from one that failed — which is
          exactly how a successful merge got clicked twice. */}
      {notes.map((n, i) => (
        <div
          key={i}
          className="rounded-[10px] border px-3.5 py-3 text-[12.5px] font-medium"
          style={
            n.ok
              ? { background: "var(--emerald-soft)", borderColor: "var(--emerald)", color: "var(--emerald)" }
              : { background: "var(--rose-soft)", borderColor: "var(--rose)", color: "var(--rose)" }
          }
        >
          {n.ok ? "✓ " : "⚠ "}
          {n.text}
        </div>
      ))}

      {remaining.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow)]">
          <div className="mb-1 text-[13px] font-semibold">
            {remaining.length} suggested merge{remaining.length === 1 ? "" : "s"}
          </div>
          <p className="mb-3 text-[12px] text-muted">
            Nothing has changed yet. Approve the ones you agree with — feedback is always kept and
            moved to the surviving theme, never deleted.
          </p>

          <div className="flex flex-col gap-2.5">
            {remaining.map((g) => {
              const key = g.themeIds.join(",");
              return (
                <div key={key} className="rounded-[10px] border border-border bg-bg p-3.5">
                  <div className="text-[13px] font-semibold">{g.canonicalTitle}</div>
                  <div className="mt-1 text-[12px] text-muted">{g.reason}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.titles.map((t, i) => (
                      <span
                        key={i}
                        className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px]"
                        style={{ background: "var(--slate-soft)", color: "var(--slate)" }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={applying !== null}
                      onClick={async () => {
                        if (applying) return; // guard against a double click
                        setApplying(key);
                        const r = await applyMerge(g.themeIds, g.canonicalTitle);
                        setApplying(null);
                        // Remove the card either way when the merge landed —
                        // including "already applied", which is a success.
                        if (r.ok) setDone((d) => [...d, key]);
                        setNotes((n) => [
                          ...n,
                          { ok: r.ok, text: r.message ?? r.error ?? "Merge failed" },
                        ]);
                        router.refresh();
                      }}
                      className="rounded-[var(--radius-btn)] bg-indigo px-3 py-1.5 text-[12px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
                    >
                      {applying === key ? "Merging…" : applying ? "Waiting…" : `Merge these ${g.themeIds.length}`}
                    </button>
                    <button
                      disabled={applying !== null}
                      onClick={() => setDone((d) => [...d, key])}
                      className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-hover"
                    >
                      Keep separate
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
