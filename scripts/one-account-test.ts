/**
 * One person = one account = one password, however many workspaces they're in.
 * Run: PGLITE_DIR=./.pglite-test npx tsx scripts/one-account-test.ts
 */
import { readFileSync } from "node:fs";
async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { listMemberships } = await import("../src/lib/workspace.ts");
  const { eq, sql } = await import("drizzle-orm");
  const db = await getDb();
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };

  const [tenant] = await db.insert(schema.tenants).values({ name: "One-account test" }).returning();
  const wss = [];
  for (const n of ["A", "B", "C"]) {
    wss.push((await db.insert(schema.workspaces).values({ tenantId: tenant.id, name: `One-acct ${n} ${Date.now()}` }).returning())[0]);
  }
  const email = `one-${Date.now()}@test.test`;
  const [u] = await db.insert(schema.users).values({ tenantId: tenant.id, email, name: "One Person" }).returning();
  for (const w of wss) await db.insert(schema.workspaceMembers).values({ workspaceId: w.id, userId: u.id, role: "contributor" });

  let dup = "";
  try { await db.insert(schema.users).values({ tenantId: tenant.id, email, name: "Second account" }); } catch (e) { const err = e as Error & { cause?: Error }; dup = `${err.message} ${err.cause?.message ?? ""}`; }
  check("the database refuses a second account with the same email", /unique|duplicate/i.test(dup), dup.slice(0, 60));
  const rows = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = lower(${email})`);
  check("there is exactly one account for that email", rows.length === 1);
  const m = await listMemberships(u.id);
  check("that one account opens all three workspaces", m.length === 3, `${m.length}`);

  // Every place that creates an account lower-cases the email first, so
  // "Tom@x.com" and "tom@x.com" can't become two accounts.
  const src = (p: string) => readFileSync(p, "utf8");
  check("adding a team member lower-cases the email", /const email = String\(formData\.get\("email"\) \?\? ""\)\.trim\(\)\.toLowerCase\(\)/.test(src("src/app/(app)/settings/team-actions.ts")));
  check("setting up a tester lower-cases the email", /const email = tidy\(formData\.get\("email"\)\)\.toLowerCase\(\)/.test(src("src/app/(app)/settings/platform-actions.ts")));
  check("both reuse an existing account instead of making a second one",
    /already has an account/.test(src("src/app/(app)/settings/team-actions.ts")) && /already had an account/.test(src("src/app/(app)/settings/platform-actions.ts")));

  for (const w of wss) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, w.id));
  await db.delete(schema.users).where(eq(schema.users.id, u.id));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
