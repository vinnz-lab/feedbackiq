import { and, desc, eq } from "drizzle-orm";
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
  return rows.map((r) => ({
    workspaceId: r.workspaceId,
    name: r.name,
    owner: (r.after as { owner?: string } | null)?.owner ?? "",
    createdAt: r.createdAt,
  }));
}
