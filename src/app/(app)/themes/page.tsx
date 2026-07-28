import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ThemeCard, type ThemeAgg } from "@/components/theme-card";
import { RegenerateSummariesButton } from "@/components/regenerate-summaries-button";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const db = await getDb();
  const fi = schema.feedbackItems;

  const themes = await db.select().from(schema.themes);
  const rows = await db
    .select({ themeId: fi.themeId, sentiment: fi.sentiment, kind: schema.sources.kind })
    .from(fi)
    .leftJoin(schema.sources, eq(fi.sourceId, schema.sources.id))
    .where(eq(fi.reviewStatus, "approved"));

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
            {themes.length} themes synthesized from all approved feedback in Acme App
          </p>
        </div>
        <div className="ml-auto">
          <RegenerateSummariesButton />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {withAgg.map(({ t, agg }) => (
          <ThemeCard
            key={t.id}
            agg={agg}
            theme={{
              id: t.id,
              title: t.title,
              summary: t.summary,
              type: t.type,
              sentiment: t.sentiment,
              priority: t.priority,
              deltaPct: t.deltaPct,
              isEmerging: t.isEmerging,
            }}
          />
        ))}
      </div>
    </div>
  );
}
