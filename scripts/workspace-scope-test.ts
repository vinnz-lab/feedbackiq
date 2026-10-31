/**
 * Guard against the multi-workspace bug class coming back.
 *
 * Every read or write of a workspace-owned table must be filtered by the
 * current workspace, and the workspace must come from lib/workspace.ts — never
 * "the first workspace in the database". A future edit that forgets either
 * fails here, before it can show one tester's feedback to another.
 *
 * Run: npx tsx scripts/workspace-scope-test.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// Deliberate, reviewed exceptions. Anything new must be justified here.
const ALLOW_FIRST_WORKSPACE = ["src/app/api/cron/keepalive/route.ts"]; // system ping, shows no data
const ALLOW_UNSCOPED: Record<string, string> = {
  "src/lib/guard.ts": "AI daily cap is intentionally shared across workspaces",
  "src/app/api/cron/keepalive/route.ts": "anonymous health counts only",
  "src/lib/themes/merge.ts": "operates on theme ids already verified to be in the workspace",
  "src/lib/themes/rename.ts": "operates on a theme id already verified to be in the workspace",
  "src/app/(app)/register/transcribe-actions.ts": "updates rows taken from a workspace-scoped query",
  "src/app/(app)/settings/team-actions.ts": "counts a user's memberships across workspaces on purpose",
};
const OWNED = ["sources", "themes", "feedbackItems", "enhancements", "digests", "productAreas", "trackerConnections", "aiConfigs", "auditEvents"];

let fail = 0;
const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };

const files = walk("src").filter((f) => !/src\/db\/(seed|schema)\.ts$/.test(f));

const firstWs = files.filter((f) => /from\(schema\.workspaces\)\s*\.limit\(1\)/.test(strip(readFileSync(f, "utf8"))) && !ALLOW_FIRST_WORKSPACE.includes(f));
check("nothing picks 'the first workspace'", firstWs.length === 0, firstWs.join(", "));

const unscoped: string[] = [];
for (const f of files) {
  if (ALLOW_UNSCOPED[f]) continue;
  const s = strip(readFileSync(f, "utf8"));
  const re = /\.(from|update|delete)\(\s*(?:schema\.(\w+)|(fi))\s*\)/g;
  for (const m of s.matchAll(re)) {
    const table = m[2] ?? "feedbackItems";
    if (!OWNED.includes(table)) continue;
    const stmt = s.slice(m.index!, m.index! + 700).split(";")[0];
    if (!/workspaceId|wsId|inWs|byWs|needsWork/.test(stmt)) {
      unscoped.push(`${f}:${s.slice(0, m.index!).split("\n").length} ${m[1]} ${table}`);
    }
  }
}
check("every read/write of workspace data is filtered by workspace", unscoped.length === 0, unscoped.join(" | "));

const actions = files.filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")) && !f.includes("login/actions"));
const noCtx = actions.filter((f) => !/requireWorkspace\(\)/.test(readFileSync(f, "utf8")));
check(`all ${actions.length} server-action files resolve the workspace via requireWorkspace()`, noCtx.length === 0, noCtx.join(", "));
const stillUser = actions.filter((f) => /requireUser\(\)/.test(strip(readFileSync(f, "utf8"))));
check("no server action authorises by sign-in alone (requireUser)", stillUser.length === 0, stillUser.join(", "));

for (const route of ["src/app/api/ingest/route.ts", "src/app/api/export/route.ts"]) {
  check(`${route} uses the caller's workspace`, /getWorkspaceContext\(\)/.test(readFileSync(route, "utf8")));
}
const ws = strip(readFileSync("src/lib/workspace.ts", "utf8"));
check("the workspace cookie is only honoured if the user is a member", /memberships\.find\(\(m\) => m\.workspace\.id === wanted\)/.test(ws));
check("there is no 'see every workspace' bypass", !/role\s*===\s*["']admin["']|seeAll|allWorkspaces/.test(ws));

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
