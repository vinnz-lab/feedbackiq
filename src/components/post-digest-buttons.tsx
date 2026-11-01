"use client";

import { useActionState } from "react";
import { postDigest, type ActionState } from "@/app/(app)/sharing-actions";
import type { ChannelView } from "@/lib/sharing-data";

const NAME = { slack: "Slack", teams: "Teams" } as const;

function One({ ch }: { ch: ChannelView }) {
  const [state, post, posting] = useActionState<ActionState, FormData>(postDigest, {});
  return (
    <form action={post} className="flex items-center gap-2">
      <input type="hidden" name="kind" value={ch.kind} />
      <button type="submit" disabled={posting} className="rounded-[var(--radius-btn)] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold hover:bg-hover disabled:opacity-50">
        {posting ? "Posting…" : `Post to ${NAME[ch.kind]}`}
      </button>
      {state.error && <span className="text-[12px] text-rose">⚠ {state.error}</span>}
      {state.ok && <span className="text-[12px] text-emerald">✓ {state.ok}</span>}
    </form>
  );
}

/** "Post to Slack / Teams" for the latest digest, for each connected channel. */
export function PostDigestButtons({ channels }: { channels: ChannelView[] }) {
  if (!channels.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {channels.map((c) => (
        <One key={c.kind} ch={c} />
      ))}
    </div>
  );
}
