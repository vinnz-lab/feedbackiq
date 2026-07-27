import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as schema from "../src/db/schema";
import { seed } from "../src/db/seed";

// FK-safe insert order (only tables the seed populates)
const TABLES = [
  "tenants",
  "workspaces",
  "users",
  "product_areas",
  "sources",
  "themes",
  "feedback_items",
  "enhancements",
  "tracker_connections",
  "ai_configs",
];

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seed(db);

  // DDL from the generated drizzle migration
  const migDir = "./drizzle";
  const sqlFile = readdirSync(migDir).find((f) => f.endsWith(".sql"))!;
  const ddl = readFileSync(`${migDir}/${sqlFile}`, "utf8");

  const RESET_TABLES = [
    "ai_configs", "audit_events", "digests", "tracker_connections", "evidence_links",
    "enhancements", "feedback_items", "themes", "sources", "product_areas",
    "users", "workspaces", "tenants",
  ];
  const RESET_ENUMS = [
    "role", "source_kind", "source_status", "feedback_type", "sentiment",
    "priority", "confidence", "review_status", "enhancement_status",
  ];

  let out = `-- FeedbackIQ bootstrap — schema + seed. Safe to re-run (wipes prior FeedbackIQ tables first).\n\n`;
  out += `-- ============ RESET (clears any previous run) ============\n`;
  for (const t of RESET_TABLES) out += `DROP TABLE IF EXISTS "${t}" CASCADE;\n`;
  for (const e of RESET_ENUMS) out += `DROP TYPE IF EXISTS "${e}" CASCADE;\n`;
  out += `\n-- ============ SCHEMA ============\n${ddl}\n\n-- ============ SEED DATA ============\n`;

  for (const t of TABLES) {
    const res = (await db.execute(sql.raw(`select * from "${t}"`))) as unknown as {
      rows: Record<string, unknown>[];
    };
    for (const row of res.rows) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => lit(row[c]));
      out += `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT DO NOTHING;\n`;
    }
    out += `\n`;
  }

  writeFileSync("./bootstrap.sql", out);
  console.log("bootstrap.sql written —", out.split("\n").length, "lines,", Math.round(out.length / 1024), "KB");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
