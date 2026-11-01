"use client";

import { useActionState, useState } from "react";
import type { ResetPasswordState } from "./team-actions";

type Action = (prev: ResetPasswordState, fd: FormData) => Promise<ResetPasswordState>;

/**
 * "Reset password" for someone else. Shows the temporary password ONCE, ready
 * to send; they must choose their own when they next sign in.
 */
export function ResetPasswordButton({
  action,
  field,
  value,
  name,
  blockedReason,
}: {
  action: Action;
  /** The form field the action expects ("id" or "workspaceId"). */
  field: string;
  value: string;
  name: string;
  /** When set, resetting isn't allowed; shown instead of the button. */
  blockedReason?: string | null;
}) {
  const [state, run, pending] = useActionState<ResetPasswordState, FormData>(action, {});
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  if (blockedReason) {
    return (
      <span title={blockedReason} className="cursor-help rounded-[var(--radius-btn)] px-2.5 py-1 text-[11.5px] font-semibold text-muted opacity-60">
        Reset password
      </span>
    );
  }

  if (state.temp) {
    const text = `Your Insight Hub password has been reset.\n\nSign in: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${state.temp.email}\nTemporary password: ${state.temp.password}\n\nYou'll be asked to choose your own password straight away.`;
    return (
      <div className="basis-full rounded-[10px] border p-3" style={{ background: "var(--emerald-soft)", borderColor: "var(--emerald)" }}>
        <div className="text-[12px] font-semibold" style={{ color: "var(--emerald)" }}>
          ✓ {state.ok} Send them this — it isn&apos;t shown again.
        </div>
        <pre className="mt-2 whitespace-pre-wrap break-all rounded-[8px] bg-bg p-2.5 font-mono text-[11.5px]">{text}</pre>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="mt-2 rounded-[var(--radius-btn)] border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold hover:bg-hover"
        >
          {copied ? "Copied ✓" : "Copy message"}
        </button>
      </div>
    );
  }

  return (
    <form action={run} className="flex items-center gap-2">
      <input type="hidden" name={field} value={value} />
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Reset password for ${name}`}
          className="rounded-[var(--radius-btn)] px-2.5 py-1 text-[11.5px] font-semibold text-muted transition hover:bg-hover hover:text-fg"
        >
          Reset password
        </button>
      ) : (
        <>
          <span className="text-[11.5px] text-muted">Their current password stops working.</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-[var(--radius-btn)] bg-indigo px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Resetting…" : "Reset"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-[11.5px] font-semibold text-muted">
            Cancel
          </button>
        </>
      )}
      {state.error && <span className="text-[11.5px] text-rose">⚠ {state.error}</span>}
    </form>
  );
}
