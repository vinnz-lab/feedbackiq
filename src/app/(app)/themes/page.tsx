import { and, eq } from "drizzle-orm";
import { currentWorkspaceId } from "@/lib/workspace";
import { getDb, schema } from "@/db";
import { ThemeCard, type ThemeAgg } from "@/components/theme-card";
import { RegenerateSummariesButton } from "@/components/regenerate-summaries-button";
import { getWorkspaceInfo } from "@/lib/workspace-info";
import { loadFacets } from "@/lib/facets-data";
import { loadEmerging, loadTrends } from "@/lib/trend-data";
import { ConsolidateThemes } from "@/components/consolidate-themes";

export const dynamic = "force-dynamic";
// Server Action timeout is set at the page level; AI batches are paced and
// can run for minutes. 300s is the Vercel Hobby ceiling.
export const maxDuration = 300;

export default async function ThemesPage() {
  const wsId = await currentWorkspaceId();
  const db = await getDb();
  const fi = schema.feedbackItems;

  const info = await getWorkspaceInfo();
  const trends = await loadTrends(wsId);
  const emerging = await loadEmerging(wsId, trends);
  const facets = await loadFacets(wsId);
  const themes = await db.select().from(schema.themes).where(eq(schema.themes.workspaceId, wsId));
  const onRoadmap = new Set(
    (
      await db
        .select({ themeId: schema.enhancements.themeId })
        .from(schema.enhancements)
        .where(eq(schema.enhancements.workspaceId, wsId))
    )
      .map((r) => r.themeId)
      .filter((id): id is string => Boolean(id)),
  );
  const rows = await db
    .select({ themeId: fi.themeId, sentiment: fi.sentiment, kind: schema.sources.kind })
    .from(fi)
    .leftJoin(schema.sources, eq(fi.sourceId, schema.sources.id))
    .where(and(eq(fi.workspaceId, wsId), eq(fi.reviewStatus, "approved")));

  const aggMap = new Map<string, ThemeAgg>();
  for (const r of rows) {
    if (!r.themeId) continue;
    const a = aggMap.get(r.themeId) ?? { total: 0, pos: 0, neu: 0, neg: 0, mix: {} };
    a.total++;
    if (r.sentiment === "Positive") a.pos++;
    else if (r.sentiment === "Neutral") a.neu++;
    else if (r.sentiment === "Negative") a.neg++;
    if (r.kind) a.mix[r.kind] = (a.mix[r.kind] ?? 0) + 1;
    aggMap.set(r.themeId, a);
  }

  const withAgg = themes
    .map((t) => ({ t, agg: aggMap.get(t.id) ?? { total: 0, pos: 0, neu: 0, neg: 0, mix: {} } }))
    .sort((a, b) => b.agg.total - a.agg.total);

  return (
    <div>
      <div className="mb-6 flex items-start gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">Themes</h1>
          <p className="mt-1 text-[13px] text-muted">
            {themes.length} themes synthesized from all approved feedback in {info.workspaceName}
          </p>
        </div>
        <div className="ml-auto">
          <RegenerateSummariesButton />
        </div>
      </div>

      <div className="mb-5">
        <ConsolidateThemes themeCount={themes.length} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {withAgg.map(({ t, agg }) => (
          <ThemeCard
            key={t.id}
            agg={agg}
            onRoadmap={onRoadmap.has(t.id)}
            theme={{
              id: t.id,
              title: t.title,
              summary: t.summary,
              type: facets.get(t.id)?.type ?? t.type,
              sentiment: facets.get(t.id)?.sentiment ?? t.sentiment,
              priority: facets.get(t.id)?.priority ?? t.priority,
              trend: trends.get(t.id),
              isEmerging: emerging.has(t.id),
            }}
          />
        ))}
      </div>
    </div>
  );
}
