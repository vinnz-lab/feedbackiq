/**
 * Search: matching rules and workspace separation, against a real (PGlite) database.
 * Run: PGLITE_DIR=./.pglite-x npx tsx scripts/search-test.ts  (after db-setup + seed-second-workspace)
 */
(async () => {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { searchWorkspace, likePattern, snippet, cleanQuery } = await import("../src/lib/search.ts");
  const { eq } = await import("drizzle-orm");
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log((ok ? "✓ " : "✗ ") + n + (d ? ` — ${d}` : "")); if (!ok) fail++; };
  const db = await getDb();
  const [acme] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "Acme App"));
  const [zebra] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "ZEBRA Space"));

  console.log("Helpers:");
  check("% and _ are taken literally", likePattern("50%_off") === "%50\\%\\_off%" && likePattern("a\\b") === "%a\\\\b%");
  check("spaces tidied and length capped", cleanQuery("  export   to  ") === "export to" && cleanQuery("x".repeat(300)).length === 100);
  const long = "word ".repeat(60) + "NEEDLE in the middle " + "word ".repeat(60);
  const sn = snippet(long, "needle");
  check("snippet shows the part that matched", sn.includes("NEEDLE") && sn.startsWith("…") && sn.endsWith("…") && sn.length < 130);

  console.log("\nFinding things:");
  let r = await searchWorkspace(acme.id, "export");
  check("finds a theme by its name", r.themes.some((t) => /Export to Excel/.test(t.title)), r.themes.map((t) => t.title).join(", "));
  check("finds feedback quotes", r.feedback.length > 0 && r.feedback.every((f) => /export/i.test(f.title)), `${r.feedbackTotal} total`);
  check("finds roadmap items", r.roadmap.some((x) => /Export/i.test(x.title)));
  r = await searchWorkspace(acme.id, "EXPORT");
  check("case doesn't matter", r.themes.some((t) => /Export to Excel/.test(t.title)));
  r = await searchWorkspace(acme.id, "northwind");
  check("finds by customer name and by source file name", r.feedback.length > 0 && r.sources.some((x) => /northwind/i.test(x.title)), `${r.feedbackTotal} items, ${r.sources.length} sources`);
  r = await searchWorkspace(acme.id, "q2_survey");
  check("underscore in a file name matches literally", r.sources.some((x) => x.title === "q2_survey_results.xlsx"));
  r = await searchWorkspace(acme.id, "q2Xsurvey");
  check("…and isn't a wildcard", r.sources.length === 0);
  r = await searchWorkspace(acme.id, "100%");
  check("a % on its own doesn't match everything", r.feedbackTotal === 0 && r.themes.length === 0);
  r = await searchWorkspace(acme.id, "e");
  check("one letter isn't searched", r.feedbackTotal === 0 && r.themes.length === 0);
  r = await searchWorkspace(acme.id, "the");
  check("results are capped, with the true total kept", r.feedback.length <= 6 && r.feedbackTotal >= r.feedback.length, `${r.feedback.length} shown of ${r.feedbackTotal}`);

  console.log("\nRules:");
  const [ws] = [acme];
  await db.insert(schema.feedbackItems).values({ workspaceId: ws.id, quote: "SRCHDISC thrown away item", reviewStatus: "discarded" });
  await db.insert(schema.feedbackItems).values({ workspaceId: ws.id, quote: "SRCHPEND waiting item", reviewStatus: "needs_review" });
  r = await searchWorkspace(acme.id, "SRCHDISC");
  check("discarded feedback is never shown", r.feedbackTotal === 0);
  r = await searchWorkspace(acme.id, "SRCHPEND");
  check("feedback waiting for review is shown, marked, and opens Needs review", r.feedback[0]?.badge === "Needs review" && r.feedback[0].href === "/register?tab=review&q=SRCHPEND");
  r = await searchWorkspace(acme.id, "dashboard");
  check("themed feedback opens its theme", r.feedback.some((f) => f.href.startsWith("/themes/")));

  console.log("\nWorkspaces are separate:");
  r = await searchWorkspace(acme.id, "ZEBRA");
  check("Acme finds nothing of ZEBRA's", r.themes.length + r.feedbackTotal + r.roadmap.length + r.sources.length === 0);
  r = await searchWorkspace(zebra.id, "ZEBRA");
  check("ZEBRA finds its own", r.themes.length === 1 && r.feedbackTotal === 4 && r.sources.length === 1 && r.roadmap.length === 1, `${r.themes.length}/${r.feedbackTotal}/${r.roadmap.length}/${r.sources.length}`);
  r = await searchWorkspace(zebra.id, "export");
  check("ZEBRA doesn't see Acme's 'export' feedback", r.feedback.every((f) => /ZEBRA/.test(f.title)) && !r.themes.some((t) => /Excel/.test(t.title)));
  process.exit(fail ? 1 : 0);
})();
