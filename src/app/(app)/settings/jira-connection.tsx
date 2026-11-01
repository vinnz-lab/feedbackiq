"use client";

import { useActionState } from "react";
import { disconnectJira, saveJiraConnection, type JiraSaveState } from "./jira-actions";

export type JiraView =
  | { connected: false }
  | { connected: true; site: string; email: string; projectKey: string; issueType: string; nameMode: "include" | "mask" | "remove"; tokenLast4: string | null; updatedAt: string };

const NAME_SHORT = { include: "names included", mask: "names masked as initials", remove: "names left out" };

const NAME_LABEL = {
  include: "Include names",
  mask: "Mask names as initials (e.g. R. P.)",
  remove: "Leave names out",
};

export function JiraConnection({ view, isOwner, canSave }: { view: JiraView; isOwner: boolean; canSave: boolean }) {
  const [state, save, saving] = useActionState<JiraSaveState, FormData>(saveJiraConnection, {});
  const [dState, disconnect, disconnecting] = useActionState<JiraSaveState, FormData>(disconnectJira, {});
  const input = "w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo disabled:opacity-50";
  const label = "mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted";
  const c = view.connected ? view : null;

  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">Jira</h2>
      <p className="mt-1 mb-3 text-[13px] text-muted">
        Send roadmap items to Jira Cloud as tickets, with the customer evidence attached, so they can be planned into
        sprints. Status comes back with “Refresh from Jira” on the Roadmap.
      </p>
      <div
        className="mb-3.5 rounded-[10px] px-3.5 py-2.5 text-[12.5px] font-medium"
        style={c ? { background: "var(--emerald-soft)", color: "var(--emerald)" } : { background: "var(--slate-soft)", color: "var(--slate)" }}
      >
        {c ? `Connected to ${c.site.replace("https://", "")} · project ${c.projectKey} · tickets created as ${c.issueType} · ${NAME_SHORT[c.nameMode]}.` : "Not connected."}
      </div>

      {!isOwner ? (
        <p className="text-[12.5px] text-muted">Only the workspace owner can connect Jira.</p>
      ) : (
        <>
          <form action={save} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Jira site</span>
              <input name="site" defaultValue={c?.site.replace("https://", "") ?? ""} placeholder="yourcompany.atlassian.net" aria-label="Jira site" disabled={!canSave} className={input} />
            </label>
            <label className="block">
              <span className={label}>Atlassian account email</span>
              <input name="email" type="email" defaultValue={c?.email ?? ""} aria-label="Atlassian account email" disabled={!canSave} className={input} />
            </label>
            <label className="block sm:col-span-2">
              <span className={label}>API token {c?.tokenLast4 ? `(saved: …${c.tokenLast4} — leave blank to keep it)` : ""}</span>
              <input
                name="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Create one at id.atlassian.com → Security → API tokens"
                aria-label="Jira API token"
                disabled={!canSave}
                className={`${input} font-mono`}
              />
            </label>
            <label className="block">
              <span className={label}>Project key</span>
              <input name="projectKey" defaultValue={c?.projectKey ?? ""} placeholder="e.g. FIQ" aria-label="Jira project key" disabled={!canSave} className={`${input} uppercase`} />
            </label>
            <label className="block">
              <span className={label}>Issue type</span>
              <input name="issueType" defaultValue={c?.issueType ?? "Story"} aria-label="Jira issue type" disabled={!canSave} className={input} />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className={label}>Customer names in tickets</legend>
              <div className="flex flex-col gap-1.5">
                {(Object.keys(NAME_LABEL) as (keyof typeof NAME_LABEL)[]).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-[12.5px]">
                    <input type="radio" name="nameMode" value={m} defaultChecked={(c?.nameMode ?? "include") === m} disabled={!canSave} className="accent-[var(--indigo)]" />
                    {NAME_LABEL[m]}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11.5px] text-muted">
                Masking and leaving out apply to the names FeedbackIQ knows (customer, contact, speaker) wherever they
                appear. A name typed inside a quote that FeedbackIQ doesn&apos;t know about can&apos;t be spotted.
              </p>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={saving || !canSave}
                className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Checking with Jira…" : c ? "Check and save changes" : "Check and connect"}
              </button>
              {state.error && <span className="text-[12.5px] text-rose">⚠ {state.error}</span>}
              {state.ok && <span className="text-[12.5px] text-emerald">✓ {state.ok}</span>}
            </div>
            {!canSave && <p className="text-[12px] text-muted sm:col-span-2">Saving connections isn&apos;t switched on for this app yet.</p>}
          </form>
          {c && (
            <form action={disconnect} className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <button
                type="submit"
                disabled={disconnecting}
                className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-hover disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect Jira"}
              </button>
              <span className="text-[12px] text-muted">Tickets already created stay in Jira and stay linked here.</span>
              {dState.error && <span className="text-[12.5px] text-rose">⚠ {dState.error}</span>}
            </form>
          )}
          {dState.ok && <p className="mt-2 text-[12.5px] text-emerald">✓ {dState.ok}</p>}
          <p className="mt-3 text-[11.5px] text-muted">
            The token is checked with Jira, then stored encrypted. It&apos;s never shown again and isn&apos;t included in backups.
          </p>
        </>
      )}
    </section>
  );
}
