import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Workspaces the platform owner has set up for other people.
 *
 * Deliberately METADATA ONLY — the workspace name, its owner, and when it was
 * set up. Nothing from inside it (no feedback, themes or counts), because the
 * platform owner is not a member and must not see its content.
 */
export async function listProvisioned(adminUserId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      workspaceId: schema.workspaces.id,
      name: schema.workspaces.name,
      createdAt: schema.auditEvents.createdAt,
      after: schema.auditEvents.after,
    })
    .from(schema.auditEvents)
    .innerJoin(schema.workspaces, eq(schema.auditEvents.workspaceId, schema.workspaces.id))
    .where(and(eq(schema.auditEvents.action, "workspace.provisioned"), eq(schema.auditEvents.actorId, adminUserId)))
    .orderBy(desc(schema.auditEvents.createdAt));
  const out = [];
  for (const r of rows) {
    // Numbers only: how many people are in it, and how many have nowhere else
    // to go (they would lose their sign-in if it is removed). No names, no content.
    const members = await db
      .select({ userId: schema.workspaceMembers.userId })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, r.workspaceId));
    let onlyHere = 0;
    if (members.length) {
      const counts = await db
        .select({ userId: schema.workspaceMembers.userId, n: count() })
        .from(schema.workspaceMembers)
        .where(inArray(schema.workspaceMembers.userId, members.map((m) => m.userId)))
        .groupBy(schema.workspaceMembers.userId);
      onlyHere = counts.filter((c) => Number(c.n) === 1 && c.userId !== adminUserId).length;
    }
    out.push({
      workspaceId: r.workspaceId,
      name: r.name,
      owner: (r.after as { owner?: string } | null)?.owner ?? "",
      createdAt: r.createdAt,
      memberCount: members.length,
      onlyHere,
    });
  }
  return out;
}
