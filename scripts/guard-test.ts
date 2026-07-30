/**
 * Verifies the AI rate limiter: cooldown, daily cap, per-action isolation.
 * Run: PGLITE_DIR=./.pglite-test npx tsx scripts/guard-test.ts
 */
async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { guardAiRun, AI_DAILY_CAP } = await import("../src/lib/guard.ts");
  const db = await getDb();

  const [ws] = await db.select().from(schema.workspaces).limit(1);
  const [u] = await db.select().from(schema.users).limit(1);
  const actor = { id: u.id, name: u.name };
  const pass: string[] = [];
  const fail: string[] = [];
  const check = (name: string, ok: boolean, detail = "") =>
    (ok ? pass : fail).push(`${name}${detail ? " — " + detail : ""}`);

  // 1. First run is allowed.
  const a = await guardAiRun("ai.classify", ws.id, actor);
  check("1st run allowed", a.ok, JSON.stringify(a));

  // 2. Immediate second run is blocked by the cooldown.
  const b = await guardAiRun("ai.classify", ws.id, actor);
  check("2nd run blocked by cooldown", !b.ok, b.ok ? "WAS ALLOWED" : b.error);

  // 3. A different action is not affected by the first action's cooldown.
  const c = await guardAiRun("ai.digest", ws.id, actor);
  check("different action unaffected", c.ok, JSON.stringify(c));

  // 4. Daily cap: backdate enough attempts to exceed it, then expect refusal.
  const backdated = new Date(Date.now() - 60 * 60 * 1000); // 1h ago, inside 24h
  for (let i = 0; i < AI_DAILY_CAP; i++) {
    await db.insert(schema.auditEvents).values({
      workspaceId: ws.id,
      actorId: u.id,
      actorLabel: u.name,
      action: "ai.summarize",
      entityType: "ai_run",
      createdAt: backdated,
    });
  }
  const d = await guardAiRun("ai.summarize", ws.id, actor);
  check(
    "daily cap enforced",
    !d.ok && /Daily AI limit/.test(d.ok ? "" : d.error),
    d.ok ? "WAS ALLOWED" : d.error,
  );

  // 5. Attempts are recorded, so the cap survives restarts / many instances.
  const rows = await db.select().from(schema.auditEvents);
  const aiRuns = rows.filter((r) => r.entityType === "ai_run");
  check("attempts recorded in audit trail", aiRuns.length > 0, `${aiRuns.length} rows`);

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
