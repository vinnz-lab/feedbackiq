"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { addSampleData, type SampleState } from "@/app/(app)/dashboard/sample-actions";
import type { GuideState, StepKey } from "@/lib/getting-started";
import { GuideLink } from "@/components/guide-link";

const STEPS: { key: StepKey; title: string; text: string; href: string; cta: string }[] = [
  { key: "add", title: "Add some feedback", text: "Paste notes, upload a spreadsheet, email, transcript or recording.", href: "/ingest", cta: "Add feedback" },
  { key: "analyse", title: "Run AI analysis", text: "AI sorts each item by type, sentiment and theme.", href: "/register?tab=review", cta: "Open Needs review" },
  { key: "review", title: "Review and approve", text: "Nothing counts until a person approves it — correct the AI where it's wrong.", href: "/register?tab=review", cta: "Review items" },
  { key: "themes", title: "See your themes", text: "Similar feedback grouped together, with an AI summary of each.", href: "/themes", cta: "View themes" },
  { key: "roadmap", title: "Add a theme to the roadmap", text: "Open a theme and choose “Add to roadmap” — it's scored by demand, benefit and effort.", href: "/themes", cta: "Pick a theme" },
  { key: "digest", title: "Generate a digest", text: "A one-page briefing of what changed, ready to share.", href: "/digest", cta: "Open digest" },
];

const TOUR: { title: string; text: string; href: string }[] = [
  { title: "Dashboard", text: "the headline numbers and top themes (you're here)", href: "/dashboard" },
  { title: "Themes", text: "what customers keep raising, with the quotes behind it", href: "/themes" },
  { title: "Register", text: "every piece of feedback and where it came from", href: "/register" },
  { title: "Roadmap", text: "what's planned, scored by customer demand", href: "/roadmap" },
  { title: "Trends", text: "what's rising and falling over time", href: "/trends" },
  { title: "Digest", text: "the latest one-page briefing", href: "/digest" },
];

/** The welcome guide. Same for everyone; it only offers what the person's role lets them do. */
export function GettingStarted({ state, canEdit, workspaceId }: { state: GuideState; canEdit: boolean; workspaceId: string }) {
  const key = `ih-guide-hidden:${workspaceId}`;
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [sample, addSample, adding] = useActionState<SampleState, FormData>(addSampleData, {});
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      setHidden(false);
    }
  }, [key]);
  const hide = (v: boolean) => {
    try {
      if (v) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {}
    setHidden(v);
  };

  const doneCount = STEPS.filter((s) => state.done[s.key]).length;
  const allDone = canEdit && doneCount === STEPS.length;
  if (hidden === null || allDone) return null;
  if (hidden) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => hide(false)} className="text-[12.5px] font-semibold text-indigo hover:underline">
          ✦ Getting started{canEdit ? ` (${doneCount} of ${STEPS.length} done)` : ""}
        </button>
        <GuideLink />
      </div>
    );
  }
  const next = STEPS.find((s) => !state.done[s.key]);

  return (
    <section
      aria-label="Getting started"
      className="mb-7 rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow)]"
      style={{ borderColor: "var(--indigo)", background: "linear-gradient(135deg, var(--indigo-soft), var(--surface) 60%)" }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">{canEdit ? "Getting started with Insight Hub" : "Welcome to Insight Hub"}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {canEdit
              ? "Turn scattered customer feedback into themes, a scored roadmap and a shareable digest — in six steps."
              : "Insight Hub turns customer feedback into themes, a roadmap and a digest. You can look at everything here; changes are made by the workspace's editors."}
          </p>
        </div>
        <button type="button" onClick={() => hide(true)} className="ml-auto text-[12px] font-semibold text-muted hover:text-fg" aria-label="Hide the getting started guide">
          Hide ✕
        </button>
      </div>

      {canEdit ? (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--slate-soft)]" aria-hidden>
            <div className="h-full rounded-full bg-indigo transition-all" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
          </div>
          <div className="mt-1 text-[11.5px] text-muted">
            {doneCount} of {STEPS.length} done
          </div>
          <ol className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {STEPS.map((s, i) => {
              const done = state.done[s.key];
              const isNext = next?.key === s.key;
              return (
                <li
                  key={s.key}
                  data-testid={`step-${s.key}`}
                  data-done={done ? "true" : "false"}
                  className={`flex gap-3 rounded-[10px] border bg-surface p-3 ${isNext ? "border-indigo" : "border-border"}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${done ? "bg-[var(--emerald)] text-white" : "bg-[var(--slate-soft)] text-muted"}`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] font-semibold ${done ? "text-muted line-through" : ""}`}>{s.title}</div>
                    <div className="text-[12px] text-muted">{s.text}</div>
                    {!done && (
                      <Link href={s.href} className={`mt-1.5 inline-block text-[12px] font-semibold ${isNext ? "text-indigo" : "text-muted"} hover:underline`}>
                        {s.cta} →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {state.empty && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-dashed border-border bg-surface p-3">
              <div className="min-w-0 flex-1 text-[12.5px]">
                <b>No feedback of your own to hand?</b>{" "}
                <span className="text-muted">Load a realistic sample — survey answers, emails and a call transcript for a made-up product — and remove it with one click later.</span>
              </div>
              <form action={addSample}>
                <button type="submit" disabled={adding} className="rounded-[var(--radius-btn)] border border-indigo bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-indigo hover:bg-[var(--indigo-soft)] disabled:opacity-50">
                  {adding ? "Adding…" : "Load sample data"}
                </button>
              </form>
            </div>
          )}
          {sample.error && <p className="mt-2 text-[12.5px] text-rose">⚠ {sample.error}</p>}
          {sample.ok && <p className="mt-2 text-[12.5px] text-emerald">✓ {sample.ok}</p>}
        </>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {TOUR.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="block rounded-[10px] border border-border bg-surface p-3 hover:bg-hover">
                <span className="text-[13px] font-semibold">{t.title}</span> <span className="text-[12px] text-muted">— {t.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-border pt-3">
        <GuideLink />
      </div>
    </section>
  );
}
