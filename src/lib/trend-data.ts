import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeTrend, isEmerging, type Trend } from "@/lib/trend";

/** Trend for every theme, from its approved feedback. One query for all themes. */
export async function loadTrends(workspaceId: string): Promise<Map<string, Trend>> {
  const db = await getDb();
  const fi = schema.feedbackItems;
  const rows = await db
    .select({ themeId: fi.themeId, occurredAt: fi.occurredAt, createdAt: fi.createdAt })
    .from(fi)
    .where(and(eq(fi.workspaceId, workspaceId), eq(fi.reviewStatus, "approved")));

  const byTheme = new Map<string, Date[]>();
  for (const r of rows) {
    if (!r.themeId) continue;
    const list = byTheme.get(r.themeId) ?? [];
    list.push(r.occurredAt ?? r.createdAt);
    byTheme.set(r.themeId, list);
  }
  const out = new Map<string, Trend>();
  for (const [id, dates] of byTheme) out.set(id, computeTrend(dates));
  return out;
}

/**
 * Themes that are emerging right now (see isEmerging), worked out from the
 * feedback itself rather than a flag stored once and never updated.
 */
export async function loadEmerging(workspaceId: string, trends?: Map<string, Trend>): Promise<Set<string>> {
  const t = trends ?? (await loadTrends(workspaceId));
  const db = await getDb();
  const fi = schema.feedbackItems;
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000);
  // "History" = any approved feedback from more than two weeks ago.
  const [old] = await db
    .select({ id: fi.id })
    .from(fi)
    .where(
      and(
        eq(fi.workspaceId, workspaceId),
        eq(fi.reviewStatus, "approved"),
        sql`coalesce(${fi.occurredAt}, ${fi.createdAt}) < ${twoWeeksAgo.toISOString()}`,
      ),
    )
    .limit(1);
  const hasHistory = Boolean(old);
  const out = new Set<string>();
  for (const [id, trend] of t) if (isEmerging(trend, hasHistory)) out.add(id);
  return out;
}
