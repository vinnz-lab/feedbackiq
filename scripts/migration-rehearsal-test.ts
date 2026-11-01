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

  // 3b. 0002: per-workspace AI settings. Adds a table, changes nothing else.
  await run("drizzle/0002_workspace_ai_settings.sql");
  const ai = await one(`SELECT count(*) n FROM workspace_ai_settings`);
  check("0002 adds the AI settings table, empty (every workspace keeps using the platform key)", Number(ai[0].n) === 0);
  const rls = await one(`SELECT relrowsecurity FROM pg_class WHERE relname = 'workspace_ai_settings'`);
  check("0002 switches on row-level security for it", rls[0].relrowsecurity === true);
  const after2 = await one(`SELECT (SELECT count(*) FROM feedback_items) items, (SELECT count(*) FROM themes) themes, (SELECT count(*) FROM users) users`);
  check("0002 changes no existing data", JSON.stringify(after2) === JSON.stringify(after));

  // 3c. 0003: Jira. The live DB has a credential-less demo placeholder row; a
  //     duplicate is simulated to prove the dedupe before the unique index.
  await pg.exec(`INSERT INTO tracker_connections (workspace_id, provider, project_key, issue_type, created_at)
    SELECT id, 'jira', 'OLD', 'Story', now() - interval '2 days' FROM workspaces;
    INSERT INTO tracker_connections (workspace_id, provider, project_key, issue_type, created_at)
    SELECT id, 'jira', 'ACME', 'Story', now() - interval '1 day' FROM workspaces;`);
  await pg.exec(`INSERT INTO enhancements (workspace_id, title, jira_key) SELECT id, 'Linked item', 'ACME-231' FROM workspaces;`);
  await run("drizzle/0003_jira_integration.sql");
  const tc = await one(`SELECT project_key, name_mode, encrypted_token FROM tracker_connections`);
  check("0003 keeps one connection per workspace (the newest placeholder)", tc.length === 1 && tc[0].project_key === "ACME", JSON.stringify(tc));
  check("0003 defaults names to 'include' and has no token", tc[0].name_mode === "include" && tc[0].encrypted_token === null);
  let dupErr = ""; try { await pg.exec(`INSERT INTO tracker_connections (workspace_id) SELECT id FROM workspaces`); } catch (e) { dupErr = (e as Error).message; }
  check("0003 now refuses a second connection for the same workspace", /duplicate|unique/i.test(dupErr));
  const linked = await one(`SELECT jira_key, jira_url FROM enhancements WHERE title = 'Linked item'`);
  check("0003 keeps existing ticket keys on roadmap items", linked[0].jira_key === "ACME-231" && linked[0].jira_url === null);
  const after3 = await one(`SELECT (SELECT count(*) FROM feedback_items) items, (SELECT count(*) FROM themes) themes, (SELECT count(*) FROM users) users`);
  check("0003 changes no feedback, themes or users", JSON.stringify(after3) === JSON.stringify(after));

  // 3d. 0004: the viewer role. Run twice to prove it's safe to repeat.
  await run("drizzle/0004_viewer_role.sql");
  let again = ""; try { await run("drizzle/0004_viewer_role.sql"); } catch (e) { again = (e as Error).message; }
  const roles = await one(`SELECT unnest(enum_range(NULL::role))::text AS r`);
  check("0004 adds 'viewer' and keeps every existing role", ["owner", "contributor", "executive", "engineer", "viewer"].every((x) => roles.some((r) => r.r === x)), roles.map((r) => r.r).join(","));
  const membersAfter = await one(`SELECT u.email, m.role::text AS role FROM workspace_members m JOIN users u ON u.id = m.user_id ORDER BY u.email`);
  check("0004 changes nobody's role", JSON.stringify(membersAfter) === JSON.stringify(members));
  check("0004 can be run again safely", again === "", again);

  // 3e. 0005: incoming webhook.
  await run("drizzle/0005_incoming_webhook.sql");
  const kinds = await one(`SELECT unnest(enum_range(NULL::source_kind))::text AS k`);
  check("0005 adds the 'webhook' source type, keeping the others", ["email", "spreadsheet", "paste", "webhook"].every((x) => kinds.some((r) => r.k === x)));
  const wh = await one(`SELECT count(*) n, bool_or(c.relrowsecurity) rls FROM incoming_webhooks, (SELECT relrowsecurity FROM pg_class WHERE relname='incoming_webhooks') c`);
  const rls5 = await one(`SELECT relrowsecurity FROM pg_class WHERE relname = 'incoming_webhooks'`);
  check("0005 adds the webhook table, empty, protected from the public API", Number(wh[0]?.n ?? 0) === 0 && rls5[0].relrowsecurity === true);
  const after5 = await one(`SELECT (SELECT count(*) FROM feedback_items) items, (SELECT count(*) FROM themes) themes, (SELECT count(*) FROM users) users`);
  check("0005 changes no existing data", JSON.stringify(after5) === JSON.stringify(after));

  // 3f. 0006: AI model per workspace.
  await run("drizzle/0006_ai_model.sql");
  await run("drizzle/0006_ai_model.sql"); // safe to run twice
  const col = await one(`SELECT data_type FROM information_schema.columns WHERE table_name='workspace_ai_settings' AND column_name='model'`);
  check("0006 adds the model column (and can be run twice)", col[0]?.data_type === "text");
  const after6 = await one(`SELECT (SELECT count(*) FROM feedback_items) items, (SELECT count(*) FROM themes) themes, (SELECT count(*) FROM users) users`);
  check("0006 changes no existing data", JSON.stringify(after6) === JSON.stringify(after));

  // 3g. 0007: digest channels + share links.
  await run("drizzle/0007_digest_channels_share_links.sql");
  const t7 = await one(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('digest_channels','share_links') ORDER BY relname`);
  check("0007 adds the digest-channel and share-link tables, protected from the public API", t7.length === 2 && t7.every((r) => r.relrowsecurity === true));
  const after7 = await one(`SELECT (SELECT count(*) FROM feedback_items) items, (SELECT count(*) FROM themes) themes, (SELECT count(*) FROM users) users`);
  check("0007 changes no existing data", JSON.stringify(after7) === JSON.stringify(after));

  // 3h. 0008: audio briefings.
  await run("drizzle/0008_audio_briefings.sql");
  const t8 = await one(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('audio_briefings','audio_files') ORDER BY relname`);
  check("0008 adds the audio briefing tables, protected from the public API", t8.length === 2 && t8.every((r) => r.relrowsecurity === true));
  await one(`INSERT INTO audio_briefings (workspace_id, title, theme_ids, theme_titles, expires_at) SELECT id, 't', '[]', '[]', now() FROM workspaces LIMIT 1`);
  await one(`INSERT INTO audio_files (briefing_id, workspace_id, mp3) SELECT id, workspace_id, '\\xfff3'::bytea FROM audio_briefings LIMIT 1`);
  const bytes = await one(`SELECT length(mp3) n FROM audio_files`);
  check("0008 stores audio bytes", Number(bytes[0].n) === 2);
  await one(`DELETE FROM audio_briefings`);
  check("…and deleting a briefing deletes its audio", (await one(`SELECT count(*) n FROM audio_files`))[0].n == 0);
  const after8 = await one(`SELECT (SELECT count(*) FROM feedback_items) items, (SELECT count(*) FROM themes) themes, (SELECT count(*) FROM users) users`);
  check("0008 changes no existing data", JSON.stringify(after8) === JSON.stringify(after));

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
