import Link from "next/link";
import { and, eq, desc, count } from "drizzle-orm";
import { currentWorkspaceId } from "@/lib/workspace";
import { getDb, schema } from "@/db";
import {
  TypePill,
  SentimentPill,
  type FeedbackType,
  type Sentiment,
} from "@/components/ui";
import { RunAiButton } from "@/components/run-ai-button";
import { getWorkspaceInfo } from "@/lib/workspace-info";
import { ExpandableQuote } from "@/components/expandable-quote";
import { ReviewQueue } from "@/components/review-queue";
import { CheckTranscriptionsButton } from "@/components/check-transcriptions-button";
import type { ReviewItem } from "@/components/review-card";

export const dynamic = "force-dynamic";
// Server Action timeout is set at the page level; AI batches are paced and
// can run for minutes. 300s is the Vercel Hobby ceiling.
export const maxDuration = 300;

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
  const info = await getWorkspaceInfo();
  const tab = rawTab === "review" || rawTab === "sources" ? rawTab : "items";
  const db = await getDb();
  const fi = schema.feedbackItems;

  const wsId = await currentWorkspaceId();
  const [{ n: itemsN }] = await db.select({ n: count() }).from(fi).where(and(eq(fi.workspaceId, wsId), eq(fi.reviewStatus, "approved")));
  const [{ n: reviewN }] = await db.select({ n: count() }).from(fi).where(and(eq(fi.workspaceId, wsId), eq(fi.reviewStatus, "needs_review")));
  const [{ n: sourcesN }] = await db.select({ n: count() }).from(schema.sources).where(eq(schema.sources.workspaceId, wsId));

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
              : `Every raw feedback item ingested into ${info.workspaceName}`}
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
  const wsId = await currentWorkspaceId();
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
      speaker: fi.speaker,
      timestampLabel: fi.timestampLabel,
      rowRef: fi.rowRef,
      sourceKind: schema.sources.kind,
      sourceName: schema.sources.filename,
      themeTitle: schema.themes.title,
    })
    .from(fi)
    .leftJoin(schema.sources, eq(fi.sourceId, schema.sources.id))
    .leftJoin(schema.themes, eq(fi.themeId, schema.themes.id))
    .where(and(eq(fi.workspaceId, wsId), eq(fi.reviewStatus, "approved")))
    .orderBy(desc(fi.createdAt));

  const unanalysed = rows.filter((r) => !r.type).length;

  return (
    <>
      {unanalysed > 0 && (
        <div className="mb-3 rounded-[10px] border border-border bg-surface px-3.5 py-3 shadow-[var(--shadow)]">
          <p className="mb-2 text-[12.5px] text-muted">
            {unanalysed} approved item{unanalysed === 1 ? " has" : "s have"} no theme yet, because AI
            analysis hasn&apos;t run on {unanalysed === 1 ? "it" : "them"}. They won&apos;t appear on
            the Themes page until it does.
          </p>
          <RunAiButton count={unanalysed} />
        </div>
      )}
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-bg text-left">
            <Th>Source</Th><Th>Submitter</Th><Th>Quote</Th><Th>Theme</Th><Th>Sentiment</Th><Th>Type</Th><Th>Conf.</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border align-top hover:bg-hover">
              <Td>
                <span className="whitespace-nowrap text-muted">{KIND_ICON[r.sourceKind ?? ""] ?? "•"} {r.sourceName ?? "—"}</span>
                {/* Where inside the source this came from — the citation trail. */}
                {(r.speaker || r.timestampLabel || r.rowRef) && (
                  <div className="whitespace-nowrap font-mono text-[10.5px] text-indigo">
                    {[r.speaker, r.timestampLabel, r.rowRef].filter(Boolean).join(" · ")}
                  </div>
                )}
              </Td>
              <Td className="whitespace-nowrap">{r.customer ?? r.submitter ?? "—"}</Td>
              <Td className="max-w-[340px]"><ExpandableQuote quote={r.quote} /></Td>
              <Td className="whitespace-nowrap font-medium text-indigo">{r.themeTitle ?? "—"}</Td>
              <Td>{r.sentiment && <SentimentPill sentiment={r.sentiment as Sentiment} />}</Td>
              <Td>{r.type && <TypePill type={r.type as FeedbackType} />}</Td>
              <Td className="text-muted">{r.confidence ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

async function ReviewTab() {
  const wsId = await currentWorkspaceId();
  const db = await getDb();
  const fi = schema.feedbackItems;
  const rows = await db
    .select({
      id: fi.id,
      quote: fi.quote,
      customer: fi.customer,
      submitter: fi.submitter,
      speaker: fi.speaker,
      timestampLabel: fi.timestampLabel,
      rowRef: fi.rowRef,
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
    .where(and(eq(fi.workspaceId, wsId), eq(fi.reviewStatus, "needs_review")))
    .orderBy(desc(fi.createdAt));

  const themeList = await db
    .select({ id: schema.themes.id, title: schema.themes.title })
    .from(schema.themes)
    .where(eq(schema.themes.workspaceId, wsId))
    .orderBy(schema.themes.title);

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

  const unclassified = rows.filter((r) => !r.type).length;
  const items: ReviewItem[] = rows.map((r) => ({
    id: r.id,
    quote: r.quote,
    sourceIcon: KIND_ICON[r.sourceKind ?? ""] ?? "•",
    sourceName: r.sourceName,
    reason: r.reason,
    type: r.type,
    sentiment: r.sentiment,
    confidence: r.confidence,
    themeTitle: r.themeTitle,
    who: r.customer ?? r.submitter,
    speaker: r.speaker,
    timestampLabel: r.timestampLabel,
    rowRef: r.rowRef,
  }));

  return <ReviewQueue items={items} themes={themeList} unclassified={unclassified} />;
}

async function SourcesTab() {
  const wsId = await currentWorkspaceId();
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.workspaceId, wsId))
    .orderBy(desc(schema.sources.createdAt));
  // Only rows with a real transcription job behind them are worth polling —
  // seeded demo rows sit on "processing" with no job id.
  const pendingTranscriptions = rows.filter(
    (s) => s.status === "processing" && (s.meta as { assemblyId?: string } | null)?.assemblyId,
  ).length;

  return (
    <>
    <CheckTranscriptionsButton pending={pendingTranscriptions} />
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-bg text-left">
            <Th>Source</Th><Th>Type</Th><Th>Items</Th><Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.queued;
            return (
              <tr key={s.id} className="border-t border-border align-top hover:bg-hover">
                <Td>
                  <b className="font-semibold">{KIND_ICON[s.kind]} {s.filename}</b>
                  {s.autoIngested && (<span className="ml-2 rounded-[4px] bg-indigo px-1.5 py-px text-[9.5px] font-bold text-white">AUTO</span>)}
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
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
}
