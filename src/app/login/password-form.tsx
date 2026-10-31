"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInWithPassword, type SignInState } from "./actions";

const initial: SignInState = {};

export function PasswordForm() {
  const [state, action, pending] = useActionState(signInWithPassword, initial);

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <h1 className="text-[17px] font-semibold">Sign in</h1>
      <p className="mt-1 mb-4 text-[13px] text-muted">
        Use the email address you were invited with.
      </p>

      <form action={action} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo"
            placeholder="you@company.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center text-[11.5px] font-semibold text-muted">
            Password
            <Link href="/forgot-password" className="ml-auto font-semibold text-indigo hover:underline">
              Forgot password?
            </Link>
          </span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo"
            placeholder="••••••••"
          />
        </label>

        {state.error && (
          <div
            className="rounded-[8px] px-3 py-2 text-[12px]"
            style={{ background: "var(--rose-soft)", color: "var(--rose)" }}
          >
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-[var(--radius-btn)] bg-indigo px-4 py-2.5 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-[11.5px] text-muted">
        Accounts are created by the workspace owner — there&apos;s no public sign-up.
      </p>
    </div>
  );
}
