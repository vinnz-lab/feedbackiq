// Run: npx tsx scripts/password-admin-test.ts
import { readFileSync } from "node:fs";
import { canResetPassword, generateTempPassword } from "../src/lib/password-admin.ts";
let fail = 0;
const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const base = { actorIsPlatformAdmin: false, actorRoleHere: "owner", actorId: "a", targetId: "t", targetIsPlatformAdmin: false, targetWorkspaceCount: 1 };

check("a workspace owner can reset someone who's ONLY in their workspace", canResetPassword(base).ok);
const tom = canResetPassword({ ...base, targetWorkspaceCount: 2 });
check("…but NOT someone who's also in another workspace (the account-takeover route)", !tom.ok && /only the platform owner/.test(tom.ok ? "" : tom.reason));
check("the platform owner can reset someone in several workspaces", canResetPassword({ ...base, actorIsPlatformAdmin: true, targetWorkspaceCount: 3 }).ok);
check("nobody can reset the platform owner's password", !canResetPassword({ ...base, actorIsPlatformAdmin: true, targetIsPlatformAdmin: true }).ok && !canResetPassword({ ...base, targetIsPlatformAdmin: true }).ok);
check("you can't reset your own this way", !canResetPassword({ ...base, targetId: "a" }).ok && !canResetPassword({ ...base, actorIsPlatformAdmin: true, targetId: "a" }).ok);
check("a contributor can't reset anyone", !canResetPassword({ ...base, actorRoleHere: "contributor" }).ok);
const pw = new Set(Array.from({ length: 200 }, generateTempPassword));
check("temporary passwords are 16 characters, no look-alikes (0/O/1/l/I)", [...pw].every((p) => p.length === 16 && !/[0O1lI]/.test(p)));
check("…and don't repeat", pw.size === 200);

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const team = strip(readFileSync("src/app/(app)/settings/team-actions.ts", "utf8"));
const reset = team.slice(team.indexOf("function resetMemberPassword"));
check("the server applies the rule (not just the button)", /canResetPassword\(\{/.test(reset) && /if \(!decision\.ok\) return/.test(reset));
check("…counting the target's REAL number of workspaces", /targetWorkspaceCount: await workspaceCountFor\(row\.user\.id\)/.test(reset));
check("…and only for people in THIS workspace", /eq\(schema\.workspaceMembers\.workspaceId, ctx\.workspace\.id\)/.test(reset));
const adm = strip(readFileSync("src/lib/password-admin.ts", "utf8"));
check("the must-change mark is in app_metadata (the person can't clear it themselves)", /app_metadata: \{ \.\.\.\(u\.app_metadata \?\? \{\}\), must_change_password: true \}/.test(adm) && !/user_metadata/.test(adm));
const layout = strip(readFileSync("src/app/(app)/layout.tsx", "utf8"));
check("every app page sends a must-change account to choose a password first", /if \(await mustChangePassword\(\)\) redirect\("\/choose-password"\)/.test(layout));
const audit = team + strip(readFileSync("src/app/(app)/settings/platform-actions.ts", "utf8"));
check("no temporary password is ever written to the audit log", !/after: \{[^}]*password/.test(audit));
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
