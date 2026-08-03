"use client";

import { useActionState } from "react";
import { createTeamMember, type CreateUserState } from "./team-actions";

const initial: CreateUserState = {};

const ROLES = [
  { value: "owner", label: "Product Owner — full access" },
  { value: "contributor", label: "Contributor — adds and reviews feedback" },
  { value: "executive", label: "Executive — dashboards and roadmap" },
  { value: "engineer", label: "Engineer — themes and roadmap" },
];

export function AddTeamMember({ supabaseActive }: { supabaseActive: boolean }) {
  const [state, action, pending] = useActionState(createTeamMember, initial);

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">Add someone</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted">
        {supabaseActive
          ? "Creates their sign-in and grants access. Share the password with them directly — they can change it later."
          : "Adds them to the workspace. Their sign-in is created once Supabase Auth is configured."}
      </p>

      <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Name</span>
          <input
            name="name"
            required
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo"
            placeholder="Riya Shah"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo"
            placeholder="riya@company.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Role</span>
          <select name="role" defaultValue="contributor" className="fiq-select w-full">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">
            Temporary password
          </span>
          <input
            name="password"
            type="text"
            minLength={10}
            required={supabaseActive}
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 font-mono text-[13px] outline-none focus:border-indigo"
            placeholder="at least 10 characters"
          />
        </label>

        <div className="sm:col-span-2">
          {state.error && (
            <div
              className="mb-2 rounded-[8px] px-3 py-2 text-[12px]"
              style={{ background: "var(--rose-soft)", color: "var(--rose)" }}
            >
              {state.error}
            </div>
          )}
          {state.ok && (
            <div
              className="mb-2 rounded-[8px] px-3 py-2 text-[12px]"
              style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}
            >
              ✓ {state.ok}
            </div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add person"}
          </button>
        </div>
      </form>
    </section>
  );
}
