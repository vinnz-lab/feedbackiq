"use client";

import { useActionState, useState } from "react";
import { createBriefing, type BriefingState } from "@/app/(app)/briefings/actions";

type ThemeOpt = { id: string; title: string; mentions: number };
const MAX = 5;

/** Pick themes, length and how names are said, then start a briefing. */
export function BriefingCreator({ themes, aiNote, dailyLimit, busy }: { themes: ThemeOpt[]; aiNote: string | null; dailyLimit: number; busy: boolean }) {
  const [picked, setPicked] = useState<string[]>(themes.slice(0, 3).map((t) => t.id));
  const [names, setNames] = useState("mask");
  const [state, create, creating] = useActionState<BriefingState, FormData>(createBriefing, {});
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]));
  const label = "mb-1.5 block text-[10.5px] font-bold uppercase tracking-wide text-muted";
  const pill = (on: boolean) => `rounded-[10px] border px-3 py-2 text-left text-[12.5px] ${on ? "border-indigo bg-[var(--indigo-soft)]" : "border-border hover:bg-hover"}`;

  return (
    <form action={create} className="mb-7 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">🎧 Create an audio briefing</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">Pick up to {MAX} themes. The hosts talk through what customers said, how many said it, how they feel, what&apos;s rising and what&apos;s on the roadmap.</p>

      <fieldset className="mt-4">
        <legend className={label}>Themes · {picked.length} of {MAX}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {themes.map((t) => {
            const on = picked.includes(t.id);
            const full = !on && picked.length >= MAX;
            return (
              <label key={t.id} className={`flex cursor-pointer items-center gap-2.5 ${pill(on)} ${full ? "cursor-not-allowed opacity-50" : ""}`}>
                <input type="checkbox" name="themeId" value={t.id} checked={on} disabled={full} onChange={() => toggle(t.id)} className="accent-[var(--indigo)]" />
                <span className="min-w-0 flex-1 truncate font-semibold">{t.title}</span>
                <span className="text-[11.5px] text-muted">{t.mentions}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <fieldset>
          <legend className={label}>Length</legend>
          <div className="flex flex-col gap-2">
            <label className={`flex items-center gap-2.5 ${pill(true)}`}>
              <input type="radio" name="length" value="balanced" defaultChecked className="accent-[var(--indigo)]" />
              <span><b>Balanced</b> <span className="text-muted">· about 4–5 minutes</span></span>
            </label>
            <label className={`flex items-center gap-2.5 opacity-60 ${pill(false)}`} title="Coming soon">
              <input type="radio" name="length" value="deep" disabled />
              <span><b>Deep dive</b> <span className="text-muted">· 8–10 minutes</span></span>
              <span className="ml-auto rounded-[var(--radius-pill)] bg-[var(--slate-soft)] px-2 py-0.5 text-[10px] font-bold text-slate">COMING SOON</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend className={label}>Customer names</legend>
          <div className="flex flex-col gap-2">
            {[
              ["mask", "Initials only", "e.g. “K. H. said…” — safest to play out loud"],
              ["include", "Say names", "as they appear in your feedback"],
              ["remove", "Leave names out", "“one customer said…”"],
            ].map(([v, t, d]) => (
              <label key={v} className={`flex items-center gap-2.5 ${pill(names === v)}`}>
                <input type="radio" name="nameMode" value={v} checked={names === v} onChange={() => setNames(v)} className="accent-[var(--indigo)]" />
                <span><b>{t}</b> <span className="text-muted">· {d}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={creating || busy || picked.length === 0}
          className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white enabled:hover:brightness-110 disabled:opacity-50"
        >
          {creating ? "Starting…" : busy ? "One is being made…" : "🎧 Create audio briefing"}
        </button>
        {state.error && <span className="text-[12.5px] text-rose">⚠ {state.error}</span>}
        {state.ok && <span className="text-[12.5px] text-emerald">✓ {state.ok}</span>}
      </div>
      <p className="mt-2.5 text-[11.5px] text-muted">
        {aiNote ? `${aiNote} ` : ""}Up to {dailyLimit} a day per workspace. It only uses approved feedback, and never makes up numbers or quotes.
      </p>
    </form>
  );
}
