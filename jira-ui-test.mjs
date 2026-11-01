/**
 * Jira end to end, against scripts/fake-jira.mjs.
 *   node scripts/fake-jira.mjs 54400 &
 *   PGLITE_DIR=./.pglite-iso ALLOW_DEV_LOGIN=true PLATFORM_ADMIN_EMAILS=jamie@acme.test AI_KEYS_SECRET=<32+ chars> \
 *     FAKE_JIRA_PORT=54400 NODE_OPTIONS="--import ./scripts/test-jira-reroute.mjs" npx next start -p 4000 &
 *   node jira-ui-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
const fake = `http://127.0.0.1:${process.env.FAKE_JIRA_PORT || 54400}`;
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, page, cookie: async () => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const jiraSection = (page) => page.locator("section", { hasText: "Send roadmap items to Jira Cloud" });
async function connect(page, { site = "acme-test.atlassian.net", email = "jamie@acme.test", token = "good-token-123456", project = "FIQ", type = "story", mode = "mask" } = {}) {
  await page.goto(base + "/integrations", { waitUntil: "networkidle" });
  await page.getByLabel("Jira site").fill(site);
  await page.getByLabel("Atlassian account email").fill(email);
  await page.getByLabel("Jira API token").fill(token);
  await page.getByLabel("Jira project key").fill(project);
  await page.getByLabel("Jira issue type").fill(type);
  await page.locator(`input[name="nameMode"][value="${mode}"]`).check();
  await page.getByRole("button", { name: /Check and (connect|save changes)/ }).click();
  await page.waitForTimeout(2500);
  return jiraSection(page).innerText();
}
const issues = async () => (await fetch(`${fake}/__issues`)).json();
const setStatus = (key, name, category, resolution) => fetch(`${fake}/__status`, { method: "POST", body: JSON.stringify({ key, name, category, resolution }) });

const jamie = await session("Jamie Lee");

console.log("Connecting (owner):");
let t = await connect(jamie.page, { site: "evil.com" });
check(/Only Jira Cloud is supported/.test(t), "a non-Jira address is refused");
t = await connect(jamie.page, { token: "wrong-token-000000" });
check(/didn't accept the email and API token/.test(t) && /Not connected/.test(t), "a wrong token is refused, nothing saved");
t = await connect(jamie.page, { project: "NOPE" });
check(/no project with the key NOPE/.test(t), "a wrong project is refused");
t = await connect(jamie.page, { type: "Epic" });
check(/has no “Epic” issue type\. It has: Story, Bug/.test(t), "an issue type the project lacks is refused, listing the choices");
t = await connect(jamie.page);
check(/Connected to FeedbackIQ Delivery \(FIQ\) as Jamie Lee/.test(t), "the right details connect");
await jamie.page.reload({ waitUntil: "networkidle" });
t = await jiraSection(jamie.page).innerText();
check(/Connected to acme-test\.atlassian\.net · project FIQ · tickets created as Story · names masked as initials/.test(t), "it shows what's connected (issue type spelled as Jira does)", (t.match(/Connected to[^\n]*/) || [""])[0]);
check(!/good-token-123456/.test(await jamie.page.content()), "the token isn't shown back in the page");

console.log("\nA contributor:");
const tom = await session("Tom Becker");
await tom.page.goto(base + "/integrations", { waitUntil: "networkidle" });
t = await jiraSection(tom.page).innerText();
check(/Connected to acme-test/.test(t) && /Only the workspace owner can connect Jira/.test(t) && (await tom.page.getByLabel("Jira API token").count()) === 0, "sees it's connected, can't change it");

console.log("\nSending an item (owner):");
await jamie.page.goto(base + "/roadmap", { waitUntil: "networkidle" });
const firstSendable = jamie.page.locator("tbody tr", { has: jamie.page.getByRole("button", { name: "→ Send to Jira" }) }).first();
const rowTitle = (await firstSendable.locator("td").first().innerText()).split("\n")[0].replace(/^\d+\s*/, "").trim();
// Find it by title from here on: the Send button is replaced by the preview.
const row = jamie.page.locator("tbody tr", { hasText: rowTitle }).first();
const statusBefore = (await row.locator("td").last().innerText()).trim();
await row.getByRole("button", { name: "→ Send to Jira" }).click();
const dialog = jamie.page.getByRole("dialog", { name: "Jira ticket preview" });
await dialog.locator("pre").waitFor({ timeout: 10000 });
const preview = await dialog.locator("pre").innerText();
check(preview.startsWith(rowTitle) && /What customers said|Evidence/.test(preview), "a preview shows exactly what will be sent", rowTitle);
check((await issues()).length === 0, "previewing sends nothing to Jira");
await dialog.getByRole("button", { name: "Create ticket" }).click();
const link = jamie.page.locator("tbody tr", { hasText: rowTitle }).getByRole("link", { name: /FIQ-1/ });
await link.waitFor({ timeout: 15000 });
check((await link.getAttribute("href")) === "https://acme-test.atlassian.net/browse/FIQ-1", "the row now links to the ticket");
check(/Jira: To Do/.test(await jamie.page.locator("tbody tr", { hasText: rowTitle }).innerText()), "…and shows its Jira status");
const statusAfter = (await jamie.page.locator("tbody tr", { hasText: rowTitle }).locator("td").last().innerText()).trim();
check(statusBefore !== "Under review" || statusAfter === "Planned", "an 'Under review' item becomes 'Planned' once ticketed", `${statusBefore} → ${statusAfter}`);
const [issue] = await issues();
check(issue?.fields.summary === rowTitle && issue.fields.issuetype.name === "Story" && issue.fields.labels?.includes("feedbackiq"), "the ticket has the title, issue type and feedbackiq label");
const desc = JSON.stringify(issue?.fields.description ?? {});
check(desc.includes(`${base}/themes/`), "it links back to the evidence in FeedbackIQ");

// Names: with "mask", none of the names FeedbackIQ holds for this theme appear.
const exp = JSON.parse(await (await fetch(base + "/api/export", { headers: { Cookie: await jamie.cookie() } })).text());
const theme = exp.data.themes.find((x) => x.title === rowTitle);
const names = [...new Set(exp.data.feedbackItems.filter((i) => i.themeId === theme?.id && i.reviewStatus === "approved").flatMap((i) => [i.customer, i.submitter, i.speaker]).filter((x) => x && x.length >= 3))];
const leaked = names.filter((nm) => desc.toLowerCase().includes(nm.toLowerCase()));
check(names.length > 0 && leaked.length === 0, `"mask": none of this theme's ${names.length} known names reach Jira`, leaked.join(", ") || names.join(", "));
check(!/good-token-123456|encryptedToken|encrypted_token/.test(JSON.stringify(exp)), "the backup contains no Jira token");

await jamie.page.reload({ waitUntil: "networkidle" });
check((await jamie.page.locator("tbody tr", { hasText: rowTitle }).getByRole("button", { name: "→ Send to Jira" }).count()) === 0, "it can't be sent twice");

console.log("\nStatus coming back:");
await setStatus("FIQ-1", "In Progress", "indeterminate", null);
await jamie.page.getByRole("button", { name: "↻ Refresh from Jira" }).click();
await jamie.page.waitForTimeout(3000);
const msg = await jamie.page.locator("text=/Checked \\d+ ticket/").innerText();
check(/1 status updated/.test(msg) && /not found in Jira/.test(msg), "Refresh reports what it found", msg);
let r = await jamie.page.locator("tbody tr", { hasText: rowTitle }).innerText();
check(/In progress/.test(r) && /Jira: In Progress/.test(r), "In Progress in Jira → In progress on the roadmap");
await setStatus("FIQ-1", "Done", "done", "Won't Do");
await jamie.page.getByRole("button", { name: "↻ Refresh from Jira" }).click();
await jamie.page.waitForTimeout(3000);
r = await jamie.page.locator("tbody tr", { hasText: rowTitle }).innerText();
check(/Won't do/.test(r), "Done as “Won't Do” → Won't do");
await setStatus("FIQ-1", "Done", "done", "Done");
await jamie.page.getByRole("button", { name: "↻ Refresh from Jira" }).click();
await jamie.page.waitForTimeout(3000);
r = await jamie.page.locator("tbody tr", { hasText: rowTitle }).innerText();
check(/Shipped/.test(r) && /Jira: Done/.test(r), "Done → Shipped");
check(/Jira: Not found in Jira/.test(await jamie.page.locator("tbody").innerText()), "an old key Jira doesn't know is marked 'not found', not deleted");
await jamie.page.goto(base + "/roadmap?view=board", { waitUntil: "networkidle" });
check((await jamie.page.getByRole("link", { name: /FIQ-1/ }).getAttribute("href")) === "https://acme-test.atlassian.net/browse/FIQ-1", "the Board links to the ticket too");

console.log("\nContributor and viewer on the roadmap:");
await tom.page.goto(base + "/roadmap", { waitUntil: "networkidle" });
check((await tom.page.getByRole("button", { name: "→ Send to Jira" }).count()) > 0 && (await tom.page.getByRole("button", { name: "↻ Refresh from Jira" }).count()) === 1, "a contributor CAN send and refresh");
check((await tom.page.getByRole("link", { name: /FIQ-1/ }).count()) === 1, "and sees the ticket link");
const vera = await session("Vera Viewer");
await vera.page.goto(base + "/roadmap", { waitUntil: "networkidle" });
check((await vera.page.getByRole("button", { name: "→ Send to Jira" }).count()) === 0 && (await vera.page.getByRole("button", { name: "↻ Refresh from Jira" }).count()) === 0, "a viewer can't send or refresh");
check((await vera.page.getByRole("link", { name: /FIQ-1/ }).count()) === 1, "but can follow the ticket link");
await vera.page.goto(base + "/integrations", { waitUntil: "networkidle" });
check((await vera.page.getByLabel("Jira API token").count()) === 0, "and can't change the Jira connection");

console.log("\nName settings:");
t = await connect(jamie.page, { token: "", mode: "include" });
check(/Connected to FeedbackIQ Delivery/.test(t), "changing just the name setting keeps the saved token (left blank)");
await jamie.page.goto(base + "/roadmap", { waitUntil: "networkidle" });
const sendable2 = jamie.page.locator("tbody tr", { has: jamie.page.getByRole("button", { name: "→ Send to Jira" }) }).first();
const title2 = (await sendable2.locator("td").first().innerText()).split("\n")[0].replace(/^\d+\s*/, "").trim();
const row2 = jamie.page.locator("tbody tr", { hasText: title2 }).first();
const theme2 = exp.data.themes.find((x) => x.title === title2);
const names2 = [...new Set(exp.data.feedbackItems.filter((i) => i.themeId === theme2?.id && i.reviewStatus === "approved").flatMap((i) => [i.customer, i.speaker, i.submitter]).filter((x) => x && x.length >= 3))];
await row2.getByRole("button", { name: "→ Send to Jira" }).click();
await dialog.locator("pre").waitFor();
const p2 = await dialog.locator("pre").innerText();
check(names2.length === 0 || names2.some((nm) => p2.includes(nm)), `"include": names appear in the preview`, names2.join(", "));
await dialog.getByRole("button", { name: "Cancel" }).click();
check((await dialog.count()) === 0, "Cancel closes the preview and sends nothing");
await connect(jamie.page, { token: "", mode: "remove" });
await jamie.page.goto(base + "/roadmap", { waitUntil: "networkidle" });
const row3 = jamie.page.locator("tbody tr", { hasText: title2 });
await row3.getByRole("button", { name: "→ Send to Jira" }).click();
await dialog.locator("pre").waitFor();
const p3 = await dialog.locator("pre").innerText();
check(!names2.some((nm) => p3.toLowerCase().includes(nm.toLowerCase())), `"remove": no names in the preview`);

console.log("\nAnother workspace:");
const tess = await session("Tess Tester");
await tess.page.goto(base + "/integrations", { waitUntil: "networkidle" });
check(/Not connected/.test(await jiraSection(tess.page).innerText()), "Tess's workspace isn't connected to Jamie's Jira");

console.log("\nDisconnecting:");
await jamie.page.goto(base + "/integrations", { waitUntil: "networkidle" });
await jamie.page.getByRole("button", { name: "Disconnect Jira" }).click();
await jamie.page.waitForTimeout(2000);
await jamie.page.goto(base + "/roadmap", { waitUntil: "networkidle" });
check((await jamie.page.getByRole("link", { name: /FIQ-1/ }).count()) === 1 && (await jamie.page.getByRole("button", { name: "→ Send to Jira" }).count()) === 0, "existing links stay; nothing more can be sent");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
