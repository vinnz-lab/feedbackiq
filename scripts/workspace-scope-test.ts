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
  "src/lib/webhook-receive.ts": "no login: the secret address identifies the workspace; every write uses hook.workspaceId",
  "src/lib/sharing-data.ts": "public share page: the secret link identifies the workspace (looked up by hash); everything else is filtered by it",
  "src/lib/jira-workspace.ts": "reads the connection / builds the ticket for the workspace id it is given",
  "src/lib/ai/workspace-key.ts": "reads the settings row of the workspace id it is given",
  "src/lib/workspace-delete.ts": "deletes ONE workspace by id; callers check permission",
  "src/lib/platform-data.ts": "platform owner's list: names/owner/date of workspaces THEY set up, no content",
};
const OWNED = ["sources", "themes", "feedbackItems", "enhancements", "digests", "productAreas", "trackerConnections", "aiConfigs", "auditEvents", "workspaceAiSettings", "incomingWebhooks", "digestChannels", "shareLinks"];

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

// Sign-in, forgot-password and reset run BEFORE anyone is in a workspace.
const PRE_LOGIN = ["login/actions", "forgot-password/actions", "reset-password/actions", "choose-password/actions"];
const actions = files.filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")) && !PRE_LOGIN.some((p) => f.includes(p)));
const noCtx = actions.filter((f) => !/requireWorkspace\(\)|requireCapability\(/.test(readFileSync(f, "utf8")));
check(`all ${actions.length} server-action files resolve the workspace (requireWorkspace / requireCapability)`, noCtx.length === 0, noCtx.join(", "));
const stillUser = actions.filter((f) => /requireUser\(\)/.test(strip(readFileSync(f, "utf8"))));
check("no server action authorises by sign-in alone (requireUser)", stillUser.length === 0, stillUser.join(", "));

for (const route of ["src/app/api/ingest/route.ts", "src/app/api/export/route.ts"]) {
  check(`${route} uses the caller's workspace`, /getWorkspaceContext\(\)/.test(readFileSync(route, "utf8")));
}
const ws = strip(readFileSync("src/lib/workspace.ts", "utf8"));
check("the workspace cookie is only honoured if the user is a member", /memberships\.find\(\(m\) => m\.workspace\.id === wanted\)/.test(ws));
check("there is no 'see every workspace' bypass", !/role\s*===\s*["']admin["']|seeAll|allWorkspaces/.test(ws));

const wa = strip(readFileSync("src/app/(app)/workspace-actions.ts", "utf8"));
const fn = (name: string) => wa.slice(wa.indexOf(`function ${name}`), wa.indexOf("export", wa.indexOf(`function ${name}`) + 10));
check("only the platform owner can create a workspace", /isPlatformAdmin\(ctx\.user\.email\)/.test(fn("createWorkspace")));
check("switching only opens a workspace you're a member of", /ctx\.memberships\.find/.test(fn("switchWorkspace")) && /aren't a member/.test(fn("switchWorkspace")));
check("only a workspace's owner can rename it", /ctx\.role !== "owner"/.test(fn("updateWorkspace")));
check("renaming only ever touches the CURRENT workspace", /eq\(schema\.workspaces\.id, ctx\.workspace\.id\)/.test(fn("updateWorkspace")));
check("delete: owner only", /ctx\.role !== "owner"/.test(fn("deleteWorkspace")));
check("delete: never your last workspace (checked on the server)", /if \(!next\) return \{ error/.test(fn("deleteWorkspace")));
check("delete: exact name required (checked on the server)", /\.trim\(\) !== ws\.name/.test(fn("deleteWorkspace")));
check("delete: only ever the CURRENT workspace", !/formData\.get\("(workspaceId|id)"\)/.test(fn("deleteWorkspace")));
check("delete: uses the shared all-or-nothing deletion", /deleteWorkspaceCompletely\(ws\.id\)/.test(fn("deleteWorkspace")) && /db\.transaction\(/.test(strip(readFileSync("src/lib/workspace-delete.ts", "utf8"))));
const pd = strip(readFileSync("src/lib/platform-data.ts", "utf8"));
check("the 'workspaces you set up' list reads no content from inside them", !/feedbackItems|schema\.themes|schema\.sources|enhancements|digests/.test(pd));
check("…and only lists ones THIS person set up", /eq\(schema\.auditEvents\.actorId, adminUserId\)/.test(pd));
const pa = strip(readFileSync("src/app/(app)/settings/platform-actions.ts", "utf8"));
check("giving someone a workspace is platform-owner only", /isPlatformAdmin\(ctx\.user\.email\)/.test(pa));
check("the platform owner is NOT made a member of it", (pa.match(/insert\(schema\.workspaceMembers\)/g) ?? []).length === 1 && !/userId:\s*ctx\.user\.id/.test(pa));
check("it gets its own organisation", /insert\(schema\.tenants\)/.test(pa));
const rp = pa.slice(pa.indexOf("function removeProvisionedWorkspace"));
check("removing a tester workspace: platform owner only", /isPlatformAdmin\(ctx\.user\.email\)/.test(rp));
check("…only ones THIS person set up", /eq\(schema\.auditEvents\.actorId, ctx\.user\.id\)/.test(rp) && /You can only remove workspaces you set up/.test(rp));
check("…exact name required", /confirmName !== ws\.name/.test(rp));
check("…never deletes the remover's own account", /if \(m\.id === ctx\.user\.id\) continue/.test(rp));
check("…only removes sign-ins of people left with NO workspace", /Number\(n\) === 0\) orphans\.push/.test(rp));
check("…reads no content from inside it", !/feedbackItems|schema\.themes|schema\.sources/.test(rp));
// --- AI keys ---------------------------------------------------------------
for (const f of ["src/app/(app)/register/ai-actions.ts", "src/app/(app)/themes/actions.ts", "src/app/(app)/themes/consolidate-actions.ts", "src/app/(app)/digest/actions.ts"]) {
  const s = strip(readFileSync(f, "utf8"));
  check(`${f.split("/").slice(-2).join("/")} runs on the workspace's AI key`, /withWorkspaceAi\(/.test(s) && /currentAiKey\(\)\?\.source/.test(s));
}
const gem = strip(readFileSync("src/lib/ai/client.ts", "utf8"));
check("Gemini calls send the key in a header, never in the URL", /"x-goog-api-key": ai\.key/.test(gem) && !/\?key=/.test(gem));
check("OpenAI and Claude calls send the key in a header too", /Authorization: `Bearer \$\{ai\.key\}`/.test(gem) && /"x-api-key": ai\.key/.test(gem));
check("AI requests only ever go to the three providers' own addresses", (gem.match(/https:\/\/[a-z.]+/g) ?? []).every((u) => ["https://generativelanguage.googleapis.com", "https://api.openai.com", "https://api.anthropic.com"].includes(u)));
const kact = strip(readFileSync("src/app/(app)/settings/ai-key-actions.ts", "utf8"));
check("only owners can change the AI provider or key", (kact.match(/ctx\.role !== "owner"/g) ?? []).length >= 2);
check("the audit trail records the key's last 4 characters, never the key", /after: \{ last4, provider, model, keptKey \}/.test(kact) && !/after: \{[^}]*\bkey\b[,}]/.test(kact));
const wk = strip(readFileSync("src/lib/ai/workspace-key.ts", "utf8"));
check("an unreadable saved key is an error, never a silent fall back to the platform key", /catch \{\s*throw new NoAiKeyError/.test(wk));
check("a workspace blocked from the platform key can't use it", /!row\.allowPlatformKey\) \{\s*throw new NoAiKeyError/.test(wk));
const ak = strip(readFileSync("src/app/(app)/settings/ai-key-actions.ts", "utf8"));
check("only the workspace owner can set or remove its key", (ak.match(/ctx\.role !== "owner"/g) ?? []).length === 2);
{
  const chk = ak.indexOf("await checkModel(provider, model, key)"), tst = ak.indexOf("await tryIt(provider, model, key)"), enc = ak.indexOf("encryptSecret(key)");
  check("a key is checked with its provider (and a test request) before it's saved", chk > 0 && tst > chk && enc > tst);
}
check("the audit log records only the last 4 characters", /after: \{ last4, provider, model, keptKey \}/.test(ak) && !/after: \{[^}]*\bkey\b[,}]/.test(ak.replace(/last4|keptKey/g, "")));
const ex = strip(readFileSync("src/app/api/export/route.ts", "utf8"));
check("backups don't include AI keys", !/workspaceAiSettings/.test(ex));
check("only the platform owner can block a workspace from their key, and only ones they set up",
  /function setPlatformKeyAllowed[\s\S]*isPlatformAdmin[\s\S]*You can only change workspaces you set up/.test(strip(readFileSync("src/app/(app)/settings/platform-actions.ts", "utf8"))));

// --- Jira ------------------------------------------------------------------
const rj = strip(readFileSync("src/app/(app)/roadmap/jira-actions.ts", "utf8"));
check("previewing, sending and refreshing Jira need the jira permission (owners + contributors)", /requireCapability\("jira"\)/.test(rj) && (rj.match(/await jiraContext\(\)/g) ?? []).length === 3);
check("sending claims the item first, so a double-click can't make two tickets", rj.indexOf("set({ jiraKey: SENDING") < rj.indexOf("createJiraIssue("));
check("a failed send releases the claim", /finally \{[\s\S]*jiraKey: null/.test(rj));
const sj = strip(readFileSync("src/app/(app)/settings/jira-actions.ts", "utf8"));
check("only workspace owners can connect or disconnect Jira", (sj.match(/ctx\.role !== "owner"/g) ?? []).length === 2);
check("a Jira connection is checked with Jira before it's saved", sj.indexOf("checkJiraConnection(") < sj.indexOf("encryptSecret(token)"));
check("the Jira audit entry never contains the token", !/after: \{[^}]*token/i.test(sj));
check("backups don't include the Jira token", /schema\.trackerConnections\.siteUrl/.test(ex) && !/encryptedToken/.test(ex));
const jc = strip(readFileSync("src/lib/jira.ts", "utf8"));
check("the Jira client only talks to *.atlassian.net and refuses redirects", /\\.atlassian\\\.net\$/.test(jc) && /redirect: "error"/.test(jc));

// --- Incoming webhook -------------------------------------------------------
// --- Sharing ----------------------------------------------------------------
const sd = strip(readFileSync("src/lib/sharing-data.ts", "utf8"));
check("share links are found only by a hash of the secret", /eq\(schema\.shareLinks\.tokenHash, hashShareToken\(token\)\)/.test(sd) && /looksLikeShareToken\(token\)/.test(sd));
const sp = strip(readFileSync("src/app/share/[token]/page.tsx", "utf8"));
check("the shared roadmap reads only its own workspace, and never quotes, customers or Jira", /eq\(schema\.enhancements\.workspaceId, ws\.id\)/.test(sp) && !/feedbackItems|customer|jira/i.test(sp.replace(/customer feedback|customer mention|customer voice/gi, "")));
check("share pages are never indexed and don't leak their address", /index: false/.test(sp) && /referrer: "no-referrer"/.test(sp));
const sa = strip(readFileSync("src/app/(app)/sharing-actions.ts", "utf8"));
check("only owners connect Slack/Teams or create/turn off share links", ["connectChannel", "disconnectChannel", "createShareLink", "turnOffShareLink"].every((f) => new RegExp(`export async function ${f}[\\s\\S]*?await owner\\(\\)`).test(sa)));
check("posting a digest needs edit rights", /export async function postDigest[\s\S]*?requireCapability\("edit"\)/.test(sa));
check("a Slack/Teams link is checked and test-posted before it's saved (encrypted)", sa.indexOf("checkChannelUrl(kind") < sa.indexOf("postToChannel(kind, checked.url") && sa.indexOf("postToChannel(kind, checked.url") < sa.indexOf("encryptSecret(checked.url)"));
const dc = strip(readFileSync("src/lib/digest-channels.ts", "utf8"));
check("Slack/Teams posts only go to Slack/Teams hosts, and never follow redirects", /host !== "hooks\.slack\.com"/.test(dc) && /webhook\.office\.com/.test(dc) && /redirect: "error"/.test(dc));
const wr = strip(readFileSync("src/lib/webhook-receive.ts", "utf8"));
check("webhook: only a hash of the secret is looked up (never stored in plain)", /eq\(schema\.incomingWebhooks\.tokenHash, hashWebhookToken\(token\)\)/.test(wr));
check("webhook: switched-off addresses are refused", /eq\(schema\.incomingWebhooks\.enabled, true\)/.test(wr));
check("webhook: feedback goes ONLY to the address's own workspace", (wr.match(/workspaceId: hook\.workspaceId/g) ?? []).length === 2 && !/workspaceId: (body|parsed|data)/.test(wr));
check("webhook: arrives in Needs review, never approved", /reviewStatus: "needs_review" as const/.test(wr) && !/"approved"/.test(wr));
check("webhook: size and rate limits come before any work", wr.indexOf("MAX_BODY_BYTES") < wr.indexOf("parseWebhookBody(") && wr.indexOf("MAX_PER_MINUTE") < wr.indexOf("parseWebhookBody("));
const wha = strip(readFileSync("src/app/(app)/integrations/webhook-actions.ts", "utf8"));
check("webhook: only owners create, replace or switch it off", /ctx\.role !== "owner"/.test(wha) && (wha.match(/await owner\(\)/g) ?? []).length === 2);
check("webhook: the secret isn't written to the audit log", !/after: \{[^}]*token[^H]/.test(wha));

const plat = strip(readFileSync("src/lib/platform.ts", "utf8"));
check("platform owner comes from an env variable, not anything the app can change", /process\.env\.PLATFORM_ADMIN_EMAILS/.test(plat) && !/getDb/.test(plat));

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
