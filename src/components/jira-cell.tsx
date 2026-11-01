"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewJiraTicket, refreshFromJira, sendToJira } from "@/app/(app)/roadmap/jira-actions";

/** The Jira part of a roadmap row: the ticket link, or (owners) Send to Jira with a preview first. */
export function JiraCell({
  enhancementId,
  jiraKey,
  jiraUrl,
  jiraStatus,
  canSend,
}: {
  enhancementId: string;
  jiraKey: string | null;
  jiraUrl: string | null;
  jiraStatus: string | null;
  canSend: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (jiraKey && jiraKey !== "__sending__") {
    return (
      <div className="flex flex-col gap-0.5">
        {jiraUrl ? (
          <a href={jiraUrl} target="_blank" rel="noopener noreferrer" className="w-fit rounded-[5px] bg-[var(--indigo-soft)] px-1.5 py-0.5 text-[11.5px] font-semibold text-indigo hover:underline">
            🔗 {jiraKey}
          </a>
        ) : (
          <span className="w-fit rounded-[5px] bg-[var(--indigo-soft)] px-1.5 py-0.5 text-[11.5px] font-semibold text-indigo">🔗 {jiraKey}</span>
        )}
        {jiraStatus && <span className="text-[11px] text-muted">Jira: {jiraStatus}</span>}
      </div>
    );
  }
  if (jiraKey === "__sending__") return <span className="text-[11.5px] text-muted">Sending…</span>;
  if (!canSend) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await previewJiraTicket(enhancementId);
            if (r.ok) setPreview(r.preview ?? "");
            else setError(r.error ?? "Couldn't prepare the ticket.");
          })
        }
        className="w-fit whitespace-nowrap rounded-[var(--radius-btn)] border border-border px-2.5 py-1 text-[11.5px] font-semibold text-indigo hover:bg-hover disabled:opacity-50"
      >
        {pending && preview === null ? "Preparing…" : "→ Send to Jira"}
      </button>
      {preview !== null && (
        // Shown over the page, so the table's layout never shifts.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setPreview(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !pending) setPreview(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="Jira ticket preview" className="w-full max-w-xl rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]">
            <div className="mb-1 text-[15px] font-semibold">Send to Jira</div>
            <div className="mb-2 text-[12px] text-muted">This is exactly what the ticket will contain.</div>
            <pre className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-bg p-3 font-sans text-[12.5px] leading-relaxed">{preview}</pre>
            {error && <div className="mt-2 text-[12px] text-rose">⚠ {error}</div>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                autoFocus
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await sendToJira(enhancementId);
                    if (!r.ok) setError(r.error ?? "Couldn't send to Jira.");
                    else {
                      setPreview(null);
                      router.refresh();
                    }
                  })
                }
                className="rounded-[var(--radius-btn)] bg-indigo px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Creating ticket…" : "Create ticket"}
              </button>
              <button type="button" disabled={pending} onClick={() => setPreview(null)} className="rounded-[var(--radius-btn)] border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {error && preview === null && <span className="max-w-[340px] text-[11.5px] text-rose">⚠ {error}</span>}
    </div>
  );
}

export function RefreshFromJiraButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await refreshFromJira();
            setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
            router.refresh();
          })
        }
        className="rounded-[var(--radius-btn)] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold shadow-[var(--shadow)] hover:bg-hover disabled:opacity-50"
      >
        {pending ? "Checking Jira…" : "↻ Refresh from Jira"}
      </button>
      {msg && <span className={`text-[12px] ${msg.ok ? "text-emerald" : "text-rose"}`}>{msg.ok ? "✓" : "⚠"} {msg.text}</span>}
    </div>
  );
}
