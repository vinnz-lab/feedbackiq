/**
 * Structural checks for the clear-register safety rules.
 * Run: npx tsx scripts/clear-register-test.ts
 *
 * Destructive code is checked by reading it, so a future edit that drops a
 * guard fails here rather than in front of a demo audience.
 */
import { readFileSync } from "node:fs";

const actions = readFileSync("src/app/(app)/settings/clear-register-actions.ts", "utf8");
const ui = readFileSync("src/app/(app)/settings/clear-register.tsx", "utf8");
const page = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const a = code(actions);

const results: [string, boolean][] = [
  ["server action is owner-only (role in THIS workspace)", /ctx\.role !== "owner"/.test(a)],
  ["clears ONLY the current workspace", /const wsId = ctx\.workspace\.id/.test(a) && !/from\(schema\.workspaces\)\.limit\(1\)/.test(a)],
  ["requires the typed word CLEAR", /[!=]== "CLEAR"/.test(a)],
  ["requires backup acknowledgement", /formData\.get\("backupDone"\) !== "on"/.test(a)],
  ["deletes inside one transaction", /db\.transaction\(/.test(a)],
  ["deletes children before parents", a.indexOf("delete(schema.feedbackItems)") < a.indexOf("delete(schema.themes)")],
  ["never deletes users", !/delete\(schema\.users\)/.test(a)],
  ["never deletes the audit trail", !/delete\(schema\.auditEvents\)/.test(a)],
  ["never deletes AI config", !/delete\(schema\.aiConfigs\)/.test(a)],
  ["writes an audit entry", /logAudit\(/.test(a) && /register\.cleared/.test(a)],
  ["counts before deleting", a.indexOf("const before") < a.indexOf("db.transaction(")],
  ["UI disables the button until both steps are done", /disabled=\{!ready\}/.test(ui) && /backedUp/.test(ui)],
  ["UI links to the backup before clearing", /href="\/api\/export"/.test(ui)],
  ["settings page shows it to owners only", /isOwner && <ClearRegister/.test(page)],
];

let fail = 0;
for (const [name, ok] of results) {
  console.log((ok ? "✓ " : "✗ ") + name);
  if (!ok) fail++;
}
console.log(`\n${results.length - fail}/${results.length} checks passed`);
process.exit(fail ? 1 : 0);
