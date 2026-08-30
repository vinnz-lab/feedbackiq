/**
 * Tests theme merging, with the user's constraint as the headline assertion:
 * NO FEEDBACK POINT MAY BE LOST.
 *
 * Also covers the things that move alongside the label — roadmap items, demand,
 * score — and the ordering trap: feedback_items.theme_id is ON DELETE SET NULL,
 * so deleting a theme before re-pointing its items would orphan the feedback
 * rather than move it. The items would still exist but lose their theme, which
 * is a quieter version of the same loss.
 *
 * Run: PGLITE_DIR=./.pglite-test npx tsx scripts/merge-test.ts
 */
async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { mergeThemes } = await import("../src/lib/themes/merge.ts");
  const { validateProposals } = await import("../src/lib/ai/consolidate.ts");
  const { eq, inArray, count, and } = await import("drizzle-orm");
  const db = await getDb();

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

  const [ws] = await db.select().from(schema.workspaces).limit(1);
  const stamp = Date.now();

  /** Builds a theme with n approved feedback items. */
  async function makeTheme(title: string, n: number) {
    const [t] = await db
      .insert(schema.themes)
      .values({ workspaceId: ws.id, title: `${title} ${stamp}` })
      .returning();
    if (n > 0) {
      await db.insert(schema.feedbackItems).values(
        Array.from({ length: n }, (_, i) => ({
          workspaceId: ws.id,
          themeId: t.id,
          quote: `${title} complaint ${i} at ${stamp}, long enough to be a real quote.`,
          reviewStatus: "approved" as const,
        })),
      );
    }
    return t;
  }

  const itemsOn = async (themeId: string) => {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.feedbackItems)
      .where(eq(schema.feedbackItems.themeId, themeId));
    return Number(n);
  };

  // ================= 1. Nothing is lost =================
  const big = await makeTheme("Slow Board Loading", 5);
  const small = await makeTheme("Slow Board Loading Time", 2);
  const tiny = await makeTheme("Board Crawls On Big Lists", 1);
  const totalBefore = 5 + 2 + 1;

  const out = await mergeThemes(ws.id, [big.id, small.id, tiny.id], "Board Performance");
  check("every feedback item survives the merge", out.itemsMoved === totalBefore, `${out.itemsMoved} of ${totalBefore}`);
  check("they all sit on the survivor", (await itemsOn(out.survivorId)) === totalBefore);
  check("the busiest theme survives, keeping its id", out.survivorId === big.id);
  check("the survivor takes the agreed title", out.survivorTitle === "Board Performance");
  check("the emptied themes are gone", out.mergedAway.length === 2);

  const gone = await db
    .select({ id: schema.themes.id })
    .from(schema.themes)
    .where(inArray(schema.themes.id, [small.id, tiny.id]));
  check("merged-away themes are deleted", gone.length === 0);

  // Nothing may be left orphaned — that is loss by another name.
  const orphans = await db
    .select({ id: schema.feedbackItems.id, q: schema.feedbackItems.quote })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.workspaceId, ws.id));
  const strandedMine = orphans.filter(
    (o) => o.q.includes(String(stamp)) && o.q.includes("complaint"),
  ).length;
  check("no item was orphaned or deleted", strandedMine === totalBefore, `${strandedMine} still present`);

  // ================= 2. Roadmap items and scores =================
  const themeA = await makeTheme("Export To Excel", 4);
  const themeB = await makeTheme("Excel Export", 3);
  const [enhA] = await db
    .insert(schema.enhancements)
    .values({
      workspaceId: ws.id,
      themeId: themeA.id,
      title: `Excel export ${stamp}`,
      benefit: 8,
      effort: 4,
      demand: 4,
      status: "planned",
      jiraKey: "ACME-1",
    })
    .returning();

  const out2 = await mergeThemes(ws.id, [themeA.id, themeB.id], "Excel Export");
  check("roadmap item follows the surviving theme", out2.enhancementsUpdated >= 1);

  const [enhAfter] = await db
    .select()
    .from(schema.enhancements)
    .where(eq(schema.enhancements.id, enhA.id));
  check("roadmap item is not deleted", Boolean(enhAfter));
  check("its status is preserved", enhAfter.status === "planned");
  check("its Jira key is preserved", enhAfter.jiraKey === "ACME-1");
  check(
    "demand is recalculated to the merged total",
    enhAfter.demand === 7,
    `demand=${enhAfter.demand} (4+3)`,
  );
  check("score is recalculated, not left stale", Number(enhAfter.score) > 0, `score=${enhAfter.score}`);

  // ================= 3. Two roadmap items on one theme =================
  const twoA = await makeTheme("Dark Mode", 3);
  const twoB = await makeTheme("Dark Theme", 2);
  await db.insert(schema.enhancements).values([
    { workspaceId: ws.id, themeId: twoA.id, title: `dark A ${stamp}`, status: "review" as const },
    { workspaceId: ws.id, themeId: twoB.id, title: `dark B ${stamp}`, status: "review" as const },
  ]);
  const out3 = await mergeThemes(ws.id, [twoA.id, twoB.id], "Dark Mode");
  check("both roadmap items are kept, none silently dropped", out3.enhancementsUpdated === 2);
  check("the collision is reported rather than hidden", out3.roadmapNeedsTidying === true);

  // ================= 4. Refuses nonsense =================
  let rejectedSingle = false;
  try {
    await mergeThemes(ws.id, [big.id], "Nope");
  } catch {
    rejectedSingle = true;
  }
  check("a merge of one theme is refused", rejectedSingle);

  let rejectedMissing = false;
  try {
    await mergeThemes(ws.id, [big.id, "00000000-0000-4000-8000-000000000000"], "Nope");
  } catch {
    rejectedMissing = true;
  }
  check("an unknown theme id is refused", rejectedMissing);

  // ================= 5. Proposal validation =================
  const fixture = [
    { id: "t1", title: "A", mentions: 3 },
    { id: "t2", title: "B", mentions: 1 },
    { id: "t3", title: "C", mentions: 1 },
  ];
  const v = validateProposals(
    {
      groups: [
        { canonicalTitle: "AB", themeIds: ["t1", "t2"], reason: "same" },
        { canonicalTitle: "Bad", themeIds: ["t2", "t3"], reason: "t2 already used" },
        { canonicalTitle: "Single", themeIds: ["t3"], reason: "only one" },
        { canonicalTitle: "Ghost", themeIds: ["t3", "nope"], reason: "unknown id" },
        { canonicalTitle: "", themeIds: ["t1", "t3"], reason: "no title" },
      ],
    },
    fixture,
  );
  check("accepts the valid group", v.some((g) => g.canonicalTitle === "AB"));
  check("rejects a theme claimed twice", !v.some((g) => g.canonicalTitle === "Bad"));
  check("rejects a group of one", !v.some((g) => g.canonicalTitle === "Single"));
  check("drops unknown ids", !v.some((g) => g.themeIds.includes("nope")));
  check("rejects an empty title", !v.some((g) => g.canonicalTitle === ""));

  // ================= 6. The merge is auditable / undoable =================
  const audits = await db
    .select()
    .from(schema.auditEvents)
    .where(and(eq(schema.auditEvents.workspaceId, ws.id), eq(schema.auditEvents.action, "theme.merge")));
  check("each merge is recorded", audits.length >= 3, `${audits.length} entries`);
  const before = audits[0]?.before as { itemThemes?: unknown[] } | null;
  check(
    "the record keeps every moved item's original theme, so it can be undone",
    Array.isArray(before?.itemThemes) && before!.itemThemes!.length > 0,
    `${before?.itemThemes?.length} mappings`,
  );

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
