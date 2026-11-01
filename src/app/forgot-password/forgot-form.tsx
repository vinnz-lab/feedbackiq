"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotState } from "./actions";

export function ForgotForm({ linkProblem }: { linkProblem: boolean }) {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestPasswordReset, {});
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <h1 className="text-[17px] font-semibold">Reset your password</h1>
      {linkProblem && !state.sent && (
        <div className="mt-3 rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>
          That reset link has expired or was already used. Request a new one below.
        </div>
      )}
      {state.sent ? (
        <div className="mt-3">
          <div className="rounded-[8px] px-3 py-2.5 text-[12.5px]" style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}>
            ✓ If that email has an Insight Hub account, a reset link is on its way. It works once, and only for a short time.
          </div>
          <p className="mt-3 text-[12px] text-muted">
            Nothing arrived after a few minutes? Check your spam folder, or ask whoever invited you to reset it for you.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 mb-4 text-[13px] text-muted">
            Enter the email you sign in with and we&apos;ll send you a link to choose a new password.
          </p>
          <form action={action} className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-muted">Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-label="Email"
                placeholder="you@company.com"
                className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo"
              />
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
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <p className="mt-4 text-[12px]">
        <Link href="/login" className="font-semibold text-indigo">← Back to sign in</Link>
      </p>
    </div>
  );
}
