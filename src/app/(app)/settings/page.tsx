import { listMembers, ROLE_LABEL, initials } from "@/lib/auth";
import { requireWorkspace } from "@/lib/workspace";
import { authMode } from "@/lib/supabase/env";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { getWorkspaceInfo } from "@/lib/workspace-info";
import { AddTeamMember } from "./add-team-member";
import { RemoveMember } from "./remove-member";
import { ClearRegister } from "./clear-register";
import { WorkspaceDetails } from "./workspace-details";
import { DeleteWorkspace } from "./delete-workspace";
import { ProvisionWorkspace } from "./provision-workspace";
import { AccountPassword } from "./account-password";
import { ResetPasswordButton } from "./reset-member-password";
import { resetMemberPassword } from "./team-actions";
import { canResetPassword, workspaceCountFor } from "@/lib/password-admin";
import { AiConnection } from "./ai-connection";
import { JiraConnection } from "./jira-connection";
import { connectionView, getJiraConnection } from "@/lib/jira-workspace";
import { getAiKeyStatus } from "@/lib/ai/workspace-key";
import { canEncrypt } from "@/lib/secret-box";
import { isPlatformAdmin } from "@/lib/platform";
import { listProvisioned } from "@/lib/platform-data";
import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const info = await getWorkspaceInfo();
  const ctx = await requireWorkspace();
  const me = ctx.user;
  // Only the people in THIS workspace, with their role here.
  const users = await listMembers(ctx.workspace.id);
  const mode = authMode();
  const isOwner = ctx.role === "owner";

  // For the delete section: what would go, and who would lose access.
  let delCounts = { items: 0, themes: 0, roadmap: 0 };
  if (isOwner) {
    const db = await getDb();
    const c = async (t: typeof schema.themes) =>
      Number((await db.select({ n: count() }).from(t).where(eq(t.workspaceId, ctx.workspace.id)))[0].n);
    delCounts = {
      items: Number(
        (
          await db
            .select({ n: count() })
            .from(schema.feedbackItems)
            .where(and(eq(schema.feedbackItems.workspaceId, ctx.workspace.id)))
        )[0].n,
      ),
      themes: await c(schema.themes),
      roadmap: await c(schema.enhancements as unknown as typeof schema.themes),
    };
  }
  const others = users.filter((u) => u.id !== me.id).map((u) => u.name);
  // Who this person may reset — see lib/password-admin.ts for why it's strict.
  const resetBlocked = new Map<string, string | null>();
  for (const u of users) {
    const d = canResetPassword({
      actorIsPlatformAdmin: isPlatformAdmin(me.email),
      actorRoleHere: ctx.role,
      actorId: me.id,
      targetId: u.id,
      targetIsPlatformAdmin: isPlatformAdmin(u.email),
      targetWorkspaceCount: await workspaceCountFor(u.id),
    });
    resetBlocked.set(u.id, d.ok ? null : d.reason);
  }
  const aiStatus = await getAiKeyStatus(ctx.workspace.id);
  const jiraView = connectionView(await getJiraConnection(ctx.workspace.id));
  const platformAdmin = isPlatformAdmin(me.email);
  const provisioned = platformAdmin
    ? (await listProvisioned(me.id)).map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))
    : [];

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Team and access for {info.workspaceName}</p>
      </div>

      <AccountPassword
        email={me.email}
        workspaceCount={ctx.memberships.length}
        supabaseActive={mode === "supabase"}
      />

      {platformAdmin && <ProvisionWorkspace provisioned={provisioned} canResetPasswords={mode === "supabase"} />}

      <AiConnection
        status={{ ...aiStatus, updatedAt: aiStatus.updatedAt ? aiStatus.updatedAt.toISOString() : null }}
        isOwner={isOwner}
        canSave={canEncrypt()}
      />

      <JiraConnection view={jiraView} isOwner={isOwner} canSave={canEncrypt()} />

      {isOwner && (
        <WorkspaceDetails name={ctx.workspace.name} description={ctx.workspace.description ?? ""} />
      )}

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
              className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-bg px-3.5 py-2.5"
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
              {isOwner && u.id !== me?.id && mode === "supabase" && (
                <ResetPasswordButton
                  action={resetMemberPassword}
                  field="id"
                  value={u.id}
                  name={u.name}
                  blockedReason={resetBlocked.get(u.id)}
                />
              )}
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
      {isOwner && <ClearRegister />}
      {isOwner && (
        <DeleteWorkspace
          name={ctx.workspace.name}
          isLast={ctx.memberships.length < 2}
          others={others}
          counts={delCounts}
        />
      )}
    </div>
  );
}
