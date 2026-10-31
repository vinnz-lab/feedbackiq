/**
 * Adds a SECOND, separate workspace for the isolation tests: its own tenant,
 * one owner ("Tess Tester") who belongs ONLY to it, and recognisable data
 * (every string contains "ZEBRA") so a leak is easy to spot.
 *
 * Jamie (the demo owner) is deliberately NOT a member: the platform owner must
 * not be able to see a tester's workspace.
 *
 * Run after db-setup: PGLITE_DIR=./.pglite-test npx tsx scripts/seed-second-workspace.ts
 */
async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const db = await getDb();
  const [tenant] = await db.insert(schema.tenants).values({ name: "ZEBRA Tester Co" }).returning();
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ tenantId: tenant.id, name: "ZEBRA Space", description: "Tester workspace" })
    .returning();
  const [tess] = await db
    .insert(schema.users)
    .values({ tenantId: tenant.id, email: "tess@zebra.test", name: "Tess Tester", role: "owner" })
    .returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId: tess.id, role: "owner" });

  const [src] = await db
    .insert(schema.sources)
    .values({ workspaceId: ws.id, kind: "spreadsheet", filename: "zebra-b.csv", status: "processed" })
    .returning();
  const [theme] = await db
    .insert(schema.themes)
    .values({ workspaceId: ws.id, title: "ZEBRA crossing export", summary: "ZEBRA summary text" })
    .returning();
  for (let i = 1; i <= 3; i++) {
    await db.insert(schema.feedbackItems).values({
      workspaceId: ws.id, sourceId: src.id, themeId: theme.id, quote: `ZEBRA-B approved quote ${i}`,
      type: "Bug", sentiment: "Negative", severity: "High", confidence: "High", reviewStatus: "approved",
      customer: "ZEBRA Customer Ltd",
    });
  }
  await db.insert(schema.feedbackItems).values({
    workspaceId: ws.id, sourceId: src.id, themeId: theme.id, quote: "ZEBRA-B pending quote",
    type: "Feature", sentiment: "Neutral", severity: "Medium", confidence: "High", reviewStatus: "needs_review",
  });
  await db.insert(schema.enhancements).values({
    workspaceId: ws.id, themeId: theme.id, title: "ZEBRA crossing export", status: "planned", benefit: 6, effort: 4, demand: 3,
  });
  await db.insert(schema.digests).values({
    workspaceId: ws.id, periodStart: new Date(), periodEnd: new Date(),
    content: { headline: "ZEBRA digest headline", summary: "ZEBRA digest body", themes: [], quotes: [], roadmap: {} },
  });
  console.log(JSON.stringify({ workspaceId: ws.id, themeId: theme.id, userId: tess.id }));
}
main().then(() => process.exit(0));
