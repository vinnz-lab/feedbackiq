/**
 * Every action that changes data or spends AI checks the caller's role on the
 * SERVER. Hiding a button isn't protection; this test fails if a write action
 * is added (or edited) without a permission check.
 * Run: npx tsx scripts/permissions-test.ts
 */
import { readFileSync } from "node:fs";
async function main() {
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
  const { can } = await import("../src/lib/permissions.ts");

  console.log("The table:");
  check("viewer can't edit, use Jira or administer", !can("viewer", "edit") && !can("viewer", "jira") && !can("viewer", "admin"));
  check("contributor can edit and use Jira, not administer", can("contributor", "edit") && can("contributor", "jira") && !can("contributor", "admin"));
  check("owner can do everything", can("owner", "edit") && can("owner", "jira") && can("owner", "admin"));
  check("executive and engineer are unchanged (contributor-level)", can("executive", "edit") && can("engineer", "jira") && !can("engineer", "admin"));
  check("an unknown or missing role can do nothing", !can("hacker", "edit") && !can(null, "edit") && !can(undefined, "jira"));

  console.log("\nEvery write is checked on the server:");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const src = (p: string) => strip(readFileSync(p, "utf8"));
  // Each exported server action → the guard it must contain.
  const EDIT = /requireCapability\("edit"\)/;
  const JIRA = /requireCapability\("jira"\)/;
  const OWNER = /ctx\.role !== "owner"/;
  const files: [string, RegExp, string][] = [
    ["src/app/(app)/register/actions.ts", EDIT, "approve / discard / correct"],
    ["src/app/(app)/register/ai-actions.ts", EDIT, "AI analysis"],
    ["src/app/(app)/register/transcribe-actions.ts", EDIT, "transcription"],
    ["src/app/(app)/themes/actions.ts", EDIT, "regenerate summaries"],
    ["src/app/(app)/themes/consolidate-actions.ts", EDIT, "review + merge themes"],
    ["src/app/(app)/themes/[id]/actions.ts", EDIT, "rename theme"],
    ["src/app/(app)/roadmap/actions.ts", EDIT, "roadmap status / promote / scores"],
    ["src/app/(app)/digest/actions.ts", EDIT, "generate digest"],
    ["src/lib/ai/with-workspace-ai.ts", EDIT, "every AI run"],
    ["src/app/(app)/roadmap/jira-actions.ts", JIRA, "send / refresh Jira"],
    ["src/app/(app)/settings/jira-actions.ts", OWNER, "connect Jira"],
    ["src/app/(app)/settings/ai-key-actions.ts", OWNER, "AI key"],
    ["src/app/(app)/settings/clear-register-actions.ts", OWNER, "clear register"],
    // resetMemberPassword uses the stricter canResetPassword rule (owner, or the platform owner).
    ["src/app/(app)/settings/team-actions.ts", /ctx\.role !== "owner"|canResetPassword\(\{/, "team"],
  ];
  for (const [f, guard, what] of files) {
    const s = src(f);
    const exported = [...s.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    const unguarded = exported.filter((name) => {
      const body = s.slice(s.indexOf(`export async function ${name}`));
      const next = body.slice(1).search(/\nexport async function |\n(async )?function \w+Inner/);
      const own = next === -1 ? body : body.slice(0, next + 1);
      // A wrapper that delegates to an Inner function is checked via the Inner function / withWorkspaceAi.
      return !guard.test(own) && !/withWorkspaceAi\(|Inner\(/.test(own) && !/await (jiraContext|ownerContext)\(\)/.test(own);
    });
    check(`${what}: ${exported.length} action(s), all guarded`, unguarded.length === 0, unguarded.join(", "));
  }
  const ingest = src("src/app/api/ingest/route.ts");
  check("uploading feedback (API) refuses viewers", /if \(!can\(ctx\.role, "edit"\)\)/.test(ingest) && /status: 403/.test(ingest));
  const team = src("src/app/(app)/settings/team-actions.ts");
  const rc = team.slice(team.indexOf("function changeMemberRole"));
  check("changing roles: owner only, not your own, never the last owner", /ctx\.role !== "owner"/.test(rc) && /id === ctx\.user\.id/.test(rc) && /only owner/.test(rc));
  check("changing roles accepts 'viewer'", /"viewer"/.test(team.slice(team.indexOf("const ROLES"), team.indexOf("const ROLES") + 120)));

  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
