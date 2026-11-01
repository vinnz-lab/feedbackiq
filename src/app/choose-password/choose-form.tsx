"use client";

import { useActionState } from "react";
import { chooseOwnPassword, type ChooseState } from "./actions";

export function ChooseForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ChooseState, FormData>(chooseOwnPassword, {});
  const input = "w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo";
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <h1 className="text-[17px] font-semibold">Choose your own password</h1>
      <p className="mt-1 mb-4 text-[13px] text-muted">
        You signed in as <b className="text-fg">{email}</b> with a temporary password. Pick one only you know
        before carrying on — the temporary one will stop working.
      </p>
      <form action={action} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">New password (10+ characters)</span>
          <input name="next" type="password" autoComplete="new-password" required minLength={10} aria-label="New password" className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">New password again</span>
          <input name="confirm" type="password" autoComplete="new-password" required minLength={10} aria-label="Confirm new password" className={input} />
        </label>
        {state.error && (
          <div className="rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "var(--rose-soft)", color: "var(--rose)" }}>
            {state.error}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-[var(--radius-btn)] bg-indigo px-4 py-2.5 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
