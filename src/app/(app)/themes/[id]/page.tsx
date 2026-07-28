import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  Card,
  TypePill,
  SentimentPill,
  PriorityPill,
  DeltaChip,
  SentimentBar,
  AiText,
  SENTIMENT_COLOR,
  type FeedbackType,
  type Sentiment,
  type Priority,
} from "@/components/ui";
import { mixString } from "@/components/theme-card";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = {
  email: "📧", recording: "🎙", transcript: "🎙", spreadsheet: "📊", note: "📝", paste: "📋",
};

export default async function ThemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getDb();
  const fi = schema.feedbackItems;

  const [theme] = await db.select().from(schema.themes).where(eq(schema.themes.id, id)).limit(1);
  if (!theme) {
    return (
      <div>
        <Link href="/themes" className="text-[13px] font-semibold text-indigo">← Back to Themes</Link>
        <p className="mt-6 text-[14px] text-muted">Theme not found.</p>
      </div>
    );
  }

  const items = await db
    .select({
      id: fi.id,
      quote: fi.quote,
      customer: fi.customer,
      submitter: fi.submitter,
      speaker: fi.speaker,
      ts: fi.timestampLabel,
      rowRef: fi.rowRef,
      type: fi.type,
      sentiment: fi.sentiment,
      occurredAt: fi.occurredAt,
      sourceKind: schema.sources.kind,
      sourceName: schema.sources.filename,
    })
    .from(fi)
    .leftJoin(schema.sources, eq(fi.sourceId, schema.sources.id))
    .where(and(eq(fi.themeId, id), eq(fi.reviewStatus, "approved")))
    .orderBy(desc(fi.createdAt));

  const agg = { total: items.length, pos: 0, neu: 0, neg: 0, mix: {} as Record<string, number> };
  const typeCounts: Record<string, number> = {};
  for (const it of items) {
    if (it.sentiment === "Positive") agg.pos++;
    else if (it.sentiment === "Neutral") agg.neu++;
    else if (it.sentiment === "Negative") agg.neg++;
    if (it.sourceKind) agg.mix[it.sourceKind] = (agg.mix[it.sourceKind] ?? 0) + 1;
    if (it.type) typeCounts[it.type] = (typeCounts[it.type] ?? 0) + 1;
  }
  const typeMax = Math.max(1, ...Object.values(typeCounts));
  const TYPE_COLOR: Record<string, string> = {
    Feature: "var(--indigo)", Bug: "var(--rose)", UX: "var(--amber)",
    Question: "var(--slate)", Praise: "var(--emerald)",
  };

  return (
    <div>
      <Link href="/themes" className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo">
        ← Back to Themes
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold tracking-tight">{theme.title}</h1>
        <DeltaChip value={theme.deltaPct} />
        {theme.isEmerging && (
          <span className="rounded-[4px] bg-rose px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-wide text-white">EMERGING</span>
        )}
      </div>

      {theme.summary && (
        <p className="mb-3 max-w-3xl text-[14px] text-muted">
          <AiText>{theme.summary}</AiText>
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        {theme.type && <TypePill type={theme.type as FeedbackType} />}
        {theme.sentiment && <SentimentPill sentiment={theme.sentiment as Sentiment} />}
        {theme.priority && <PriorityPill priority={theme.priority as Priority} />}
        <span className="ml-1 text-[12px] text-muted">
          <b className="font-semibold text-fg">{agg.total} mentions</b>
          {agg.total > 0 && <> · {mixString(agg.mix)}</>}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Evidence */}
        <div>
          <h2 className="mb-1 text-[18px] font-semibold">Evidence ({agg.total})</h2>
          <p className="mb-3 text-[12px] text-muted">Every item traces back to its original source.</p>
          <div className="flex flex-col gap-2.5">
            {items.map((it) => (
              <Card key={it.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {it.type && <TypePill type={it.type as FeedbackType} />}
                  {it.sentiment && (
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: SENTIMENT_COLOR[it.sentiment as Sentiment] }} />
                      {it.sentiment}
                    </span>
                  )}
                </div>
                <div className="text-[13.5px] font-medium">“{it.quote}”</div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
                  <span>{KIND_ICON[it.sourceKind ?? ""] ?? "•"} {it.sourceName ?? "source"}</span>
                  {it.speaker && <span>· {it.speaker}{it.ts ? ` @ ${it.ts}` : ""}</span>}
                  {it.rowRef && <span>· {it.rowRef}</span>}
                  {(it.customer || it.submitter) && <span>· {it.customer ?? it.submitter}</span>}
                </div>
              </Card>
            ))}
            {agg.total === 0 && (
              <p className="text-[13px] text-muted">No approved items yet — approve items in the Register to populate this theme.</p>
            )}
          </div>
        </div>

        {/* Analytics rail */}
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h3 className="mb-3 text-[13px] font-bold">Sentiment</h3>
            <SentimentBar positive={agg.pos} neutral={agg.neu} negative={agg.neg} showLegend />
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 text-[13px] font-bold">Type breakdown</h3>
            <div className="flex flex-col gap-2">
              {(["Feature", "Bug", "UX", "Question", "Praise"] as const).map((t) => (
                <div key={t} className="flex items-center gap-2.5 text-[12px] text-muted">
                  <span className="w-16">{t}</span>
                  <span
                    className="h-2 rounded"
                    style={{ width: `${((typeCounts[t] ?? 0) / typeMax) * 130 + 6}px`, background: TYPE_COLOR[t] }}
                  />
                  <b className="text-fg">{typeCounts[t] ?? 0}</b>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
