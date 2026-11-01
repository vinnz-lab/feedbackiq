/**
 * Builds the demo data the Getting Started PDF is photographed from:
 *  - "Northstar PM" (owner Alex Morgan) with the standard sample data and a digest;
 *  - an empty workspace (owner Sam Lee) to show the guide on day one.
 * Run after db-setup against a throwaway database: PGLITE_DIR=./.pglite-guide npx tsx scripts/guide/seed-guide.ts
 */
(async () => {
  const { getDb, schema } = await import("../../src/db/index.ts");
  const { loadSampleData } = await import("../../src/lib/sample-data.ts");
  const db = await getDb();
  const [tenant] = await db.insert(schema.tenants).values({ name: "Northstar" }).returning();
  const [ws] = await db.insert(schema.workspaces).values({ tenantId: tenant.id, name: "Northstar PM", description: "Project-management app" }).returning();
  const [alex] = await db.insert(schema.users).values({ tenantId: tenant.id, email: "alex@northstar.example", name: "Alex Morgan", role: "owner" }).returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId: alex.id, role: "owner" });
  await loadSampleData(ws.id);
  await db.insert(schema.digests).values({
    workspaceId: ws.id,
    periodStart: new Date(Date.now() - 7 * 86400000),
    periodEnd: new Date(),
    content: {
      headline: "Slow boards are now the biggest risk to company-wide rollouts",
      summary: "Board performance is the most-raised and most negative theme this month, with two customers saying it blocks wider adoption. Export and guest access requests remain strong, while the new search is earning clear praise.",
      sections: [
        { heading: "Top themes", items: ["Slow Board Loading — 4 mentions, mostly negative, high severity", "Export to Excel and CSV — 3 mentions, finance and client reporting", "Guest Access and Permissions — 3 mentions, compliance-driven"] },
        { heading: "Emerging & movers", items: ["Mobile notification overload is rising — people mute the app and miss urgent updates", "Praise for the new search keeps growing"] },
        { heading: "What to prioritise next", items: ["Finish the large-board performance work already in progress", "Scope Excel/CSV export that keeps custom fields", "Explore view-only guest access for contractors and auditors"] },
      ],
      quotes: [
        { text: "Honestly the only thing stopping us rolling it out to the whole company is how slow the big boards are.", by: "Kestrel Health" },
        { text: "The new search is so much faster, and finding things in comments is a lifesaver.", by: "Northwind Traders" },
      ],
      roadmap: { review: 0, planned: 1, progress: 1, shipped: 0 },
    },
  });
  // A finished audio briefing to photograph (short placeholder audio; the script is what's shown).
  const { encodeMp3 } = await import("../../src/lib/audio.ts");
  const themes = await db.select().from(schema.themes).where((await import("drizzle-orm")).eq(schema.themes.workspaceId, ws.id));
  const pick = ["Slow Board Loading", "Export to Excel and CSV", "Guest Access and Permissions"].map((t) => themes.find((x) => x.title === t)!);
  const tone = new Int16Array(24000 * 3);
  for (let i = 0; i < tone.length; i++) tone[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / 24000) * 3000);
  const mp3 = await encodeMp3({ samples: tone, rate: 24000 });
  const turns = [
    ["Ava", "Welcome to your Insight Hub audio briefing. Quick note before we start: we're AI voices, and everything we cover comes from your team's approved customer feedback. Today: slow boards, exports, and guest access."],
    ["Leo", "Let's start with the big one. Slow board loading has four mentions, and every one of them is negative."],
    ["Ava", "And it's not just annoying. K. H. said the only thing stopping them rolling it out to the whole company is how slow the big boards are."],
    ["Leo", "That's a growth problem, not just a bug. The good news is it's already in progress on the roadmap."],
    ["Ava", "Next, export to Excel and CSV. Three mentions, mostly from people who report to finance or to clients."],
    ["Leo", "One customer said a real Excel export would save them an hour every Friday. And the CSV export currently drops custom fields."],
    ["Ava", "It's planned, so the question is whether keeping custom fields is in scope."],
    ["Leo", "Then guest access. Three mentions, driven by freelancers and compliance teams who want view-only access to a single project."],
    ["Ava", "Quick recap: finish the board speed work, make sure exports keep custom fields, and look at view-only guest access next."],
    ["Leo", "That's your briefing. Thanks for listening."],
  ].map(([speaker, text]) => ({ speaker, text }));
  const [brief] = await db.insert(schema.audioBriefings).values({
    workspaceId: ws.id,
    title: "Slow boards, exports and guest access",
    themeIds: pick.map((t) => t.id),
    themeTitles: pick.map((t) => t.title),
    nameMode: "mask",
    status: "ready",
    script: { title: "Slow boards, exports and guest access", turns },
    hasAudio: true,
    durationSec: 272,
    sizeBytes: 1_640_000,
    voiceSource: "platform",
    createdBy: alex.id,
    expiresAt: new Date(Date.now() + 30 * 86400000),
  }).returning();
  await db.insert(schema.audioFiles).values({ briefingId: brief.id, workspaceId: ws.id, mp3 });

  const [ws2] = await db.insert(schema.workspaces).values({ tenantId: tenant.id, name: "My workspace", description: "" }).returning();
  const [sam] = await db.insert(schema.users).values({ tenantId: tenant.id, email: "sam@northstar.example", name: "Sam Lee", role: "owner" }).returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws2.id, userId: sam.id, role: "owner" });
  process.exit(0);
})();
