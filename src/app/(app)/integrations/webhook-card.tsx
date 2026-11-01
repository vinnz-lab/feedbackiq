"use client";

import { useActionState, useState } from "react";
import { createOrRegenerateWebhook, setWebhookEnabled, type WebhookState } from "./webhook-actions";

export type WebhookView = {
  exists: boolean;
  enabled: boolean;
  hint: string | null;
  receivedCount: number;
  lastUsedAt: string | null;
  createdAt: string | null;
};

const EXAMPLE = `{
  "feedback": "Exporting to Excel loses the formatting",
  "customer": "Acme Ltd",
  "name": "Jo Smith",
  "date": "2026-11-01"
}`;

export function WebhookCard({ view, isOwner, origin }: { view: WebhookView; isOwner: boolean; origin: string }) {
  const [state, create, creating] = useActionState<WebhookState, FormData>(createOrRegenerateWebhook, {});
  const [tState, toggle, toggling] = useActionState<WebhookState, FormData>(setWebhookEnabled, {});
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const status = !view.exists
    ? { bg: "var(--slate-soft)", fg: "var(--slate)", text: "Not set up." }
    : view.enabled
      ? { bg: "var(--emerald-soft)", fg: "var(--emerald)", text: `On · address ending …${view.hint} · ${view.receivedCount} item${view.receivedCount === 1 ? "" : "s"} received${view.lastUsedAt ? ` · last used ${new Date(view.lastUsedAt).toLocaleString("en-GB")}` : ""}` }
      : { bg: "var(--amber-soft)", fg: "var(--amber)", text: `Switched off — anything sent to it is refused. (${view.receivedCount} received while on.)` };
  const btn = "rounded-[var(--radius-btn)] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] px-3.5 py-2.5 text-[12.5px] font-medium" style={{ background: status.bg, color: status.fg }}>
        {status.text}
      </div>

      {state.url && (
        <div className="rounded-[10px] border p-3.5" style={{ background: "var(--emerald-soft)", borderColor: "var(--emerald)" }}>
          <div className="text-[12.5px] font-semibold" style={{ color: "var(--emerald)" }}>
            ✓ {state.ok} Copy it now — it isn&apos;t shown again.
          </div>
          <code data-testid="webhook-url" className="mt-2 block break-all rounded-[8px] bg-bg p-2.5 font-mono text-[11.5px]">{state.url}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(state.url ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className={`${btn} mt-2 border border-border bg-surface hover:bg-hover`}
          >
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <p className="mt-2 text-[11.5px] text-muted">Anyone with this address can add feedback to this workspace, so treat it like a password.</p>
        </div>
      )}

      {!isOwner ? (
        <p className="text-[12.5px] text-muted">Only the workspace owner can set up the webhook.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!view.exists ? (
            <form action={create}>
              <button type="submit" disabled={creating} className={`${btn} bg-indigo text-white enabled:hover:brightness-110`}>
                {creating ? "Creating…" : "Create webhook address"}
              </button>
            </form>
          ) : (
            <>
              {!confirmRegen ? (
                <button type="button" onClick={() => setConfirmRegen(true)} className={`${btn} border border-border hover:bg-hover`}>
                  Get a new address
                </button>
              ) : (
                <form action={create} className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-muted">The current address will stop working straight away.</span>
                  <button type="submit" disabled={creating} className={`${btn} bg-indigo text-white`}>
                    {creating ? "Creating…" : "Replace it"}
                  </button>
                  <button type="button" onClick={() => setConfirmRegen(false)} className="text-[12px] font-semibold text-muted">
                    Cancel
                  </button>
                </form>
              )}
              <form action={toggle}>
                <input type="hidden" name="enabled" value={view.enabled ? "false" : "true"} />
                <button type="submit" disabled={toggling} className={`${btn} border border-border text-muted hover:bg-hover`}>
                  {view.enabled ? "Switch off" : "Switch on"}
                </button>
              </form>
            </>
          )}
          {(state.error || tState.error) && <span className="text-[12px] text-rose">⚠ {state.error ?? tState.error}</span>}
          {tState.ok && <span className="text-[12px] text-emerald">✓ {tState.ok}</span>}
        </div>
      )}

      <details className="rounded-[10px] border border-border bg-bg p-3 text-[12.5px]">
        <summary className="cursor-pointer font-semibold">How to send feedback to it</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
          <li>
            In <b className="text-fg">Zapier</b> or <b className="text-fg">Make</b>, pick the app the feedback comes from (Typeform, Google
            Forms, Intercom, Zendesk, HubSpot, a spreadsheet…) as the trigger.
          </li>
          <li>
            Add a <b className="text-fg">“Webhooks → POST”</b> action with this workspace&apos;s address, sending JSON.
          </li>
          <li>
            Map the answer to <code className="font-mono">feedback</code>, and optionally <code className="font-mono">customer</code>,{" "}
            <code className="font-mono">name</code> and <code className="font-mono">date</code>.
          </li>
        </ol>
        <pre className="mt-2 overflow-x-auto rounded-[8px] bg-surface p-2.5 font-mono text-[11.5px]">{EXAMPLE}</pre>
        <p className="mt-2 text-muted">
          Send up to 50 at once as <code className="font-mono">{`{"items": [ … ]}`}</code>. Plain text and form posts work too. New feedback lands in{" "}
          <b className="text-fg">Register → Needs review</b>; anything already in the workspace is skipped. Up to 60 requests a minute.
        </p>
        <p className="mt-2 text-muted">
          Prefer to keep the secret out of the address? Send it to <code className="font-mono">{origin}/api/hooks/feedback</code> with the header{" "}
          <code className="font-mono">Authorization: Bearer &lt;the part after /feedback/&gt;</code>.
        </p>
      </details>
    </div>
  );
}
