/**
 * Verifies which items the AI run treats as "work to do".
 *
 * Regression guard: a long transcript that had already been (badly) classified
 * on its first 2000 characters was permanently excluded from splitting, because
 * the query only looked for type IS NULL. Long sources must stay eligible.
 *
 * Run: PGLITE_DIR=./.pglite-test npx tsx scripts/split-query-test.ts
 */
async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { SPLIT_THRESHOLD_CHARS } = await import("../src/lib/ai/extract.ts");
  const { and, eq, isNull, or, sql, inArray } = await import("drizzle-orm");
  const db = await getDb();

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

  const [ws] = await db.select().from(schema.workspaces).limit(1);
  const [src] = await db
    .insert(schema.sources)
    .values({ workspaceId: ws.id, kind: "transcript", filename: "split-query-test.txt", status: "processed" })
    .returning();

  const longQuote = "Speaker: " + "the dashboard is far too slow when we filter by quarter. ".repeat(60);
  const shortQuote = "Please add dark mode.";

  const inserted = await db
    .insert(schema.feedbackItems)
    .values([
      // (a) long AND already classified — the case that was being skipped
      { workspaceId: ws.id, sourceId: src.id, quote: longQuote, type: "Bug", sentiment: "Negative", reviewStatus: "needs_review" as const },
      // (b) long and unclassified
      { workspaceId: ws.id, sourceId: src.id, quote: longQuote + " variant b", reviewStatus: "needs_review" as const },
      // (c) short and unclassified
      { workspaceId: ws.id, sourceId: src.id, quote: shortQuote, reviewStatus: "needs_review" as const },
      // (d) short and already classified — genuinely done, must be skipped
      { workspaceId: ws.id, sourceId: src.id, quote: "Export is great.", type: "Praise", sentiment: "Positive", reviewStatus: "needs_review" as const },
      // (e) long but already approved — not in the review queue, must be skipped
      { workspaceId: ws.id, sourceId: src.id, quote: longQuote + " variant e", reviewStatus: "approved" as const },
    ])
    .returning({ id: schema.feedbackItems.id, quote: schema.feedbackItems.quote });

  const ids = inserted.map((i) => i.id);
  const byQuote = (q: string) => inserted.find((i) => i.quote === q)!.id;

  // The exact predicate used by runAiAnalysis.
  const needsWork = and(
    eq(schema.feedbackItems.reviewStatus, "needs_review"),
    or(
      isNull(schema.feedbackItems.type),
      sql`length(${schema.feedbackItems.quote}) > ${SPLIT_THRESHOLD_CHARS}`,
    ),
  );

  const picked = await db
    .select({ id: schema.feedbackItems.id, quote: schema.feedbackItems.quote })
    .from(schema.feedbackItems)
    .where(and(needsWork, inArray(schema.feedbackItems.id, ids)));

  const pickedIds = new Set(picked.map((p) => p.id));

  check("long + already classified IS picked up (the bug)", pickedIds.has(byQuote(longQuote)));
  check("long + unclassified is picked up", pickedIds.has(byQuote(longQuote + " variant b")));
  check("short + unclassified is picked up", pickedIds.has(byQuote(shortQuote)));
  check("short + classified is skipped", !pickedIds.has(byQuote("Export is great.")));
  check("approved item is skipped", !pickedIds.has(byQuote(longQuote + " variant e")));

  // And the split/classify routing within those picked.
  const longPicked = picked.filter((p) => p.quote.length > SPLIT_THRESHOLD_CHARS);
  const shortPicked = picked.filter((p) => p.quote.length <= SPLIT_THRESHOLD_CHARS);
  check("routes 2 long items to the splitter", longPicked.length === 2, `${longPicked.length}`);
  check("routes 1 short item to the classifier", shortPicked.length === 1, `${shortPicked.length}`);

  // Clean up so the local DB stays usable for other tests.
  await db.delete(schema.feedbackItems).where(inArray(schema.feedbackItems.id, ids));
  await db.delete(schema.sources).where(eq(schema.sources.id, src.id));

  console.log("\nPASS:");
  pass.forEach((p) => console.log("  ✓ " + p));
  if (fail.length) {
    console.log("\nFAIL:");
    fail.forEach((f) => console.log("  ✗ " + f));
  }
  console.log(`\n${pass.length}/${pass.length + fail.length} checks passed`);
  process.exit(fail.length ? 1 : 0);
}
main();
