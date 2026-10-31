"use client";

import { useActionState, useCallback, useState } from "react";
import { provisionWorkspace, type ProvisionState } from "./platform-actions";
import { ProvisionedItem, type ProvisionedRow } from "./remove-provisioned";

function generatePassword() {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Platform owner only: set up a private workspace for someone else. */
export function ProvisionWorkspace({
  provisioned,
}: {
  provisioned: ProvisionedRow[];
}) {
  const [state, action, pending] = useActionState<ProvisionState, FormData>(provisionWorkspace, {});
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [removedNotes, setRemovedNotes] = useState<string[]>([]);
  const onRemoved = useCallback((m: string) => setRemovedNotes((n) => (n.includes(m) ? n : [...n, m])), []);
  const creds = state.credentials;
  const shareText = creds
    ? `You've been given your own FeedbackIQ workspace, “${creds.workspace}”.\n\nSign in: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${creds.email}\nPassword: ${creds.password}`
    : "";

  return (
    <section className="mb-6 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--indigo)] bg-surface p-5 shadow-[var(--shadow)]">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">Give someone their own workspace</h2>
        <span
          className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[10.5px] font-bold"
          style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}
        >
          ONLY YOU SEE THIS
        </span>
      </div>
      <p className="mt-1 mb-3.5 text-[13px] text-muted">
        Creates a separate, empty workspace with them as its owner — for a tester, a demo, or a client.
        <b className="text-fg"> You are not added to it, so you can&apos;t see what they put in it.</b> They can
        add their own people from their Settings.
      </p>

      <form action={action} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label="Their name">
          <input name="name" required maxLength={80} aria-label="Their name" className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo" />
        </Field>
        <Field label="Their email">
          <input name="email" type="email" required aria-label="Their email" className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo" />
        </Field>
        <Field label="Workspace name (optional)">
          <input name="workspace" maxLength={60} placeholder="e.g. Priya's testing" aria-label="Their workspace name" className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo" />
        </Field>
        <Field label="Password (10+ characters)">
          <div className="flex gap-2">
            <input
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Their password"
              className="min-w-0 flex-1 rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 font-mono text-[13px] outline-none focus:border-indigo"
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="shrink-0 rounded-[var(--radius-btn)] border border-border px-3 text-[12px] font-semibold text-muted hover:bg-hover"
            >
              Generate
            </button>
          </div>
        </Field>

        <div className="sm:col-span-2">
          {state.error && (
            <div className="mb-2 rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "var(--rose-soft)", color: "var(--rose)" }}>
              {state.error}
            </div>
          )}
          {state.ok && !creds && (
            <div className="mb-2 rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}>
              ✓ {state.ok}
            </div>
          )}
          {creds && (
            <div className="mb-3 rounded-[10px] border p-3.5" style={{ background: "var(--emerald-soft)", borderColor: "var(--emerald)" }}>
              <div className="text-[12.5px] font-semibold" style={{ color: "var(--emerald)" }}>
                ✓ {state.ok} Send them these details — the password isn&apos;t shown again.
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-all rounded-[8px] bg-bg p-2.5 font-mono text-[11.5px]">{shareText}</pre>
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
            {pending ? "Setting up…" : "Create their workspace"}
          </button>
        </div>
      </form>

      {removedNotes.map((m, i) => (
        <div
          key={i}
          className="mt-4 rounded-[10px] border px-3.5 py-3 text-[12.5px] font-medium"
          style={{ background: "var(--emerald-soft)", borderColor: "var(--emerald)", color: "var(--emerald)" }}
        >
          ✓ {m}
        </div>
      ))}

      {provisioned.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 text-[12.5px] font-semibold">Workspaces you&apos;ve set up</div>
          <div className="flex flex-col">
            {provisioned.map((p) => (
              <ProvisionedItem key={p.workspaceId} p={p} onRemoved={onRemoved} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-muted">Names and owners only — their content stays private to them.</p>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
