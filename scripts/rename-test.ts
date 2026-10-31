/**
 * Theme rename against a real (in-process) Postgres.
 * Run: PGLITE_DIR=./.pglite-test npx tsx scripts/rename-test.ts
 */
async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { renameTheme, normaliseTitle } = await import("../src/lib/themes/rename.ts");
  const { mergeThemes } = await import("../src/lib/themes/merge.ts");
  const { eq, inArray, count } = await import("drizzle-orm");
  const db = await getDb();
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };

  const [ws] = await db.select().from(schema.workspaces).limit(1);
  const s = Date.now();
  const mk = async (title: string, items = 2, withRoadmap = true) => {
    const [t] = await db.insert(schema.themes).values({ workspaceId: ws.id, title }).returning();
    for (let i = 0; i < items; i++)
      await db.insert(schema.feedbackItems).values({ workspaceId: ws.id, themeId: t.id, quote: `${title} q${i}`, type: "Bug", reviewStatus: "approved" });
    if (withRoadmap)
      await db.insert(schema.enhancements).values({ workspaceId: ws.id, themeId: t.id, title, status: "planned", jiraKey: "FIQ-1" });
    return t;
  };
  const items = async (id: string) => Number((await db.select({ n: count() }).from(schema.feedbackItems).where(eq(schema.feedbackItems.themeId, id)))[0].n);
  const theme = async (id: string) => (await db.select().from(schema.themes).where(eq(schema.themes.id, id)))[0];
  const enh = async (id: string) => db.select().from(schema.enhancements).where(eq(schema.enhancements.themeId, id));

  const a = await mk(`Performance ${s}`, 3);
  const b = await mk(`Exports ${s}`, 2);

  console.log("Renaming:");
  const r1 = await renameTheme(ws.id, a.id, `  Slow   board loading ${s} `);
  check("rename succeeds", r1.ok && r1.changed);
  check("whitespace is tidied", (await theme(a.id)).title === `Slow board loading ${s}`);
  check("feedback stays attached (3 before, 3 after)", (await items(a.id)) === 3);
  const [e1] = await enh(a.id);
  check("roadmap item is renamed with it", e1.title === `Slow board loading ${s}`);
  check("roadmap status and Jira key are kept", e1.status === "planned" && e1.jiraKey === "FIQ-1");
  check("reports the roadmap update", r1.ok && r1.changed && r1.roadmapUpdated === 1);
  check("the other theme is untouched", (await theme(b.id)).title === `Exports ${s}` && (await enh(b.id))[0].title === `Exports ${s}`);

  console.log("\nRefused, and nothing changes:");
  const before = (await theme(a.id)).title;
  for (const [label, input] of [["empty", ""], ["only spaces", "    "], ["over 100 characters", "x".repeat(101)]] as const) {
    const r = await renameTheme(ws.id, a.id, input);
    check(`${label} name refused`, !r.ok, r.ok ? "accepted!" : r.error);
  }
  const dup = await renameTheme(ws.id, a.id, `EXPORTS ${s}`);
  check("a name another theme already has is refused (any case)", !dup.ok && /already called/.test(dup.ok ? "" : dup.error));
  check("…and points to merging instead", !dup.ok && /merge/i.test(dup.error));
  check("theme name unchanged after all refusals", (await theme(a.id)).title === before);
  check("roadmap name unchanged after all refusals", (await enh(a.id))[0].title === before);

  console.log("\nEdge cases:");
  const same = await renameTheme(ws.id, a.id, before);
  check("saving the same name is a harmless no-op", same.ok && !same.changed);
  const caseOnly = await renameTheme(ws.id, a.id, before.toUpperCase());
  check("changing only the capitals of its OWN name is allowed", caseOnly.ok && caseOnly.changed);
  check("100 characters exactly is allowed", (await renameTheme(ws.id, b.id, "y".repeat(100))).ok);
  const ghost = await renameTheme(ws.id, "00000000-0000-0000-0000-000000000000", "Anything");
  check("a missing theme is refused cleanly", !ghost.ok);
  const c = await mk(`No roadmap ${s}`, 1, false);
  const rc = await renameTheme(ws.id, c.id, `Still no roadmap ${s}`);
  check("theme without a roadmap item renames fine", rc.ok && rc.changed && rc.roadmapUpdated === 0);
  check("normaliseTitle collapses tabs and newlines", normaliseTitle("a\t\n b") === "a b");

  console.log("\nMerges keep the roadmap name in step too:");
  const m1 = await mk(`Dark mode ${s}`, 2);
  const m2 = await mk(`Night theme ${s}`, 1);
  await mergeThemes(ws.id, [m1.id, m2.id], `Dark mode support ${s}`);
  const survivorEnh = await enh(m1.id);
  check("every roadmap item on the merged theme carries the new name",
    survivorEnh.length > 0 && survivorEnh.every((e) => e.title === `Dark mode support ${s}`),
    survivorEnh.map((e) => e.title).join(" | "));

  // tidy up
  const ids = [a.id, b.id, c.id, m1.id];
  await db.delete(schema.enhancements).where(inArray(schema.enhancements.themeId, ids));
  await db.delete(schema.feedbackItems).where(inArray(schema.feedbackItems.themeId, ids));
  await db.delete(schema.themes).where(inArray(schema.themes.id, ids));

  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
