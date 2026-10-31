import { cache } from "react";
import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser, type AppUser } from "@/lib/auth";
import type { RoleT } from "@/db/schema";

/**
 * THE ONE PLACE that decides which workspace a request is about.
 *
 * Rules:
 *  - A user only ever sees workspaces they are a MEMBER of. There is no
 *    "see everything" role, on purpose (tester / client privacy).
 *  - The chosen workspace is remembered in a cookie, but the cookie is only a
 *    preference: it is checked against the user's memberships on every request,
 *    so a forged or stale value can never open someone else's workspace.
 *  - Every page, action and API route must take its workspace from here and
 *    filter by `ctx.workspace.id`. Nothing may pick "the first workspace".
 */
export const WS_COOKIE = "fiq_ws";

export type Workspace = typeof schema.workspaces.$inferSelect;

export type WorkspaceContext = {
  user: AppUser;
  workspace: Workspace;
  /** The user's role in THIS workspace. */
  role: RoleT;
  /** Every workspace this user can open, for the switcher. */
  memberships: { workspace: Workspace; role: RoleT }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listMemberships(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ workspace: schema.workspaces, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
    .where(eq(schema.workspaceMembers.userId, userId))
    .orderBy(asc(schema.workspaces.createdAt));
  return rows;
}

/** The current workspace context, or null if signed out or a member of nothing. Cached per request. */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  let memberships: { workspace: Workspace; role: RoleT }[];
  try {
    memberships = await listMemberships(user.id);
  } catch {
    return null; // fail closed
  }
  if (memberships.length === 0) return null;

  let wanted: string | undefined;
  try {
    wanted = (await cookies()).get(WS_COOKIE)?.value;
  } catch {
    wanted = undefined;
  }
  const chosen =
    (wanted && UUID_RE.test(wanted) && memberships.find((m) => m.workspace.id === wanted)) ||
    memberships[0];

  return { user, workspace: chosen.workspace, role: chosen.role, memberships };
});

/** Like getWorkspaceContext, but throws. Use in every server action and route. */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    const user = await getCurrentUser();
    throw new Error(user ? "You don't have access to a workspace yet." : "Not signed in.");
  }
  return ctx;
}

/** For pages: the workspace id, or throws (the layout already redirects signed-out users). */
export async function currentWorkspaceId(): Promise<string> {
  return (await requireWorkspace()).workspace.id;
}
