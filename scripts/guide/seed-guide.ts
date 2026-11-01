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
  const [ws2] = await db.insert(schema.workspaces).values({ tenantId: tenant.id, name: "My workspace", description: "" }).returning();
  const [sam] = await db.insert(schema.users).values({ tenantId: tenant.id, email: "sam@northstar.example", name: "Sam Lee", role: "owner" }).returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws2.id, userId: sam.id, role: "owner" });
  process.exit(0);
})();
