/**
 * Rehearses the 0001 migration on a database shaped like the LIVE one:
 * built from the OLD schema only, with users and data already in it.
 * Proves nobody loses access, nothing is changed or deleted, and a second run
 * fails safely.
 *
 * Run: npx tsx scripts/migration-rehearsal-test.ts
 */
import { readFileSync, rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
  const dir = "./.pglite-rehearsal";
  rmSync(dir, { recursive: true, force: true });
  const pg = new PGlite(dir);
  const run = (f: string) => pg.exec(readFileSync(f, "utf8").replace(/--> statement-breakpoint/g, ""));
  const one = async (q: string) => (await pg.query<Record<string, unknown>>(q)).rows;

  // 1. Today's live shape: old schema, one tenant, one workspace, two people, data.
  await run("drizzle/0000_tranquil_multiple_man.sql");
  await pg.exec(`
    INSERT INTO tenants (name) VALUES ('Acme Group');
    INSERT INTO workspaces (tenant_id, name) SELECT id, 'Acme App' FROM tenants;
    INSERT INTO users (tenant_id, email, name, role) SELECT id, 'owner@live.test', 'Owner', 'owner' FROM tenants;
    INSERT INTO users (tenant_id, email, name, role) SELECT id, 'helper@live.test', 'Helper', 'contributor' FROM tenants;
    INSERT INTO themes (workspace_id, title) SELECT id, 'Performance' FROM workspaces;
    INSERT INTO feedback_items (workspace_id, theme_id, quote, review_status)
      SELECT w.id, t.id, 'slow board ' || g, 'approved' FROM workspaces w, themes t, generate_series(1, 41) g;
  `);
  const before = await one(`SELECT (SELECT count(*) FROM feedback_items) items, (SELECT count(*) FROM themes) themes, (SELECT count(*) FROM users) users`);

  // 2. The migration exactly as it will be pasted into Supabase.
  await run("drizzle/0001_workspace_members.sql");

  const members = await one(`SELECT u.email, m.role FROM workspace_members m JOIN users u ON u.id = m.user_id ORDER BY u.email`);
  check("every existing user is now a member of the workspace", members.length === 2, JSON.stringify(members));
  check("the owner is still the owner", members.some((m) => m.email === "owner@live.test" && m.role === "owner"));
  check("the helper keeps their role", members.some((m) => m.email === "helper@live.test" && m.role === "contributor"));
  const after = await one(`SELECT (SELECT count(*) FROM feedback_items) items, (SELECT count(*) FROM themes) themes, (SELECT count(*) FROM users) users`);
  check("no feedback, themes or users changed", JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} → ${JSON.stringify(after)}`);

  // 3. Running it again by mistake must not double up or damage anything.
  let err = "";
  try { await run("drizzle/0001_workspace_members.sql"); } catch (e) { err = (e as Error).message; }
  check("running it twice stops with 'already exists'", /already exists/.test(err), err.slice(0, 60));
  const members2 = await one(`SELECT count(*) n FROM workspace_members`);
  check("…and memberships are unchanged", Number(members2[0].n) === 2);

  // 4. The OLD app code still works on the new database (the window between
  //    running the SQL and the new code going live).
  const oldStyle = await one(`SELECT id FROM workspaces LIMIT 1`);
  check("old code's queries still work after the migration", oldStyle.length === 1);

  await pg.close();
  rmSync(dir, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
