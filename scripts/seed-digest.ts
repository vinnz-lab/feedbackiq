/** TEST ONLY: a saved digest for Acme App, so it can be posted and shared without calling an AI. */
(async () => {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "Acme App"));
  await db.insert(schema.digests).values({
    workspaceId: ws.id,
    content: {
      headline: "SEEDDIGEST Slow dashboards dominate this week",
      summary: "Dashboard speed is the top complaint; export requests keep growing.",
      sections: [{ heading: "Top themes", items: ["Slow dashboard loading — 3 mentions", "Export to Excel — 3 mentions"] }],
      quotes: [{ text: "The dashboard takes twenty seconds to load", by: "Skyline Ltd" }],
      roadmap: { review: 3, planned: 1, progress: 1, shipped: 1 },
    },
  });
  process.exit(0);
})();
