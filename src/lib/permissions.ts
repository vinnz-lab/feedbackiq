import type { RoleT } from "@/db/schema";
import { requireWorkspace, type WorkspaceContext } from "@/lib/workspace";

/**
 * WHO MAY DO WHAT — the one table every action checks, on the server.
 *
 *   edit  – add feedback, run AI, approve/discard/correct, rename and merge
 *           themes, change the roadmap, generate digests
 *   jira  – send roadmap items to Jira and refresh their status
 *   admin – team, workspace settings, AI key, Jira connection, clear/delete,
 *           backups (these were already owner-only and still check the role
 *           directly; listed here so the table is complete)
 *
 * Viewers can open every page but change nothing and spend no AI.
 * Executive and Engineer keep contributor-level access for now (unchanged).
 */
export type Capability = "edit" | "jira" | "admin";

const MATRIX: Record<RoleT, readonly Capability[]> = {
  owner: ["edit", "jira", "admin"],
  contributor: ["edit", "jira"],
  executive: ["edit", "jira"],
  engineer: ["edit", "jira"],
  viewer: [],
};

export function can(role: RoleT | string | null | undefined, cap: Capability): boolean {
  return Boolean(role && (MATRIX as Record<string, readonly Capability[]>)[role]?.includes(cap));
}

export function deniedMessage(cap: Capability): string {
  if (cap === "admin") return "Only the workspace owner can do this.";
  if (cap === "jira") return "Your role can't send items to Jira.";
  return "You have view-only access to this workspace, so you can't change anything.";
}

/** The current workspace, or throws if this person's role there doesn't allow `cap`. */
export async function requireCapability(cap: Capability): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace();
  if (!can(ctx.role, cap)) throw new Error(deniedMessage(cap));
  return ctx;
}

/** For pages: whether the signed-in person may do `cap` in the current workspace. */
export async function currentCan(cap: Capability): Promise<boolean> {
  const { getWorkspaceContext } = await import("@/lib/workspace");
  const ctx = await getWorkspaceContext();
  return Boolean(ctx && can(ctx.role, cap));
}
