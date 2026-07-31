/**
 * Adds unclassified needs-review items straight to the DB for testing the AI
 * batch run.
 *
 * Why not just POST /api/ingest? In local dev the DB is PGlite (in-process).
 * The route handler and the page each hold their own PGlite instance over the
 * same directory, so writes made through the API aren't visible to the page.
 * That's a dev-only artifact — production uses a shared Postgres over
 * DATABASE_URL, where ingest → UI works fine.
 *
 * Run: PGLITE_DIR=./.pglite-test npx tsx scripts/seed-unclassified.ts [count]
 */
async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const db = await getDb();
  const n = Number(process.argv[2]) || 8;

  const [ws] = await db.select().from(schema.workspaces).limit(1);
  if (!ws) throw new Error("No workspace — run scripts/db-setup.ts first");

  const [src] = await db
    .insert(schema.sources)
    .values({
      workspaceId: ws.id,
      kind: "paste",
      filename: "test-batch.txt",
      status: "processed",
      itemCount: n,
      autoIngested: false,
    })
    .returning();

  const quotes = [
    "Export to CSV silently drops the last column.",
    "Please add dark mode to the reporting screen.",
    "Login takes 30 seconds every morning.",
    "The new filters are genuinely excellent.",
    "Can we get SSO with Okta?",
    "Charts render off-centre on a 4K monitor.",
    "Bulk edit would save us hours each week.",
    "The mobile app crashes when I rotate the screen.",
    "Weekly email digests arrive twice.",
    "Search ignores hyphenated product codes.",
  ];

  await db.insert(schema.feedbackItems).values(
    Array.from({ length: n }, (_, i) => ({
      workspaceId: ws.id,
      sourceId: src.id,
      quote: quotes[i % quotes.length],
      customer: `Test Co ${i + 1}`,
      reviewStatus: "needs_review" as const,
      reviewReason: "awaiting AI",
    })),
  );

  console.log(`RESULT seeded ${n} unclassified needs-review items`);
}
main();
