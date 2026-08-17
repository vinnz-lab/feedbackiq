import { getCurrentUser, listUsers, ROLE_LABEL, initials } from "@/lib/auth";
import { authMode } from "@/lib/supabase/env";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { AddTeamMember } from "./add-team-member";
import { RemoveMember } from "./remove-member";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [me, users] = await Promise.all([getCurrentUser(), listUsers()]);
  const mode = authMode();
  const isOwner = me?.role === "owner";

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Team and access for Acme App</p>
      </div>

      <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
        <h2 className="text-[15px] font-semibold">Sign-in</h2>
        {mode === "supabase" ? (
          <p className="mt-1 text-[13px] text-muted">
            <b className="text-emerald">Email and password is active.</b> Accounts are created
            here by the owner — there is no public sign-up.
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-muted">
            <b className="text-amber">The development profile picker is active.</b> Anyone who
            can reach this URL can pick a profile and get in. Configure Supabase Auth before
            sharing the link.
          </p>
        )}
        {mode === "supabase" && !isAdminConfigured() && (
          <p className="mt-2 text-[12.5px] text-amber">
            ⚠ Adding people also needs <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
        <h2 className="text-[15px] font-semibold">People</h2>
        <p className="mt-1 mb-3.5 text-[13px] text-muted">
          {users.length} {users.length === 1 ? "person" : "people"} with access
        </p>

        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-[10px] border border-border bg-bg px-3.5 py-2.5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo text-[11px] font-bold text-white">
                {initials(u.name)}
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-semibold">
                  {u.name}
                  {u.id === me?.id && <span className="ml-2 text-[11px] text-muted">you</span>}
                </span>
                <span className="text-[11.5px] text-muted">{u.email}</span>
              </span>
              <span
                className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-semibold"
                style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}
              >
                {ROLE_LABEL[u.role] ?? u.role}
              </span>
              {isOwner && u.id !== me?.id && <RemoveMember id={u.id} name={u.name} />}
            </div>
          ))}
        </div>
      </section>

      {isOwner ? (
        <AddTeamMember supabaseActive={mode === "supabase"} />
      ) : (
        <p className="text-[12.5px] text-muted">Only the workspace owner can add people.</p>
      )}

      {isOwner && (
        <section className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <h2 className="text-[15px] font-semibold">Back up your data</h2>
          <p className="mt-1 mb-3.5 text-[13px] text-muted">
            Downloads everything — sources, feedback, themes, roadmap and people — as a single
            JSON file. Worth doing before a break: the hosting plan keeps no automatic backups of
            its own.
          </p>
          <a
            href="/api/export"
            className="inline-block rounded-[var(--radius-btn)] border border-border bg-surface px-4 py-2 text-[13px] font-semibold hover:bg-hover"
          >
            ⬇ Download a backup
          </a>
        </section>
      )}
    </div>
  );
}
