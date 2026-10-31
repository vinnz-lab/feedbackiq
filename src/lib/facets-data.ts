import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { deriveFacets, type Facets } from "@/lib/facets";

/** Facets for every theme, from its approved feedback. One query. */
export async function loadFacets(workspaceId: string): Promise<Map<string, Facets>> {
  const db = await getDb();
  const fi = schema.feedbackItems;
  const rows = await db
    .select({ themeId: fi.themeId, type: fi.type, sentiment: fi.sentiment, severity: fi.severity })
    .from(fi)
    .where(and(eq(fi.workspaceId, workspaceId), eq(fi.reviewStatus, "approved")));
  const byTheme = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.themeId) continue;
    const list = byTheme.get(r.themeId) ?? [];
    list.push(r);
    byTheme.set(r.themeId, list);
  }
  const out = new Map<string, Facets>();
  for (const [id, items] of byTheme) out.set(id, deriveFacets(items));
  return out;
}
