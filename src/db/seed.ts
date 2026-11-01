import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

type DB = PgliteDatabase<typeof schema>;

/**
 * Idempotent seed — clears everything (cascade from tenant) then inserts a rich
 * sample so the app feels alive. Mirrors the v0.4 prototype data.
 */
export async function seed(db: DB) {
  await db.delete(schema.tenants); // cascades to all workspace-scoped rows

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: "Acme Group" })
    .returning();

  const [ws] = await db
    .insert(schema.workspaces)
    .values({
      tenantId: tenant.id,
      name: "Acme App",
      description: "Customer platform",
      forwardingAddress: "feedback@acme.app",
    })
    .returning();
  const wsId = ws.id;

  const seededUsers = await db.insert(schema.users).values([
    { tenantId: tenant.id, email: "jamie@acme.test", name: "Jamie Lee", role: "owner" },
    { tenantId: tenant.id, email: "tom@acme.test", name: "Tom Becker", role: "contributor" },
    { tenantId: tenant.id, email: "riya@acme.test", name: "Riya Shah", role: "executive" },
    { tenantId: tenant.id, email: "ana@acme.test", name: "Ana Costa", role: "engineer" },
    { tenantId: tenant.id, email: "vera@acme.test", name: "Vera Viewer", role: "viewer" },
  ]).returning();
  // Access is granted by membership, not by belonging to the tenant.
  await db.insert(schema.workspaceMembers).values(
    seededUsers.map((u) => ({ workspaceId: wsId, userId: u.id, role: u.role })),
  );

  // Product areas (taxonomy)
  const areaNames = [
    "Reporting", "Performance", "Permissions", "Notifications",
    "Planning", "UI & theming", "Search", "Billing", "Onboarding",
  ];
  const areas = await db
    .insert(schema.productAreas)
    .values(areaNames.map((name) => ({ workspaceId: wsId, name })))
    .returning();
  const area = (n: string) => areas.find((a) => a.name === n)?.id ?? null;

  // Sources
  const sourceRows = await db
    .insert(schema.sources)
    .values([
      { workspaceId: wsId, kind: "recording", filename: "customer_call_jul21.mp4", status: "processed", itemCount: 3, note: "41 min · 2 speakers identified" },
      { workspaceId: wsId, kind: "email", filename: "email_from_northwind.msg", status: "processed", itemCount: 2, note: "sender allow-listed" },
      { workspaceId: wsId, kind: "transcript", filename: "qbr_skyline_transcript.vtt", status: "processed", itemCount: 2, note: "speaker labels preserved" },
      { workspaceId: wsId, kind: "spreadsheet", filename: "q2_survey_results.xlsx", status: "processed", itemCount: 38, note: "38/41 rows · 3 skipped (empty)" },
      { workspaceId: wsId, kind: "email", filename: "RE: export formatting — Northwind", status: "processed", autoIngested: true, itemCount: 1, note: "via feedback@acme.app" },
      { workspaceId: wsId, kind: "note", filename: "broken_upload.docx", status: "failed", itemCount: 0, note: "Unsupported encoding" },
      { workspaceId: wsId, kind: "recording", filename: "weekly_sync_jul22.m4a", status: "processing", itemCount: 0, note: "Transcribing + diarizing" },
    ])
    .returning();
  const src = (f: string) => sourceRows.find((s) => s.filename.startsWith(f.slice(0, 12)))?.id ?? null;

  // Themes
  const themeSeed: {
    title: string; type: schema.FeedbackTypeT; sentiment: schema.SentimentT;
    priority: schema.PriorityT; delta: number; emerging?: boolean; summary: string;
  }[] = [
    { title: "Slow dashboard loading", type: "Bug", sentiment: "Negative", priority: "High", delta: 32, summary: "Users report 15–25s dashboard loads on quarter-filtered views. Two accounts say their teams have stopped using it." },
    { title: "Export to Excel", type: "Feature", sentiment: "Neutral", priority: "Medium", delta: 18, summary: "Consistent demand for native .xlsx/CSV export of dashboards — copy-paste workflows destroy formatting at month-end." },
    { title: "Dashboard UX confusing", type: "UX", sentiment: "Negative", priority: "Medium", delta: -11, summary: "New users cannot find key views; totals and filters are misread. Confusion clusters around the analytics area." },
    { title: "Praise: new timeline view", type: "Praise", sentiment: "Positive", priority: "Low", delta: 40, summary: "Unprompted praise for the timeline view — “saves our PM hours each week”. Strong candidate for the changelog." },
    { title: "Granular permissions & roles", type: "Feature", sentiment: "Neutral", priority: "High", delta: 25, summary: "Enterprise accounts want view-only contractor seats, per-project guests and admin-configurable roles." },
    { title: "Notification overload", type: "UX", sentiment: "Negative", priority: "Medium", delta: -8, summary: "Default alerts fire on every minor change. Users want per-project and per-event preferences plus a daily summary." },
    { title: "API rate limits", type: "Bug", sentiment: "Negative", priority: "High", delta: 66, emerging: true, summary: "Integration partners hit 429s during nightly syncs — the fastest-accelerating negative theme this month." },
    { title: "Search results relevance", type: "UX", sentiment: "Neutral", priority: "Medium", delta: 15, summary: "Search misses archived projects and attachment contents; users work around with manual tags." },
  ];
  const themes = await db
    .insert(schema.themes)
    .values(themeSeed.map((t) => ({
      workspaceId: wsId, title: t.title, type: t.type, sentiment: t.sentiment,
      priority: t.priority, deltaPct: t.delta, isEmerging: t.emerging ?? false, summary: t.summary,
    })))
    .returning();
  const theme = (title: string) => themes.find((t) => t.title === title)?.id ?? null;

  // Feedback items (approved) — distributed across themes with provenance
  type It = {
    theme: string; src: string; quote: string; customer?: string; submitter?: string;
    speaker?: string; ts?: string; row?: string; type: schema.FeedbackTypeT;
    sentiment: schema.SentimentT; severity: schema.PriorityT; confidence: schema.ConfidenceT; areaName?: string;
  };
  const items: It[] = [
    { theme: "Slow dashboard loading", src: "customer_call", quote: "The dashboard takes maybe twenty seconds to load when we filter by quarter — my team just gave up using it.", customer: "Skyline Ltd", speaker: "M. Torres", ts: "00:14:32", type: "Bug", sentiment: "Negative", severity: "High", confidence: "High", areaName: "Performance" },
    { theme: "Slow dashboard loading", src: "q2_survey", quote: "Dashboard timeouts weekly for our 40-seat account.", customer: "Northwind", row: "row 23", type: "Bug", sentiment: "Negative", severity: "High", confidence: "Medium", areaName: "Performance" },
    { theme: "Slow dashboard loading", src: "email_from", quote: "Honestly it is fine on small ranges, it is the quarter view that dies.", customer: "Skyline Ltd", submitter: "R. Patel", type: "UX", sentiment: "Neutral", severity: "Medium", confidence: "Medium", areaName: "Performance" },
    { theme: "Export to Excel", src: "email_from", quote: "Please add a real Export to Excel button — copy-pasting into a sheet destroys our column formatting every single time.", customer: "Northwind", submitter: "J. Rivera", type: "Feature", sentiment: "Negative", severity: "High", confidence: "High", areaName: "Reporting" },
    { theme: "Export to Excel", src: "qbr_skyline", quote: "The team spends 20 minutes a day reformatting exported data. A native xlsx export would be a lifesaver.", customer: "Skyline Ltd", speaker: "Ops team", ts: "00:12:40", type: "Feature", sentiment: "Neutral", severity: "Medium", confidence: "High", areaName: "Reporting" },
    { theme: "Export to Excel", src: "q2_survey", quote: "Need raw CSV of the utilisation table.", customer: "Globex", row: "row 7", type: "Feature", sentiment: "Neutral", severity: "Low", confidence: "Medium", areaName: "Reporting" },
    { theme: "Dashboard UX confusing", src: "q2_survey", quote: "Dashboard is confusing, I can never find the saved views.", customer: "Initech", row: "row 17", type: "UX", sentiment: "Negative", severity: "Medium", confidence: "Medium", areaName: "UI & theming" },
    { theme: "Praise: new timeline view", src: "email_from", quote: "The new timeline view is fantastic — it saves our PM a couple of hours every single week.", customer: "Northwind", submitter: "PMO", type: "Praise", sentiment: "Positive", severity: "Low", confidence: "High", areaName: "Planning" },
    { theme: "Granular permissions & roles", src: "q2_survey", quote: "Customer wants view-only access for external contractors without a full licence.", customer: "Initech", row: "row 18", type: "Feature", sentiment: "Neutral", severity: "Medium", confidence: "High", areaName: "Permissions" },
    { theme: "Granular permissions & roles", src: "qbr_skyline", quote: "Security team needs role scoping before we can expand seats.", customer: "Initech", speaker: "IT lead", ts: "00:31:02", type: "Feature", sentiment: "Neutral", severity: "High", confidence: "Medium", areaName: "Permissions" },
    { theme: "Notification overload", src: "qbr_skyline", quote: "Push notifications are way too noisy — I get pinged for every tiny change anyone makes.", customer: "Skyline Ltd", speaker: "D. Wolf", ts: "00:23:11", type: "UX", sentiment: "Negative", severity: "Medium", confidence: "High", areaName: "Notifications" },
    { theme: "Notification overload", src: "email_from", quote: "Can I mute project-level noise but keep mentions?", customer: "Globex", submitter: "A. Reyes", type: "Feature", sentiment: "Neutral", severity: "Low", confidence: "Medium", areaName: "Notifications" },
    { theme: "API rate limits", src: "email_from", quote: "Nightly sync fails at 2am with rate-limit errors — we retry for an hour.", customer: "Umbrella", submitter: "Integration eng", type: "Bug", sentiment: "Negative", severity: "High", confidence: "High", areaName: "Performance" },
    { theme: "API rate limits", src: "customer_call", quote: "API limits block our reporting pull every Monday.", customer: "Umbrella", speaker: "Support", ts: "00:19:05", type: "Bug", sentiment: "Negative", severity: "High", confidence: "High", areaName: "Performance" },
    { theme: "Search results relevance", src: "customer_call", quote: "Search cannot find archived projects at all — took us twenty minutes to locate last year’s audit.", customer: "Skyline Ltd", speaker: "M. Torres", ts: "00:19:05", type: "UX", sentiment: "Negative", severity: "Medium", confidence: "Medium", areaName: "Search" },
    { theme: "Search results relevance", src: "email_from", quote: "Would love search inside attachments.", customer: "Northwind", submitter: "Analyst", type: "Feature", sentiment: "Neutral", severity: "Low", confidence: "Medium", areaName: "Search" },
  ];
  await db.insert(schema.feedbackItems).values(
    items.map((it) => ({
      workspaceId: wsId, themeId: theme(it.theme), sourceId: src(it.src),
      quote: it.quote, customer: it.customer, submitter: it.submitter,
      speaker: it.speaker, timestampLabel: it.ts, rowRef: it.row,
      type: it.type, sentiment: it.sentiment, severity: it.severity,
      confidence: it.confidence, productAreaId: it.areaName ? area(it.areaName) : null,
      reviewStatus: "approved" as const, demandCount: 1,
    })),
  );

  // Needs-review queue (unattended arrivals + low confidence)
  await db.insert(schema.feedbackItems).values([
    { workspaceId: wsId, sourceId: src("RE: export"), quote: "Your invoice PDFs render with broken fonts in Windows preview.", customer: "Northwind", submitter: "billing ops", type: "Bug", sentiment: "Negative", severity: "Medium", confidence: "Medium", reviewStatus: "needs_review", reviewReason: "arrived unattended" },
    { workspaceId: wsId, sourceId: src("RE: export"), quote: "Can you support SSO for our external auditors?", customer: "Initech", submitter: "IT lead", type: "Feature", sentiment: "Neutral", severity: "High", confidence: "High", reviewStatus: "needs_review", reviewReason: "arrived unattended", themeId: theme("Granular permissions & roles") },
    { workspaceId: wsId, sourceId: src("qbr_skyline"), quote: "The numbers feel off sometimes… but maybe it is how we set it up.", customer: "Skyline Ltd", speaker: "QBR", type: "Question", sentiment: "Neutral", severity: "Low", confidence: "Low", reviewStatus: "needs_review", reviewReason: "low confidence", themeId: theme("Dashboard UX confusing") },
  ]);

  // Enhancements
  const enh = await db
    .insert(schema.enhancements)
    .values([
      { workspaceId: wsId, themeId: theme("Export to Excel"), title: "Excel & CSV export for dashboards", benefit: 9, effort: 4, demand: 12, score: "8.7", status: "planned" },
      { workspaceId: wsId, themeId: theme("Slow dashboard loading"), title: "Dashboard performance overhaul", benefit: 9, effort: 7, demand: 14, score: "7.9", status: "progress", jiraKey: "ACME-231" },
      { workspaceId: wsId, themeId: theme("Granular permissions & roles"), title: "View-only contractor role", benefit: 7, effort: 5, demand: 6, score: "6.4", status: "review" },
      { workspaceId: wsId, themeId: theme("Notification overload"), title: "Notification preferences centre", benefit: 6, effort: 4, demand: 6, score: "5.8", status: "review" },
      { workspaceId: wsId, themeId: theme("API rate limits"), title: "API rate-limit tiering", benefit: 7, effort: 6, demand: 5, score: "6.9", status: "review" },
      { workspaceId: wsId, themeId: theme("Praise: new timeline view"), title: "Timeline view improvements", benefit: 8, effort: 3, demand: 8, score: "7.1", status: "shipped", jiraKey: "ACME-198" },
    ])
    .returning();

  await db.insert(schema.trackerConnections).values({
    workspaceId: wsId, provider: "jira", projectKey: "ACME", issueType: "Story",
  });

  await db.insert(schema.aiConfigs).values({
    workspaceId: wsId,
    scoringWeights: { demand: 0.4, sentiment: 0.2, benefit: 0.3, effort: 0.1 },
    taggingPrompt: "Classify each feedback item by type (Feature/Bug/UX/Question/Praise), product area, severity and sentiment.",
    summaryPrompt: "Summarise the theme in two sentences, citing verbatim quotes. Never invent detail.",
    rules: ["Treat mentions of 'invoice' or 'billing' as the Billing area", "Escalate anything from an enterprise account to High severity"],
  });

  return { tenantId: tenant.id, workspaceId: wsId, themes: themes.length, items: items.length, enhancements: enh.length };
}
