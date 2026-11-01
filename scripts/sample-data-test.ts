/**
 * Sample data: loading, what it creates, and removing ONLY what it created.
 * Run: PGLITE_DIR=./.pglite-x npx tsx scripts/sample-data-test.ts  (after db-setup + seed-second-workspace)
 */
(async () => {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { loadSampleData, removeSampleData, hasSampleData, isWorkspaceEmpty } = await import("../src/lib/sample-data.ts");
  const { getGuideState } = await import("../src/lib/getting-started.ts");
  const { eq, count, and } = await import("drizzle-orm");
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log((ok ? "✓ " : "✗ ") + n + (d ? ` — ${d}` : "")); if (!ok) fail++; };
  const db = await getDb();
  const [acme] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "Acme App"));
  const [zebra] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "ZEBRA Space"));
  const [ws] = await db.insert(schema.workspaces).values({ tenantId: acme.tenantId, name: "Fresh Space" }).returning();
  const n = async (t: any, w: string, extra?: any) => Number((await db.select({ n: count() }).from(t).where(extra ? and(eq(t.workspaceId, w), extra) : eq(t.workspaceId, w)))[0].n);
  const snapshot = async (w: string) => ({ items: await n(schema.feedbackItems, w), themes: await n(schema.themes, w), sources: await n(schema.sources, w), enh: await n(schema.enhancements, w) });

  console.log("Guide on a new workspace:");
  let g = await getGuideState(ws.id);
  check("nothing done, workspace empty, no sample", Object.values(g.done).every((d) => !d) && g.empty && !g.hasSample);

  console.log("\nLoading:");
  const zebraBefore = await snapshot(zebra.id);
  const acmeBefore = await snapshot(acme.id);
  const r = await loadSampleData(ws.id);
  const s1 = await snapshot(ws.id);
  check("adds feedback, themes, sources and roadmap items", r.items === 23 && s1.items === 23 && s1.themes === 6 && s1.sources === 3 && s1.enh === 2, JSON.stringify(s1));
  check("most of it is analysed and approved, some waits in Needs review for the AI step", (await n(schema.feedbackItems, ws.id, eq(schema.feedbackItems.reviewStatus, "approved"))) === 17 && (await n(schema.feedbackItems, ws.id, eq(schema.feedbackItems.reviewStatus, "needs_review"))) === 6);
  const srcs = await db.select().from(schema.sources).where(eq(schema.sources.workspaceId, ws.id));
  check("every source is labelled as sample", srcs.every((x) => x.filename.startsWith("Sample — ") && (x.meta as any).sample === true));
  check("roadmap items have real scores and evidence", (await db.select().from(schema.enhancements).where(eq(schema.enhancements.workspaceId, ws.id))).every((e) => Number(e.score) > 0) && (await db.select().from(schema.evidenceLinks)).length > 0);
  check("knows it has sample data", await hasSampleData(ws.id) && !(await isWorkspaceEmpty(ws.id)));
  g = await getGuideState(ws.id);
  check("guide: feedback, analysis, review, themes and roadmap now done; digest still to do", g.done.add && g.done.analyse && g.done.review && g.done.themes && g.done.roadmap && !g.done.digest);
  check("other workspaces untouched", JSON.stringify(await snapshot(zebra.id)) === JSON.stringify(zebraBefore) && JSON.stringify(await snapshot(acme.id)) === JSON.stringify(acmeBefore));
  let err = await loadSampleData(ws.id).catch((e) => e);
  check("can't be loaded twice", err instanceof Error && /no feedback yet/.test(err.message));
  err = await loadSampleData(acme.id).catch((e) => e);
  check("can't be loaded into a workspace that already has real feedback", err instanceof Error && JSON.stringify(await snapshot(acme.id)) === JSON.stringify(acmeBefore));

  console.log("\nUsing it, then adding real feedback too:");
  const [sampleTheme] = await db.select().from(schema.themes).where(and(eq(schema.themes.workspaceId, ws.id), eq(schema.themes.title, "Slow Board Loading")));
  // The AI makes a new theme from a sample item ("dark mode")…
  const [aiTheme] = await db.insert(schema.themes).values({ workspaceId: ws.id, title: "Dark Mode" }).returning();
  const [darkItem] = await db.select().from(schema.feedbackItems).where(and(eq(schema.feedbackItems.workspaceId, ws.id), eq(schema.feedbackItems.reviewStatus, "needs_review")));
  await db.update(schema.feedbackItems).set({ themeId: aiTheme.id, type: "Feature" }).where(eq(schema.feedbackItems.id, darkItem.id));
  // …someone adds it to the roadmap and writes a digest…
  await db.insert(schema.enhancements).values({ workspaceId: ws.id, themeId: aiTheme.id, title: "Dark mode" });
  await db.insert(schema.digests).values({ workspaceId: ws.id, content: { headline: "About sample data" } });
  // …and REAL feedback arrives: one joins a sample theme, one gets its own theme and roadmap item.
  const [realSrc] = await db.insert(schema.sources).values({ workspaceId: ws.id, kind: "paste", filename: "Pasted text", status: "processed" }).returning();
  const [realTheme] = await db.insert(schema.themes).values({ workspaceId: ws.id, title: "Billing Questions" }).returning();
  await db.insert(schema.feedbackItems).values([
    { workspaceId: ws.id, sourceId: realSrc.id, themeId: sampleTheme.id, quote: "REAL: boards are slow for us too", reviewStatus: "approved" },
    { workspaceId: ws.id, sourceId: realSrc.id, themeId: realTheme.id, quote: "REAL: how do invoices work?", reviewStatus: "approved" },
  ]);
  await db.insert(schema.enhancements).values({ workspaceId: ws.id, themeId: realTheme.id, title: "Clearer invoices" });

  console.log("\nRemoving:");
  const rr = await removeSampleData(ws.id);
  const items = await db.select().from(schema.feedbackItems).where(eq(schema.feedbackItems.workspaceId, ws.id));
  const themes = (await db.select().from(schema.themes).where(eq(schema.themes.workspaceId, ws.id))).map((t) => t.title).sort();
  const enh = (await db.select().from(schema.enhancements).where(eq(schema.enhancements.workspaceId, ws.id))).map((e) => e.title).sort();
  check("all sample feedback and sources are gone", rr.removed && items.every((i) => i.quote.startsWith("REAL:")) && (await n(schema.sources, ws.id)) === 1, `${items.length} items left`);
  check("real feedback is kept — both items", items.length === 2);
  check("a sample theme that real feedback joined is kept; empty sample and AI-made themes go", JSON.stringify(themes) === JSON.stringify(["Billing Questions", "Slow Board Loading"]), themes.join(", "));
  check("sample roadmap items and ones built on sample-only themes go; real ones stay", JSON.stringify(enh) === JSON.stringify(["Clearer invoices"]), enh.join(", "));
  check("digests written while sample data was in are removed", (await n(schema.digests, ws.id)) === 0);
  check("no longer has sample data; removing again is harmless", !(await hasSampleData(ws.id)) && !(await removeSampleData(ws.id)).removed);
  check("other workspaces still untouched", JSON.stringify(await snapshot(zebra.id)) === JSON.stringify(zebraBefore) && JSON.stringify(await snapshot(acme.id)) === JSON.stringify(acmeBefore));

  console.log("\nA fresh start:");
  const [ws2] = await db.insert(schema.workspaces).values({ tenantId: acme.tenantId, name: "Second Fresh" }).returning();
  await loadSampleData(ws2.id);
  await removeSampleData(ws2.id);
  check("load then remove leaves an empty workspace", JSON.stringify(await snapshot(ws2.id)) === JSON.stringify({ items: 0, themes: 0, sources: 0, enh: 0 }) && (await isWorkspaceEmpty(ws2.id)));
  process.exit(fail ? 1 : 0);
})();
