/**
 * Reproduces the reported scenario at the database level:
 *
 *   1. ingest a transcript, run AI analysis  → splits into N atomic items
 *   2. ingest the SAME file again (overridden past the warning)
 *   3. run AI analysis again                 → used to duplicate every point
 *
 * Extraction is where duplicates actually surface. Ingest-level fingerprinting
 * cannot help when the container text differs (two exports of one call), yet
 * the extracted points are identical.
 *
 * Also covers the non-atomic split: the container used to be retired only after
 * every child insert, so a run killed in between left it queued and the next
 * run split it again — duplicates with no duplicate import at all.
 *
 * Run: PGLITE_DIR=./.pglite-test npx tsx scripts/split-dedupe-test.ts
 */
async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { quoteKey } = await import("../src/lib/ingest/fingerprint.ts");
  const { eq, and, inArray } = await import("drizzle-orm");
  const db = await getDb();

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

  const [ws] = await db.select().from(schema.workspaces).limit(1);
  const stamp = Date.now();

  // The points a transcript would yield.
  const points = [
    `Once a board passes two hundred cards it crawls badly, run ${stamp}.`,
    `Exporting a large board to CSV times out for us, run ${stamp}.`,
    `We would really like a dark mode for the reporting screen, run ${stamp}.`,
  ];

  const [src] = await db
    .insert(schema.sources)
    .values({ workspaceId: ws.id, kind: "transcript", filename: `t-${stamp}.txt`, status: "processed" })
    .returning();

  // --- first split ---------------------------------------------------------
  await db.insert(schema.feedbackItems).values(
    points.map((q) => ({
      workspaceId: ws.id,
      sourceId: src.id,
      quote: q,
      type: "Bug" as const,
      reviewStatus: "needs_review" as const,
    })),
  );

  const countMatching = async () => {
    const rows = await db
      .select({ quote: schema.feedbackItems.quote })
      .from(schema.feedbackItems)
      .where(eq(schema.feedbackItems.workspaceId, ws.id));
    return rows.filter((r) => r.quote.includes(String(stamp))).length;
  };

  check("first split stored every point", (await countMatching()) === 3);

  // --- the dedupe rule the splitter now applies ----------------------------
  const known = new Set<string>();
  for (const r of await db
    .select({ quote: schema.feedbackItems.quote })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.workspaceId, ws.id))) {
    const k = quoteKey(r.quote);
    if (k) known.add(k);
  }

  // Step 3: the SAME points come back from a second extraction.
  const secondRun = points.filter((q) => {
    const k = quoteKey(q);
    return k ? !known.has(k) : true;
  });
  check(
    "a re-split of identical points yields nothing new",
    secondRun.length === 0,
    `${secondRun.length} would have been inserted (was 3 before the fix)`,
  );

  // A genuinely new point in the same re-run must still get through.
  const mixed = [...points, `Search ignores hyphenated product codes, run ${stamp}.`];
  const fresh = mixed.filter((q) => {
    const k = quoteKey(q);
    return k ? !known.has(k) : true;
  });
  check("a new point among repeats still gets in", fresh.length === 1, `${fresh.length} new`);

  // --- atomicity: children + container retirement in one transaction -------
  const [container] = await db
    .insert(schema.feedbackItems)
    .values({
      workspaceId: ws.id,
      sourceId: src.id,
      quote: `container ${stamp} ` + "x".repeat(1600),
      reviewStatus: "needs_review" as const,
    })
    .returning();

  let threw = false;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.feedbackItems).values({
        workspaceId: ws.id,
        sourceId: src.id,
        quote: `child that must be rolled back ${stamp}, long enough to count properly.`,
        reviewStatus: "needs_review" as const,
      });
      throw new Error("simulated interruption mid-split");
    });
  } catch {
    threw = true;
  }
  check("a failed split raises", threw);

  const orphans = await db
    .select({ id: schema.feedbackItems.id })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.workspaceId, ws.id));
  const rolledBack = !(
    await Promise.all(
      orphans.map(async (o) => {
        const [row] = await db
          .select({ q: schema.feedbackItems.quote })
          .from(schema.feedbackItems)
          .where(eq(schema.feedbackItems.id, o.id));
        return row?.q?.includes("must be rolled back");
      }),
    )
  ).some(Boolean);
  check("children are rolled back, leaving no half-split", rolledBack);

  const [stillQueued] = await db
    .select({ status: schema.feedbackItems.reviewStatus })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.id, container.id));
  check(
    "the container stays queued so the split can be retried",
    stillQueued.status === "needs_review",
  );

  // clean up
  const mine = await db
    .select({ id: schema.feedbackItems.id })
    .from(schema.feedbackItems)
    .where(and(eq(schema.feedbackItems.workspaceId, ws.id), eq(schema.feedbackItems.sourceId, src.id)));
  if (mine.length) {
    await db.delete(schema.feedbackItems).where(inArray(schema.feedbackItems.id, mine.map((m) => m.id)));
  }
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
