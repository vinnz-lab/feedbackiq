import Link from "next/link";
import { eq, desc, count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  TypePill,
  SentimentPill,
  type FeedbackType,
  type Sentiment,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = {
  email: "📧",
  recording: "🎙",
  transcript: "🎙",
  spreadsheet: "📊",
  note: "📝",
  paste: "📋",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  processed: { bg: "var(--emerald-soft)", fg: "var(--emerald)", label: "✓ Processed" },
  processing: { bg: "var(--amber-soft)", fg: "var(--amber)", label: "◐ Processing" },
  failed: { bg: "var(--rose-soft)", fg: "var(--rose)", label: "⚠ Failed" },
  queued: { bg: "var(--slate-soft)", fg: "var(--slate)", label: "Queued" },
};

function Chip({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "review" || rawTab === "sources" ? rawTab : "items";
  const db = await getDb();
  const fi = schema.feedbackItems;

  const [{ n: itemsN }] = await db.select({ n: count() }).from(fi).where(eq(fi.reviewStatus, "approved"));
  const [{ n: reviewN }] = await db.select({ n: count() }).from(fi).where(eq(fi.reviewStatus, "needs_review"));
  const [{ n: sourcesN }] = await db.select({ n: count() }).from(schema.sources);

  const tabs = [
    { key: "items", label: `All items · ${itemsN}` },
    { key: "review", label: `Needs review · ${reviewN}` },
    { key: "sources", label: `Sources · ${sourcesN}` },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">Register</h1>
        <p className="mt-1 text-[13px] text-muted">
          {tab === "review"
            ? "Human checkpoint for unattended arrivals and low-confidence AI classifications"
            : tab === "sources"
              ? "Everything ingested — pipeline status and provenance"
              : "Every raw feedback item ingested into Acme App"}
        </p>
      </div>

      <div className="mb-4 inline-flex gap-1 rounded-[10px] border border-border bg-surface p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/register?tab=${t.key}`}
            className={`rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold ${
              tab === t.key ? "bg-indigo text-white" : "text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "items" && <ItemsTab />}
      {tab === "review" && <ReviewTab />}
      {tab === "sources" && <SourcesTab />}
    </div>
  );
}

async function ItemsTab() {
  const db = await getDb();
  const fi = schema.feedbackItems;
  const rows = await db
    .select({
      id: fi.id,
      quote: fi.quote,
      customer: fi.customer,
      submitter: fi.submitter,
      type: fi.type,
      sentiment: fi.sentiment,
      confidence: fi.confidence,
      sourceKind: schema.sources.kind,
      sourceName: schema.sources.filename,
      themeTitle: schema.themes.title,
    })
    .from(fi)
    .leftJoin(schema.sources, eq(fi.sourceId, schema.sources.id))
    .leftJoin(schema.themes, eq(fi.themeId, schema.themes.id))
    .where(eq(fi.reviewStatus, "approved"))
    .orderBy(desc(fi.createdAt));

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-bg text-left">
            <Th>Source</Th>
            <Th>Submitter</Th>
            <Th>Quote</Th>
            <Th>Theme</Th>
            <Th>Sentiment</Th>
            <Th>Type</Th>
            <Th>Conf.</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border align-top hover:bg-hover">
              <Td>
                <span className="whitespace-nowrap text-muted">
                  {KIND_ICON[r.sourceKind ?? ""] ?? "•"} {r.sourceName ?? "—"}
                </span>
              </Td>
              <Td className="whitespace-nowrap">{r.customer ?? r.submitter ?? "—"}</Td>
              <Td className="max-w-[340px]">“{r.quote}”</Td>
              <Td className="whitespace-nowrap font-medium text-indigo">{r.themeTitle ?? "—"}</Td>
              <Td>{r.sentiment && <SentimentPill sentiment={r.sentiment as Sentiment} />}</Td>
              <Td>{r.type && <TypePill type={r.type as FeedbackType} />}</Td>
              <Td className="text-muted">{r.confidence ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function ReviewTab() {
  const db = await getDb();
  const fi = schema.feedbackItems;
  const rows = await db
    .select({
      id: fi.id,
      quote: fi.quote,
      customer: fi.customer,
      submitter: fi.submitter,
      reason: fi.reviewReason,
      type: fi.type,
      sentiment: fi.sentiment,
      confidence: fi.confidence,
      sourceKind: schema.sources.kind,
      sourceName: schema.sources.filename,
      themeTitle: schema.themes.title,
    })
    .from(fi)
    .leftJoin(schema.sources, eq(fi.sourceId, schema.sources.id))
    .leftJoin(schema.themes, eq(fi.themeId, schema.themes.id))
    .where(eq(fi.reviewStatus, "needs_review"))
    .orderBy(desc(fi.createdAt));

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-11 text-center shadow-[var(--shadow)]">
        <div className="text-[16px] font-semibold">All caught up 🎉</div>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
          Items arriving via the forwarding address or auto-connectors, plus low-confidence AI
          classifications, queue here for your confirmation before they count as facts.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow)]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-[var(--radius-pill)] bg-slate-soft px-2 py-0.5 text-[11.5px] text-muted" style={{ background: "var(--slate-soft)" }}>
              {KIND_ICON[r.sourceKind ?? ""] ?? "•"} {r.sourceName ?? "source"}
            </span>
            {(() => {
              const map: Record<string, { bg: string; fg: string; label: string }> = {
                "low confidence": { bg: "var(--amber-soft)", fg: "var(--amber)", label: "◐ Low confidence" },
                "awaiting AI": { bg: "var(--slate-soft)", fg: "var(--slate)", label: "✨ Awaiting AI" },
              };
              const c = map[r.reason ?? ""] ?? { bg: "var(--indigo-soft)", fg: "var(--indigo)", label: "⚡ Arrived unattended" };
              return <Chip bg={c.bg} fg={c.fg}>{c.label}</Chip>;
            })()}
            <span className="ml-auto text-[11.5px] text-muted">Confidence: {r.confidence ?? "—"}</span>
          </div>
          <div className="text-[14px] font-medium">“{r.quote}”</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {r.type || r.sentiment ? (
              <>
                <span className="text-[12px] text-muted">✨ AI suggests:</span>
                {r.type && <TypePill type={r.type as FeedbackType} />}
                {r.sentiment && <SentimentPill sentiment={r.sentiment as Sentiment} />}
                {r.themeTitle && (
                  <span className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}>
                    {r.themeTitle}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[12px] text-muted">Unclassified · awaiting AI analysis (M2)</span>
            )}
            {(r.customer || r.submitter) && (
              <span className="text-[12px] text-muted">· {r.customer ?? r.submitter}</span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <span className="rounded-[var(--radius-btn)] bg-indigo px-3 py-1.5 text-[12px] font-semibold text-white opacity-60">✓ Approve</span>
            <span className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted">✎ Correct</span>
            <span className="ml-auto rounded-[var(--radius-btn)] px-3 py-1.5 text-[12px] font-semibold text-rose">🗑 Discard</span>
          </div>
        </div>
      ))}
      <p className="text-[12px] text-muted">
        Approve / correct / discard become interactive in M1. Nothing here counts in themes,
        dashboards or digests until a human approves it.
      </p>
    </div>
  );
}

async function SourcesTab() {
  const db = await getDb();
  const rows = await db.select().from(schema.sources).orderBy(desc(schema.sources.createdAt));
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-bg text-left">
            <Th>Source</Th>
            <Th>Type</Th>
            <Th>Items</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.queued;
            return (
              <tr key={s.id} className="border-t border-border align-top hover:bg-hover">
                <Td>
                  <b className="font-semibold">{KIND_ICON[s.kind]} {s.filename}</b>
                  {s.autoIngested && (
                    <span className="ml-2 rounded-[4px] bg-indigo px-1.5 py-px text-[9.5px] font-bold text-white">AUTO</span>
                  )}
                  <div className="text-[11.5px] text-muted">{s.note}</div>
                </Td>
                <Td className="text-muted">{s.kind}</Td>
                <Td><b>{s.itemCount}</b></Td>
                <Td><Chip bg={st.bg} fg={st.fg}>{st.label}</Chip></Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
}
