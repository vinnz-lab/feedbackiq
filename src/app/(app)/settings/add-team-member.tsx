"use client";

import { useActionState, useState } from "react";
import { createTeamMember, type CreateUserState } from "./team-actions";

const initial: CreateUserState = {};

const ROLES = [
  { value: "contributor", label: "Contributor — adds and reviews feedback" },
  { value: "executive", label: "Executive — dashboards and roadmap" },
  { value: "engineer", label: "Engineer — themes and roadmap" },
  { value: "owner", label: "Product Owner — full access" },
];

/** Readable but strong: no ambiguous characters, so it survives being typed. */
function generatePassword() {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function AddTeamMember({ supabaseActive }: { supabaseActive: boolean }) {
  const [state, action, pending] = useActionState(createTeamMember, initial);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const creds = state.credentials;
  const shareText = creds
    ? `You've been given access to FeedbackIQ.\n\nSign in: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${creds.email}\nPassword: ${creds.password}`
    : "";

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">Give someone access</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted">
        {supabaseActive
          ? "Creates their sign-in immediately — no confirmation email needed. Send them the details shown after you add them."
          : "Adds them to the workspace. Their sign-in is created once Supabase Auth is configured."}
      </p>

      <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Name</span>
          <input
            name="name"
            required
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo"
            placeholder="Alex Turner"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo"
            placeholder="alex@company.com"
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
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Password</span>
          <div className="flex gap-2">
            <input
              name="password"
              type="text"
              minLength={10}
              required={supabaseActive}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 font-mono text-[13px] outline-none focus:border-indigo"
              placeholder="at least 10 characters"
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="shrink-0 rounded-[var(--radius-btn)] border border-border px-3 text-[12px] font-semibold text-muted hover:bg-hover"
            >
              Generate
            </button>
          </div>
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

          {creds && (
            <div
              className="mb-3 rounded-[10px] border p-3.5"
              style={{ background: "var(--emerald-soft)", borderColor: "var(--emerald)" }}
            >
              <div className="text-[12.5px] font-semibold" style={{ color: "var(--emerald)" }}>
                ✓ {state.ok} Send them these details — the password isn&apos;t shown again.
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-all rounded-[8px] bg-bg p-2.5 font-mono text-[11.5px]">
                {shareText}
              </pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(shareText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="mt-2 rounded-[var(--radius-btn)] border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold hover:bg-hover"
              >
                {copied ? "Copied ✓" : "Copy invite"}
              </button>
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
