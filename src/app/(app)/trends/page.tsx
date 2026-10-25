import { getWorkspaceInfo } from "@/lib/workspace-info";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Card, AiText, SentimentBar } from "@/components/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  email: "Email", recording: "Recording", transcript: "Transcript",
  spreadsheet: "Spreadsheet", note: "Note", paste: "Paste",
};

function weekKey(d: Date) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // Monday=0
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export default async function TrendsPage() {
  const info = await getWorkspaceInfo();
  const db = await getDb();
  const fi = schema.feedbackItems;

  const rows = await db
    .select({
      sentiment: fi.sentiment,
      kind: schema.sources.kind,
      themeTitle: schema.themes.title,
      occurredAt: fi.occurredAt,
      createdAt: fi.createdAt,
    })
    .from(fi)
    .leftJoin(schema.sources, eq(fi.sourceId, schema.sources.id))
    .leftJoin(schema.themes, eq(fi.themeId, schema.themes.id))
    .where(eq(fi.reviewStatus, "approved"));

  // --- aggregates ---
  const sent = { Positive: 0, Neutral: 0, Negative: 0 };
  const bySource: Record<string, number> = {};
  const byTheme: Record<string, number> = {};
  const byWeek = new Map<number, number>();
  for (const r of rows) {
    if (r.sentiment) sent[r.sentiment as keyof typeof sent]++;
    if (r.kind) bySource[r.kind] = (bySource[r.kind] ?? 0) + 1;
    if (r.themeTitle) byTheme[r.themeTitle] = (byTheme[r.themeTitle] ?? 0) + 1;
    const wk = weekKey(r.occurredAt ?? r.createdAt).getTime();
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
  }
  const total = rows.length || 1;
  const negPct = Math.round((sent.Negative / total) * 100);
  const topSource = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];
  const topTheme = Object.entries(byTheme).sort((a, b) => b[1] - a[1])[0];

  const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).slice(-8);
  const themeBars = Object.entries(byTheme).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sourceBars = Object.entries(bySource).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">Trends</h1>
        <p className="mt-1 text-[13px] text-muted">Feedback trends for {info.workspaceName} · approved items</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Volume over time */}
        <Card className="p-5">
          <h3 className="text-[15px] font-semibold">Feedback volume over time</h3>
          <p className="mb-3 text-[12px] text-muted">Approved items per week</p>
          <WeeklyBars weeks={weeks} />
          <div className="mt-3 text-[12.5px]"><AiText>{`${total} approved items; most arrive via ${topSource ? KIND_LABEL[topSource[0]] ?? topSource[0] : "—"}. Weekly volume fills in as feedback arrives over time.`}</AiText></div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Sentiment distribution */}
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Sentiment distribution</h3>
            <p className="mb-3 text-[12px] text-muted">Across all approved feedback</p>
            <SentimentBar positive={sent.Positive} neutral={sent.Neutral} negative={sent.Negative} showLegend />
            <div className="mt-3 text-[12.5px]"><AiText>{`${negPct}% of feedback is negative — ${negPct >= 40 ? "worth watching." : "broadly healthy."}`}</AiText></div>
          </Card>

          {/* Source mix */}
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Source mix</h3>
            <p className="mb-3 text-[12px] text-muted">Where feedback comes from</p>
            <div className="flex flex-col gap-2">
              {sourceBars.map(([k, n]) => (
                <BarRow key={k} label={KIND_LABEL[k] ?? k} value={n} max={sourceBars[0][1]} color="#8b5cf6" />
              ))}
            </div>
          </Card>
        </div>

        {/* Top themes */}
        <Card className="p-5">
          <h3 className="text-[15px] font-semibold">Top themes by volume</h3>
          <p className="mb-3 text-[12px] text-muted">Most-mentioned themes</p>
          <div className="flex flex-col gap-2">
            {themeBars.map(([t, n]) => (
              <BarRow key={t} label={t} value={n} max={themeBars[0][1]} color="var(--indigo)" wide />
            ))}
          </div>
          <div className="mt-3 text-[12.5px]"><AiText>{topTheme ? `"${topTheme[0]}" leads with ${topTheme[1]} ${topTheme[1] === 1 ? "mention" : "mentions"}.` : "No themes yet."}</AiText></div>
        </Card>
      </div>
    </div>
  );
}

function WeeklyBars({ weeks }: { weeks: [number, number][] }) {
  if (!weeks.length) return <p className="text-[13px] text-muted">Not enough data yet.</p>;
  const max = Math.max(...weeks.map((w) => w[1]), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: 140 }}>
      {weeks.map(([wk, n]) => (
        <div key={wk} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-end justify-center" style={{ height: 110 }}>
            <div
              className="w-full max-w-[46px] rounded-t-[4px]"
              style={{ height: `${(n / max) * 100}%`, minHeight: 4, background: "var(--indigo)" }}
              title={`${n}`}
            />
          </div>
          <span className="text-[10px] text-muted">
            {new Date(wk).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarRow({ label, value, max, color, wide }: { label: string; value: number; max: number; color: string; wide?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px]">
      <span className={`${wide ? "w-44" : "w-24"} shrink-0 truncate text-muted`}>{label}</span>
      <span className="h-2.5 rounded" style={{ width: `${(value / max) * (wide ? 260 : 150) + 6}px`, background: color }} />
      <b>{value}</b>
    </div>
  );
}
