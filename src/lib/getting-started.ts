import { and, eq, isNotNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hasSampleData, isWorkspaceEmpty } from "@/lib/sample-data";

/**
 * The welcome guide's progress, worked out from the workspace's own data, so
 * nothing extra is stored and every workspace starts fresh.
 */
export type StepKey = "add" | "analyse" | "review" | "themes" | "roadmap" | "digest";
export type GuideState = { done: Record<StepKey, boolean>; empty: boolean; hasSample: boolean };

export async function getGuideState(workspaceId: string): Promise<GuideState> {
  const db = await getDb();
  const s = schema;
  const fi = s.feedbackItems;
  const one = async (q: Promise<unknown[]>) => (await q).length > 0;
  const [add, analyse, review, themes, roadmap, digest, empty, hasSample] = await Promise.all([
    one(db.select({ id: fi.id }).from(fi).where(and(eq(fi.workspaceId, workspaceId), ne(fi.reviewStatus, "discarded"))).limit(1)),
    one(db.select({ id: fi.id }).from(fi).where(and(eq(fi.workspaceId, workspaceId), isNotNull(fi.type))).limit(1)),
    one(db.select({ id: fi.id }).from(fi).where(and(eq(fi.workspaceId, workspaceId), eq(fi.reviewStatus, "approved"))).limit(1)),
    one(db.select({ id: s.themes.id }).from(s.themes).where(eq(s.themes.workspaceId, workspaceId)).limit(1)),
    one(db.select({ id: s.enhancements.id }).from(s.enhancements).where(eq(s.enhancements.workspaceId, workspaceId)).limit(1)),
    one(db.select({ id: s.digests.id }).from(s.digests).where(eq(s.digests.workspaceId, workspaceId)).limit(1)),
    isWorkspaceEmpty(workspaceId),
    hasSampleData(workspaceId),
  ]);
  return { done: { add, analyse, review, themes: themes && review, roadmap, digest }, empty, hasSample };
}
