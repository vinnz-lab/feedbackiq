"use client";

import { useActionState } from "react";
import { connectChannel, disconnectChannel, type ActionState } from "@/app/(app)/sharing-actions";
import type { ChannelView } from "@/lib/sharing-data";
import type { ChannelKind } from "@/lib/digest-channels";

const INFO: Record<ChannelKind, { name: string; icon: string; placeholder: string; how: React.ReactNode }> = {
  slack: {
    name: "Slack",
    icon: "💬",
    placeholder: "https://hooks.slack.com/services/…",
    how: (
      <>
        In Slack, go to <b>api.slack.com/apps</b> → <b>Create New App</b> → <b>From scratch</b>, turn on <b>Incoming Webhooks</b>, then{" "}
        <b>Add New Webhook to Workspace</b> and pick the channel. Copy the link it gives you.
      </>
    ),
  },
  teams: {
    name: "Microsoft Teams",
    icon: "🟣",
    placeholder: "Paste the Teams workflow link",
    how: (
      <>
        In the Teams channel, open <b>⋯ → Workflows</b> and choose <b>“Post to a channel when a webhook request is received”</b>. Finish the steps and
        copy the link it gives you.
      </>
    ),
  },
};

function Channel({ kind, view, isOwner, canSave }: { kind: ChannelKind; view?: ChannelView; isOwner: boolean; canSave: boolean }) {
  const [cState, connect, connecting] = useActionState<ActionState, FormData>(connectChannel, {});
  const [dState, disconnect, disconnecting] = useActionState<ActionState, FormData>(disconnectChannel, {});
  const i = INFO[kind];
  const btn = "rounded-[var(--radius-btn)] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50";
  return (
    <div data-testid={`channel-${kind}`} className="rounded-[10px] border border-border p-3.5">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold">
        <span>{i.icon}</span> {i.name}
        <span
          className="ml-auto rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-semibold"
          style={view ? { background: "var(--emerald-soft)", color: "var(--emerald)" } : { background: "var(--slate-soft)", color: "var(--slate)" }}
        >
          {view ? "Connected" : "Not connected"}
        </span>
      </div>
      {view && (
        <p className="mt-1 text-[12px] text-muted">
          Posts to <span className="font-mono">{view.hint}</span>
          {view.lastPostedAt ? ` · last digest posted ${new Date(view.lastPostedAt).toLocaleString("en-GB")}` : " · no digest posted yet"}
        </p>
      )}
      {!isOwner ? (
        !view && <p className="mt-1 text-[12px] text-muted">Only the workspace owner can connect {i.name}.</p>
      ) : (
        <>
          <form action={connect} className="mt-2.5 flex flex-col gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input
              name="url"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={view ? "Paste a new link to replace it" : i.placeholder}
              aria-label={`${i.name} webhook link`}
              disabled={!canSave}
              className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 font-mono text-[12.5px] outline-none focus:border-indigo"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={connecting || !canSave} className={`${btn} bg-indigo text-white enabled:hover:brightness-110`}>
                {connecting ? "Sending a test message…" : view ? "Replace and test" : "Connect and send a test"}
              </button>
              {cState.error && <span className="text-[12px] text-rose">⚠ {cState.error}</span>}
              {cState.ok && <span className="text-[12px] text-emerald">✓ {cState.ok}</span>}
            </div>
          </form>
          {view && (
            <form action={disconnect} className="mt-2">
              <input type="hidden" name="kind" value={kind} />
              <button type="submit" disabled={disconnecting} className={`${btn} border border-border text-muted hover:bg-hover`}>
                Disconnect {i.name}
              </button>
              {dState.error && <span className="ml-2 text-[12px] text-rose">⚠ {dState.error}</span>}
            </form>
          )}
          {dState.ok && !view && <p className="mt-1 text-[12px] text-emerald">✓ {dState.ok}</p>}
          <details className="mt-2 text-[12px] text-muted">
            <summary className="cursor-pointer font-semibold">How to get the link</summary>
            <p className="mt-1">{i.how}</p>
          </details>
        </>
      )}
    </div>
  );
}

/** Integrations card: Slack and Teams channels the digest can be posted to. */
export function DigestChannelsCard({ channels, isOwner, canSave }: { channels: ChannelView[]; isOwner: boolean; canSave: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {(["slack", "teams"] as const).map((k) => (
        <Channel key={k} kind={k} view={channels.find((c) => c.kind === k)} isOwner={isOwner} canSave={canSave} />
      ))}
    </div>
  );
}
