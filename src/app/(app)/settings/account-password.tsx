"use client";

import { useActionState, useRef, useEffect } from "react";
import { changePassword, type PasswordState } from "./account-actions";

/** Your own sign-in. Shown to everyone, whatever their role. */
export function AccountPassword({
  email,
  workspaceCount,
  supabaseActive,
}: {
  email: string;
  workspaceCount: number;
  supabaseActive: boolean;
}) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);

  const input = "w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo";
  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">Your account</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted">
        Signed in as <b className="text-fg">{email}</b>. This one sign-in works for{" "}
        {workspaceCount === 1 ? "your workspace" : `all ${workspaceCount} of your workspaces`} — changing the
        password changes it everywhere.
      </p>
      {!supabaseActive ? (
        <p className="text-[12.5px] text-muted">Password changes are available once real sign-in is switched on.</p>
      ) : (
        <form ref={form} action={action} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">Current password</span>
            <input name="current" type="password" autoComplete="current-password" required aria-label="Current password" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">New password (10+)</span>
            <input name="next" type="password" autoComplete="new-password" required minLength={10} aria-label="New password" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">New password again</span>
            <input name="confirm" type="password" autoComplete="new-password" required minLength={10} aria-label="Confirm new password" className={input} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Changing…" : "Change password"}
            </button>
            {state.error && <span className="text-[12.5px] text-rose">⚠ {state.error}</span>}
            {state.ok && <span className="text-[12.5px] text-emerald">✓ {state.ok}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
