/**
 * Proves clean-setup.sql builds a working, EMPTY app database.
 * Run: npx tsx scripts/clean-setup-test.ts
 */
import { readFileSync, rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { count } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";

const sql = readFileSync("clean-setup.sql", "utf8");
const code = sql.replace(/--.*$/gm, ""); // judge the statements, not the comments
async function main() {
const dir = "./.pglite-clean-check";
rmSync(dir, { recursive: true, force: true });
const pg = new PGlite(dir);
let fail = 0;
const check = (n: string, ok: boolean, d = "") => { console.log((ok ? "✓ " : "✗ ") + n + (d ? "  (" + d + ")" : "")); if (!ok) fail++; };

check("script has no destructive statements", !/\b(DROP|DELETE\s+FROM|TRUNCATE)\b/i.test(code.replace(/ON DELETE/gi, "")));
await pg.exec(sql);
const db = drizzle(pg, { schema });

// Every table the app uses must exist with every column the code expects: a
// drizzle select lists all columns, so a missing one throws here.
const tables = Object.entries(schema).filter(([, v]) => v && typeof v === "object" && Symbol.for("drizzle:IsDrizzleTable") in (v as object));
let ok = 0;
for (const [name, t] of tables) {
  try { await db.select().from(t as never).limit(1); ok++; } catch (e) { check(`table ${name} matches the code`, false, (e as Error).message.slice(0, 120)); }
}
check(`all ${tables.length} app tables exist with the columns the code expects`, ok === tables.length, `${ok}/${tables.length}`);

const n = async (t: never) => Number((await db.select({ n: count() }).from(t))[0].n);
check("one tenant and one workspace exist (bootstrap needs them)", (await n(schema.tenants as never)) === 1 && (await n(schema.workspaces as never)) === 1);
check("NO users (first owner comes from BOOTSTRAP_OWNER_EMAIL)", (await n(schema.users as never)) === 0);
for (const [label, t] of [["feedback items", schema.feedbackItems], ["sources", schema.sources], ["themes", schema.themes], ["roadmap items", schema.enhancements], ["digests", schema.digests]] as const)
  check(`no demo ${label}`, (await n(t as never)) === 0);

let second = "";
try { await pg.exec(sql); } catch (e) { second = (e as Error).message; }
check("running it twice fails safely instead of wiping", /already exists/i.test(second), second.slice(0, 60));
check("the workspace survived the second run", (await n(schema.workspaces as never)) === 1);

rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
}
main();
