import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeScore } from "@/lib/score";

/**
 * Sample data: a realistic set of feedback for a made-up project-management
 * app, so anyone opening a new workspace can explore every screen at once.
 *
 * Everything it creates is findable again (sources carry meta.sample, and the
 * first one lists the themes and roadmap items it made), so one click removes
 * it all. It can only be loaded into a workspace that has no feedback yet, so
 * it never mixes with real feedback.
 */
export const SAMPLE_PREFIX = "Sample — ";

type T = "Feature" | "Bug" | "UX" | "Question" | "Praise";
type S = "Positive" | "Neutral" | "Negative";
type P = "High" | "Medium" | "Low";
type Item = { q: string; who: string; by?: string; type: T; sent: S; sev: P; daysAgo: number; src: 0 | 1 | 2; speaker?: string; at?: string; row?: string };

const SOURCES = [
  { kind: "spreadsheet" as const, filename: `${SAMPLE_PREFIX}Q3 customer survey.xlsx`, note: "Sample data · survey answers" },
  { kind: "email" as const, filename: `${SAMPLE_PREFIX}customer emails`, note: "Sample data · forwarded emails" },
  { kind: "transcript" as const, filename: `${SAMPLE_PREFIX}customer call with Kestrel Health.vtt`, note: "Sample data · call transcript" },
];

const THEMES: { title: string; summary: string; type: T; sent: S; pri: P; items: Item[] }[] = [
  {
    title: "Slow Board Loading",
    summary: "Large boards take 10–20 seconds to open, especially with filters applied; several teams say it is pushing them back to spreadsheets.",
    type: "Bug", sent: "Negative", pri: "High",
    items: [
      { q: "Our main board with ~800 cards takes almost 20 seconds to load every morning. People have started keeping a spreadsheet instead.", who: "Northwind Traders", by: "Maya Patel", type: "Bug", sent: "Negative", sev: "High", daysAgo: 3, src: 1 },
      { q: "Filtering by assignee freezes the page for a good few seconds.", who: "Brightline Logistics", type: "Bug", sent: "Negative", sev: "High", daysAgo: 6, src: 0, row: "Row 14" },
      { q: "Honestly the only thing stopping us rolling it out to the whole company is how slow the big boards are.", who: "Kestrel Health", type: "Bug", sent: "Negative", sev: "High", daysAgo: 9, src: 2, speaker: "Dr. Alan Reeve", at: "00:04:12" },
      { q: "Switching between boards feels sluggish compared to last year.", who: "Orbit Studio", type: "UX", sent: "Negative", sev: "Medium", daysAgo: 20, src: 0, row: "Row 31" },
    ],
  },
  {
    title: "Export to Excel and CSV",
    summary: "Customers want a proper Excel/CSV export of boards and reports that keeps columns and formatting, for finance and client reporting.",
    type: "Feature", sent: "Neutral", pri: "High",
    items: [
      { q: "We need to send a weekly status sheet to our client. A real Excel export would save us an hour every Friday.", who: "Orbit Studio", by: "Jonas Berg", type: "Feature", sent: "Neutral", sev: "High", daysAgo: 2, src: 1 },
      { q: "CSV export drops the custom fields, which are the bit our finance team actually needs.", who: "Lumen Bank", type: "Bug", sent: "Negative", sev: "High", daysAgo: 8, src: 0, row: "Row 7" },
      { q: "Can you export the timeline to Excel with the dates as real dates rather than text?", who: "Brightline Logistics", type: "Feature", sent: "Neutral", sev: "Medium", daysAgo: 15, src: 0, row: "Row 22" },
    ],
  },
  {
    title: "Guest Access and Permissions",
    summary: "Teams working with contractors and clients want view-only guest access and per-project permissions instead of sharing full accounts.",
    type: "Feature", sent: "Neutral", pri: "High",
    items: [
      { q: "We work with lots of freelancers. Giving them a full seat just so they can see one project isn't workable.", who: "Orbit Studio", type: "Feature", sent: "Neutral", sev: "High", daysAgo: 4, src: 2, speaker: "Priya Shah", at: "00:11:40" },
      { q: "Our compliance team won't approve it until we can restrict who sees which projects.", who: "Lumen Bank", by: "Tom Akers", type: "Feature", sent: "Negative", sev: "High", daysAgo: 11, src: 1 },
      { q: "A read-only link for clients would be perfect.", who: "Pinecrest Schools", type: "Feature", sent: "Positive", sev: "Medium", daysAgo: 25, src: 0, row: "Row 40" },
    ],
  },
  {
    title: "Mobile Notification Overload",
    summary: "The mobile app sends a notification for every small change, so people mute it entirely and then miss the important ones.",
    type: "UX", sent: "Negative", pri: "Medium",
    items: [
      { q: "I get a push notification every time someone moves a card. I've turned them all off, which means I miss the urgent ones.", who: "Kestrel Health", type: "UX", sent: "Negative", sev: "Medium", daysAgo: 5, src: 2, speaker: "Nurse Lead Sam Ortiz", at: "00:17:05" },
      { q: "Please let us choose which notifications we get on the phone.", who: "Pinecrest Schools", type: "Feature", sent: "Neutral", sev: "Medium", daysAgo: 13, src: 0, row: "Row 9" },
      { q: "Daily summary instead of 40 separate notifications, please!", who: "Northwind Traders", type: "Feature", sent: "Neutral", sev: "Low", daysAgo: 22, src: 0, row: "Row 18" },
    ],
  },
  {
    title: "Calendar and Timeline View",
    summary: "Planners like the new timeline but want a calendar view and dependencies between tasks to plan launches.",
    type: "Feature", sent: "Positive", pri: "Medium",
    items: [
      { q: "The new timeline is brilliant. If it showed dependencies between tasks it would replace our Gantt tool.", who: "Brightline Logistics", by: "Elena Ruiz", type: "Feature", sent: "Positive", sev: "Medium", daysAgo: 7, src: 1 },
      { q: "A month calendar view would help our teachers plan term dates.", who: "Pinecrest Schools", type: "Feature", sent: "Neutral", sev: "Low", daysAgo: 18, src: 0, row: "Row 27" },
    ],
  },
  {
    title: "Praise for the New Search",
    summary: "Customers are noticeably happier with search since the last release — faster and finds comments as well as cards.",
    type: "Praise", sent: "Positive", pri: "Low",
    items: [
      { q: "The new search is so much faster, and finding things in comments is a lifesaver.", who: "Northwind Traders", type: "Praise", sent: "Positive", sev: "Low", daysAgo: 1, src: 0, row: "Row 3" },
      { q: "Just wanted to say search is great now. Thank you!", who: "Lumen Bank", type: "Praise", sent: "Positive", sev: "Low", daysAgo: 10, src: 1 },
    ],
  },
];

/** Waiting in Needs review, not yet analysed — so the AI step can be tried. */
const TO_REVIEW: { q: string; who: string; src: 0 | 1 | 2; speaker?: string; at?: string; row?: string }[] = [
  { q: "Is there a dark mode? Late-night planning sessions are hard on the eyes.", who: "Orbit Studio", src: 0, row: "Row 44" },
  { q: "The board with all our open tickets is painfully slow again today, it took about 15 seconds.", who: "Brightline Logistics", src: 1 },
  { q: "We'd love to give our auditors view-only access to one project without paying for a seat.", who: "Lumen Bank", src: 1 },
  { q: "Notifications on my phone are constant. Can I get a digest once a day instead?", who: "Kestrel Health", src: 2, speaker: "Dr. Alan Reeve", at: "00:23:51" },
  { q: "Exporting the report to Excel keeps the numbers as text so formulas don't work.", who: "Northwind Traders", src: 0, row: "Row 46" },
  { q: "Love the new search, it found an old comment I'd been hunting for weeks.", who: "Pinecrest Schools", src: 0, row: "Row 47" },
];

const day = 86_400_000;

export async function hasSampleData(workspaceId: string): Promise<boolean> {
  const db = await getDb();
  const [r] = await db
    .select({ id: schema.sources.id })
    .from(schema.sources)
    .where(and(eq(schema.sources.workspaceId, workspaceId), sql`${schema.sources.meta}->>'sample' = 'true'`))
    .limit(1);
  return Boolean(r);
}

/** True when the workspace has no feedback or sources at all. */
export async function isWorkspaceEmpty(workspaceId: string): Promise<boolean> {
  const db = await getDb();
  const [a] = await db.select({ id: schema.feedbackItems.id }).from(schema.feedbackItems).where(eq(schema.feedbackItems.workspaceId, workspaceId)).limit(1);
  const [b] = await db.select({ id: schema.sources.id }).from(schema.sources).where(eq(schema.sources.workspaceId, workspaceId)).limit(1);
  return !a && !b;
}

export async function loadSampleData(workspaceId: string): Promise<{ items: number; themes: number }> {
  if (!(await isWorkspaceEmpty(workspaceId))) {
    throw new Error("Sample data can only be added to a workspace with no feedback yet, so it never mixes with real feedback.");
  }
  const db = await getDb();
  const now = Date.now();
  let itemCount = 0;
  return db.transaction(async (tx) => {
    const loadedAt = new Date(now).toISOString();
    const srcRows = await tx
      .insert(schema.sources)
      .values(SOURCES.map((s, i) => ({ workspaceId, kind: s.kind, filename: s.filename, status: "processed" as const, note: s.note, meta: { sample: true, loadedAt, primary: i === 0 }, createdAt: new Date(now - (30 - i) * day) })))
      .returning({ id: schema.sources.id });

    const themeIds: string[] = [];
    const enhancementIds: string[] = [];
    for (const [ti, t] of THEMES.entries()) {
      const [theme] = await tx
        .insert(schema.themes)
        .values({ workspaceId, title: t.title, summary: t.summary, type: t.type, sentiment: t.sent, priority: t.pri, createdAt: new Date(now - 28 * day) })
        .returning({ id: schema.themes.id });
      themeIds.push(theme.id);
      const inserted = await tx
        .insert(schema.feedbackItems)
        .values(
          t.items.map((it) => ({
            workspaceId,
            sourceId: srcRows[it.src].id,
            themeId: theme.id,
            quote: it.q,
            customer: it.who,
            submitter: it.by ?? null,
            speaker: it.speaker ?? null,
            timestampLabel: it.at ?? null,
            rowRef: it.row ?? null,
            occurredAt: new Date(now - it.daysAgo * day),
            createdAt: new Date(now - it.daysAgo * day),
            type: it.type,
            sentiment: it.sent,
            severity: it.sev,
            confidence: "High" as const,
            reviewStatus: "approved" as const,
          })),
        )
        .returning({ id: schema.feedbackItems.id });
      itemCount += inserted.length;

      // The two biggest themes are already on the roadmap, so it isn't empty.
      if (ti < 2) {
        const benefit = ti === 0 ? 8 : 7;
        const effort = ti === 0 ? 6 : 4;
        const demand = t.items.length;
        const [enh] = await tx
          .insert(schema.enhancements)
          .values({
            workspaceId,
            themeId: theme.id,
            title: t.title,
            description: t.summary,
            benefit,
            effort,
            demand,
            score: String(computeScore(benefit, effort, demand)),
            status: ti === 0 ? "progress" : "planned",
          })
          .returning({ id: schema.enhancements.id });
        enhancementIds.push(enh.id);
        await tx.insert(schema.evidenceLinks).values(inserted.map((r) => ({ enhancementId: enh.id, feedbackItemId: r.id })));
      }
    }

    const review = await tx
      .insert(schema.feedbackItems)
      .values(
        TO_REVIEW.map((it, i) => ({
          workspaceId,
          sourceId: srcRows[it.src].id,
          quote: it.q,
          customer: it.who,
          speaker: it.speaker ?? null,
          timestampLabel: it.at ?? null,
          rowRef: it.row ?? null,
          createdAt: new Date(now - i * 60_000),
          reviewStatus: "needs_review" as const,
          reviewReason: "awaiting AI",
        })),
      )
      .returning({ id: schema.feedbackItems.id });
    itemCount += review.length;

    // Item counts per source, and what to remove later.
    for (const [i, s] of srcRows.entries()) {
      const n = [...THEMES.flatMap((t) => t.items), ...TO_REVIEW].filter((it) => it.src === i).length;
      await tx
        .update(schema.sources)
        .set({ itemCount: n, meta: { sample: true, loadedAt, primary: i === 0, ...(i === 0 ? { themeIds, enhancementIds } : {}) } })
        .where(and(eq(schema.sources.workspaceId, workspaceId), eq(schema.sources.id, s.id)));
    }
    return { items: itemCount, themes: themeIds.length };
  });
}

/**
 * Removes everything sample data created, plus what grew only out of it since
 * (themes and roadmap items left with no feedback, and digests written after it
 * was loaded). Real feedback added since is never touched.
 */
export async function removeSampleData(workspaceId: string): Promise<{ removed: boolean }> {
  const db = await getDb();
  const s = schema;
  const srcs = await db
    .select()
    .from(s.sources)
    .where(and(eq(s.sources.workspaceId, workspaceId), sql`${s.sources.meta}->>'sample' = 'true'`));
  if (!srcs.length) return { removed: false };
  const meta = (srcs.find((x) => (x.meta as { primary?: boolean })?.primary)?.meta ?? srcs[0].meta) as {
    loadedAt?: string;
    themeIds?: string[];
    enhancementIds?: string[];
  };
  const loadedAt = meta.loadedAt ? new Date(meta.loadedAt) : new Date(Math.min(...srcs.map((x) => x.createdAt.getTime())));
  const sampleThemeIds = meta.themeIds ?? [];

  await db.transaction(async (tx) => {
    if (meta.enhancementIds?.length) {
      await tx.delete(s.enhancements).where(and(eq(s.enhancements.workspaceId, workspaceId), inArray(s.enhancements.id, meta.enhancementIds)));
    }
    // Deleting the sources deletes their feedback (and its evidence links).
    await tx.delete(s.sources).where(and(eq(s.sources.workspaceId, workspaceId), inArray(s.sources.id, srcs.map((x) => x.id))));

    // Themes now left with no feedback: the sample's own, and ones the AI made
    // from sample items after it was loaded. A theme that real feedback has
    // since joined keeps that feedback, so it stays.
    const emptyThemes = await tx
      .select({ id: s.themes.id })
      .from(s.themes)
      .where(
        and(
          eq(s.themes.workspaceId, workspaceId),
          sampleThemeIds.length ? or(inArray(s.themes.id, sampleThemeIds), gte(s.themes.createdAt, loadedAt)) : gte(s.themes.createdAt, loadedAt),
          sql`NOT EXISTS (SELECT 1 FROM feedback_items f WHERE f.theme_id = ${s.themes.id})`,
        ),
      );
    const ids = emptyThemes.map((r) => r.id);
    if (ids.length) {
      await tx.delete(s.enhancements).where(and(eq(s.enhancements.workspaceId, workspaceId), inArray(s.enhancements.themeId, ids)));
      await tx.delete(s.themes).where(and(eq(s.themes.workspaceId, workspaceId), inArray(s.themes.id, ids)));
    }
    // Roadmap items added since that now have no theme and no evidence.
    await tx
      .delete(s.enhancements)
      .where(
        and(
          eq(s.enhancements.workspaceId, workspaceId),
          isNull(s.enhancements.themeId),
          gte(s.enhancements.createdAt, loadedAt),
          sql`NOT EXISTS (SELECT 1 FROM evidence_links l WHERE l.enhancement_id = ${s.enhancements.id})`,
        ),
      );
    // Digests written while sample data was in, which describe it.
    await tx.delete(s.digests).where(and(eq(s.digests.workspaceId, workspaceId), gte(s.digests.createdAt, loadedAt)));
  });
  return { removed: true };
}
