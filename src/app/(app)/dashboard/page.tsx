import Link from "next/link";
import { and, eq, count } from "drizzle-orm";
import { currentWorkspaceId } from "@/lib/workspace";
import { currentCan } from "@/lib/permissions";
import { getDb, schema } from "@/db";
import { getWorkspaceInfo } from "@/lib/workspace-info";
import { getCurrentUser } from "@/lib/auth";
import { loadFacets } from "@/lib/facets-data";
import { loadTrends } from "@/lib/trend-data";
import {
  Card,
  TypePill,
  SentimentPill,
  PriorityPill,
  TrendChip,
  SentimentBar,
  AiText,
  type FeedbackType,
  type Sentiment,
  type Priority,
} from "@/components/ui";

export const dynamic = "force-dynamic";

type Breakdown = { Positive: number; Neutral: number; Negative: number; total: number };

export default async function DashboardPage() {
  const info = await getWorkspaceInfo();
  const me = await getCurrentUser();
  const firstName = (me?.name ?? "").split(" ")[0] || "there";
  const wsId = await currentWorkspaceId();
  const canEdit = await currentCan("edit");
  const db = await getDb();
  const fi = schema.feedbackItems;

  const [{ n: totalItems }] = await db
    .select({ n: count() })
    .from(fi)
    .where(and(eq(fi.workspaceId, wsId), eq(fi.reviewStatus, "approved")));
  const [{ n: themeCount }] = await db
    .select({ n: count() })
    .from(schema.themes)
    .where(eq(schema.themes.workspaceId, wsId));
  const [{ n: sourceCount }] = await db
    .select({ n: count() })
    .from(schema.sources)
    .where(eq(schema.sources.workspaceId, wsId));
  const [{ n: needsReview }] = await db
    .select({ n: count() })
    .from(fi)
    .where(and(eq(fi.workspaceId, wsId), eq(fi.reviewStatus, "needs_review")));

  const themes = await db.select().from(schema.themes).where(eq(schema.themes.workspaceId, wsId));
  const counts = await db
    .select({ themeId: fi.themeId, sentiment: fi.sentiment, n: count() })
    .from(fi)
    .where(and(eq(fi.workspaceId, wsId), eq(fi.reviewStatus, "approved")))
    .groupBy(fi.themeId, fi.sentiment);

  const map = new Map<string, Breakdown>();
  for (const r of counts) {
    if (!r.themeId) continue;
    const m = map.get(r.themeId) ?? { Positive: 0, Neutral: 0, Negative: 0, total: 0 };
    if (r.sentiment) m[r.sentiment as Sentiment] += Number(r.n);
    m.total += Number(r.n);
    map.set(r.themeId, m);
  }

  const trends = await loadTrends(wsId);
  const facets = await loadFacets(wsId);
  const missingSummaries = themes.filter((t) => !t.summary).length;
  const top = themes
    .map((t) => ({ t, c: map.get(t.id) ?? { Positive: 0, Neutral: 0, Negative: 0, total: 0 } }))
    .sort((a, b) => b.c.total - a.c.total)
    .slice(0, 6);

  const kpis = [
    { label: "Total mentions", value: String(totalItems), sub: "approved feedback items", bg: "rgba(249,115,22,.14)", icon: "💬" },
    { label: "Active themes", value: String(themeCount), sub: "clustered by AI", bg: "var(--indigo-soft)", icon: "✦" },
    { label: "Needs review", value: String(needsReview), sub: "awaiting your confirmation", bg: "var(--amber-soft)", icon: "⚡" },
    { label: "Sources ingested", value: String(sourceCount), sub: "emails · calls · sheets", bg: "rgba(20,184,166,.14)", icon: "📥" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">Feedback themes for {info.workspaceName} · Last 30 days</p>
        </div>
        <Link
          href="/digest"
          className="ml-auto rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110"
        >
          {canEdit ? "✨ Generate Digest" : "View digest"}
        </Link>
      </div>

      <div className="mb-2">
        <h2 className="text-[22px] font-semibold tracking-tight">Welcome back, {firstName} 👋</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Here&apos;s what&apos;s happening with {info.workspaceName} this week.
        </p>
      </div>

      <div className="mt-5 mb-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="flex items-start gap-3.5 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] text-xl" style={{ background: k.bg }}>
              {k.icon}
            </div>
            <div>
              <div className="text-[12px] font-semibold text-muted">{k.label}</div>
              <div className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-tight">{k.value}</div>
              <div className="mt-0.5 text-[11.5px] text-muted">{k.sub}</div>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mb-1 text-[20px] font-semibold tracking-tight">Top themes</h2>
      {missingSummaries > 0 && (
        <p className="mb-3.5 text-[12px] text-muted">
          {missingSummaries} theme{missingSummaries === 1 ? " has" : "s have"} no summary yet — open{" "}
          <Link href="/themes" className="font-semibold text-indigo">Themes</Link> and choose
          “Regenerate summaries”.
        </p>
      )}
      {missingSummaries === 0 && <div className="mb-3.5" />}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {top.map(({ t, c }) => (
          <Card key={t.id} className="flex flex-col gap-2.5 p-6">
            <div className="flex items-start gap-2.5">
              <div className="flex-1 text-[16px] font-semibold leading-snug">{t.title}</div>
              <TrendChip trend={trends.get(t.id)} />
            </div>
            {t.summary && (
              <div className="line-clamp-1 text-[13px] text-muted">
                <AiText>{t.summary}</AiText>
              </div>
            )}
            {(() => {
              const f = facets.get(t.id);
              const type = f?.type ?? t.type;
              const sentiment = f?.sentiment ?? t.sentiment;
              const priority = f?.priority ?? t.priority;
              return (
                <div className="flex flex-wrap items-center gap-1.5">
                  {type && <TypePill type={type as FeedbackType} />}
                  {sentiment && <SentimentPill sentiment={sentiment as Sentiment} />}
                  {priority && <PriorityPill priority={priority as Priority} />}
                </div>
              );
            })()}
            <div className="text-[12px] text-muted">
              <b className="font-semibold text-fg">{c.total} {c.total === 1 ? "mention" : "mentions"}</b>
            </div>
            <SentimentBar positive={c.Positive} neutral={c.Neutral} negative={c.Negative} showLegend />
          </Card>
        ))}
      </div>

      <p className="mt-8 text-[12px] text-muted">
        Themes, sentiment and clustering are generated by AI from your approved feedback.
      </p>
    </div>
  );
}
