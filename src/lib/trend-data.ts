import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeTrend, type Trend } from "@/lib/trend";

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
