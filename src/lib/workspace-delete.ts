import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type RemovedCounts = {
  feedbackItems: number;
  themes: number;
  sources: number;
  roadmapItems: number;
  digests: number;
  members: number;
};

/**
 * Deletes ONE workspace and everything in it, in a single transaction: either
 * all of it goes or none of it does. Callers do the permission checks.
 * Returns what was removed (counted beforehand), for the audit record.
 */
export async function deleteWorkspaceCompletely(workspaceId: string): Promise<RemovedCounts> {
  const db = await getDb();
  const n = async (t: { workspaceId: unknown }) =>
    Number(
      (
        await db
          .select({ n: count() })
          .from(t as typeof schema.themes)
          .where(eq((t as typeof schema.themes).workspaceId, workspaceId))
      )[0].n,
    );
  const removed: RemovedCounts = {
    feedbackItems: await n(schema.feedbackItems as never),
    themes: await n(schema.themes as never),
    sources: await n(schema.sources as never),
    roadmapItems: await n(schema.enhancements as never),
    digests: await n(schema.digests as never),
    members: await n(schema.workspaceMembers as never),
  };

  await db.transaction(async (tx) => {
    // Children first, so nothing depends on cascade behaviour.
    await tx.delete(schema.digests).where(eq(schema.digests.workspaceId, workspaceId));
    await tx.delete(schema.enhancements).where(eq(schema.enhancements.workspaceId, workspaceId)); // evidence links cascade
    await tx.delete(schema.feedbackItems).where(eq(schema.feedbackItems.workspaceId, workspaceId));
    await tx.delete(schema.sources).where(eq(schema.sources.workspaceId, workspaceId));
    await tx.delete(schema.themes).where(eq(schema.themes.workspaceId, workspaceId));
    await tx.delete(schema.productAreas).where(eq(schema.productAreas.workspaceId, workspaceId));
    await tx.delete(schema.trackerConnections).where(eq(schema.trackerConnections.workspaceId, workspaceId));
    await tx.delete(schema.aiConfigs).where(eq(schema.aiConfigs.workspaceId, workspaceId));
    await tx.delete(schema.incomingWebhooks).where(eq(schema.incomingWebhooks.workspaceId, workspaceId));
    await tx.delete(schema.digestChannels).where(eq(schema.digestChannels.workspaceId, workspaceId));
    await tx.delete(schema.shareLinks).where(eq(schema.shareLinks.workspaceId, workspaceId));
    await tx.delete(schema.workspaceAiSettings).where(eq(schema.workspaceAiSettings.workspaceId, workspaceId));
    await tx.delete(schema.auditEvents).where(eq(schema.auditEvents.workspaceId, workspaceId));
    await tx.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, workspaceId));
    const gone = await tx
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId))
      .returning({ id: schema.workspaces.id });
    if (gone.length !== 1) throw new Error("The workspace could not be deleted. Nothing was changed.");
  });
  return removed;
}
