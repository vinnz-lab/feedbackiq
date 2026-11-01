import { redirect } from "next/navigation";
import { and, eq, count } from "drizzle-orm";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { getCurrentUser, initials, mustChangePassword, ROLE_LABEL } from "@/lib/auth";
import { getWorkspaceInfo } from "@/lib/workspace-info";
import { getWorkspaceContext } from "@/lib/workspace";
import { isPlatformAdmin } from "@/lib/platform";
import { can } from "@/lib/permissions";
import { signOut } from "@/app/login/actions";
import { getDb, schema } from "@/db";

/**
 * Never prerender anything behind the auth gate.
 *
 * Without this, whether the layout counts as dynamic depends on which auth
 * environment variables happen to exist at BUILD time: with none set, the gate
 * returns early before reading cookies, Next.js decides the page is static and
 * prerenders it — then a real request reads cookies and the page 500s with
 * DYNAMIC_SERVER_USAGE. The gate must run on every request, always.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // A temporary password must be replaced before anything else.
  if (await mustChangePassword()) redirect("/choose-password");

  // Signed in but not a member of any workspace: show nothing from anywhere.
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-sm rounded-[var(--radius-card)] border border-border bg-surface p-7 text-center shadow-[var(--shadow)]">
          <div className="text-[16px] font-semibold">No workspace yet</div>
          <p className="mt-1.5 text-[13px] text-muted">
            Your account isn&apos;t a member of any workspace. Ask the person who invited you to add
            you to one.
          </p>
          <form action={signOut} className="mt-4">
            <button className="rounded-[var(--radius-btn)] border border-border px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-hover">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const info = await getWorkspaceInfo();
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.feedbackItems)
    .where(
      and(
        eq(schema.feedbackItems.workspaceId, ctx.workspace.id),
        eq(schema.feedbackItems.reviewStatus, "needs_review"),
      ),
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar
        reviewCount={n}
        currentWorkspaceId={ctx.workspace.id}
        workspaces={ctx.memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, sub: m.workspace.description ?? "", role: m.role }))}
        canCreateWorkspace={isPlatformAdmin(ctx.user.email)}
        canEdit={can(ctx.role, "edit")}
        tenantName={info.tenantName}
        workspaceName={info.workspaceName}
        workspaceSub={info.workspaceSub}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{ name: user.name, role: ROLE_LABEL[ctx.role], initials: initials(user.name) }}
          workspaceName={info.workspaceName}
        />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-8 py-7 pb-20">
          {children}
        </main>
      </div>
    </div>
  );
}
