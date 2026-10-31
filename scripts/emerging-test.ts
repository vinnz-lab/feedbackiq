/**
 * The EMERGING tag is earned, not stamped on everything.
 * Run: PGLITE_DIR=./.pglite-em npx tsx scripts/emerging-test.ts  (after db-setup)
 */
async function main() {
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
  const { isEmerging } = await import("../src/lib/trend.ts");

  console.log("The rule:");
  check("rising 1 → 3 (+200%) is emerging", isEmerging({ kind: "change", pct: 200, thisWeek: 3, lastWeek: 1 }, true));
  check("rising 4 → 6 (+50%) is emerging", isEmerging({ kind: "change", pct: 50, thisWeek: 6, lastWeek: 4 }, true));
  check("4 → 5 (+25%) is not — steady, not emerging", !isEmerging({ kind: "change", pct: 25, thisWeek: 5, lastWeek: 4 }, true));
  check("1 → 2 (+100%) is not — too few mentions to mean anything", !isEmerging({ kind: "change", pct: 100, thisWeek: 2, lastWeek: 1 }, true));
  check("falling is never emerging", !isEmerging({ kind: "change", pct: -50, thisWeek: 3, lastWeek: 6 }, true));
  check("brand new with 3 mentions, in a workspace with history → emerging", isEmerging({ kind: "new", thisWeek: 3 }, true));
  check("brand new with 3 mentions, but EVERYTHING is new (no history) → not", !isEmerging({ kind: "new", thisWeek: 3 }, false));
  check("brand new with 1 mention → not", !isEmerging({ kind: "new", thisWeek: 1 }, true));
  check("no recent feedback → not", !isEmerging({ kind: "none" }, true) && !isEmerging(undefined, true));

  console.log("\nOn real data:");
  const { getDb, schema } = await import("../src/db/index.ts");
  const { loadEmerging } = await import("../src/lib/trend-data.ts");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [tenant] = await db.insert(schema.tenants).values({ name: "Emerging test" }).returning();
  const day = 86_400_000;
  async function workspace(name: string) {
    return (await db.insert(schema.workspaces).values({ tenantId: tenant.id, name: `${name} ${Date.now()}` }).returning())[0];
  }
  async function theme(wsId: string, title: string, ages: number[]) {
    const [t] = await db.insert(schema.themes).values({ workspaceId: wsId, title, isEmerging: true }).returning();
    for (const a of ages) await db.insert(schema.feedbackItems).values({ workspaceId: wsId, themeId: t.id, quote: `${title} ${a} ${Math.random()}`, reviewStatus: "approved", occurredAt: new Date(Date.now() - a * day) });
    return t;
  }
  // A fresh workspace: everything arrived this week (like a new import).
  const fresh = await workspace("Fresh");
  const f1 = await theme(fresh.id, "Fresh big", [1, 1, 2, 2, 3, 3]);
  const f2 = await theme(fresh.id, "Fresh small", [1]);
  const fe = await loadEmerging(fresh.id);
  check("a fresh import tags NOTHING as emerging (the old bug tagged all of them)", fe.size === 0, [...fe].join(","));
  void f1; void f2;
  // An established workspace with older feedback.
  const est = await workspace("Established");
  const steady = await theme(est.id, "Steady", [30, 40, 9, 10, 2, 3]); // 2 → 2
  const rising = await theme(est.id, "Rising", [30, 9, 1, 2, 3, 4]);   // 1 → 4
  const brandNew = await theme(est.id, "Brand new", [1, 2, 3]);       // 0 → 3
  const quiet = await theme(est.id, "Quiet new", [2]);                 // 0 → 1
  const ee = await loadEmerging(est.id);
  check("rising theme is emerging", ee.has(rising.id));
  check("brand-new theme with 3 mentions is emerging (there's history to compare with)", ee.has(brandNew.id));
  check("steady theme is not", !ee.has(steady.id));
  check("a new theme with 1 mention is not", !ee.has(quiet.id));
  check("the old stored flag no longer decides it (all of these have it set)", !ee.has(steady.id) && !ee.has(quiet.id));

  for (const w of [fresh, est]) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, w.id));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
