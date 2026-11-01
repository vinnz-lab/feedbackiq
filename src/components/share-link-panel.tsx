"use client";

import { useActionState, useState } from "react";
import { createShareLink, turnOffShareLink, type ActionState } from "@/app/(app)/sharing-actions";
import type { ShareView } from "@/lib/sharing-data";
import type { ShareKind } from "@/lib/share-links";

const WHAT: Record<ShareKind, { label: string; shows: string }> = {
  digest: { label: "digest", shows: "always the latest digest — including its notable quotes and the customer names attached to them" },
  roadmap: { label: "roadmap", shows: "the roadmap items, their status and scores — no quotes, customer names or Jira details" },
};

/** Owner-only: a read-only link to the digest or roadmap for people without an account. */
export function ShareLinkPanel({ kind, view, origin }: { kind: ShareKind; view: ShareView | null; origin: string }) {
  const [open, setOpen] = useState(false);
  const [cState, create, creating] = useActionState<ActionState, FormData>(createShareLink, {});
  const [oState, off, turningOff] = useActionState<ActionState, FormData>(turnOffShareLink, {});
  const [copied, setCopied] = useState(false);
  const url = view?.path ? `${origin}${view.path}` : null;
  const w = WHAT[kind];
  const btn = "rounded-[var(--radius-btn)] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50";

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`${btn} border border-border bg-surface hover:bg-hover`}>
        🔗 Share{view ? " · on" : ""}
      </button>
      {open && (
        <div role="dialog" aria-label={`Share the ${w.label}`} className="absolute right-0 top-[calc(100%+8px)] z-40 w-[420px] rounded-[12px] border border-border bg-surface p-4 text-left shadow-[var(--shadow-lg)]">
          <div className="text-[14px] font-semibold">Share a read-only {w.label}</div>
          <p className="mt-0.5 text-[12px] text-muted">
            Anyone with the link can view it without signing in — {w.shows}. They can&apos;t see anything else or change anything.
          </p>
          {url ? (
            <>
              <code data-testid="share-url" className="mt-3 block break-all rounded-[8px] bg-bg p-2.5 font-mono text-[11.5px]">
                {url}
              </code>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`${btn} bg-indigo text-white`}
                >
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer" className={`${btn} border border-border hover:bg-hover`}>
                  Open
                </a>
                <form action={off} onSubmit={(e) => { if (!confirm("Turn the link off? Anyone who has it will see “switched off”.")) e.preventDefault(); }}>
                  <input type="hidden" name="kind" value={kind} />
                  <button type="submit" disabled={turningOff} className={`${btn} text-rose hover:bg-[var(--rose-soft)]`}>
                    Turn off link
                  </button>
                </form>
              </div>
              <p className="mt-2 text-[11.5px] text-muted">
                Viewed {view!.views} time{view!.views === 1 ? "" : "s"}
                {view!.lastViewedAt ? `, last ${new Date(view!.lastViewedAt).toLocaleString("en-GB")}` : ""}.
              </p>
              <form action={create} className="mt-1" onSubmit={(e) => { if (!confirm("Make a new link? The current one will stop working.")) e.preventDefault(); }}>
                <input type="hidden" name="kind" value={kind} />
                <button type="submit" disabled={creating} className="text-[11.5px] font-semibold text-muted underline">
                  Make a new link instead
                </button>
              </form>
            </>
          ) : view?.unreadable ? (
            <p className="mt-3 text-[12.5px] text-amber">A link is on, but it can&apos;t be shown any more. Make a new one, or turn it off.</p>
          ) : (
            <form action={create} className="mt-3">
              <input type="hidden" name="kind" value={kind} />
              <button type="submit" disabled={creating} className={`${btn} bg-indigo text-white`}>
                {creating ? "Creating…" : "Create share link"}
              </button>
            </form>
          )}
          {view?.unreadable && (
            <form action={create} className="mt-2">
              <input type="hidden" name="kind" value={kind} />
              <button type="submit" className={`${btn} bg-indigo text-white`}>Make a new link</button>
            </form>
          )}
          {(cState.error || oState.error) && <p className="mt-2 text-[12px] text-rose">⚠ {cState.error ?? oState.error}</p>}
          {(cState.ok || oState.ok) && <p className="mt-2 text-[12px] text-emerald">✓ {oState.ok ?? cState.ok}</p>}
        </div>
      )}
    </div>
  );
}
