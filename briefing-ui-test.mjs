/** Audio briefings, end to end against scripts/fake-ai.mjs (run via run-ws-suites.sh). */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
const fake = "http://127.0.0.1:54500";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1300 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { page, ctx };
}
const calls = async () => (await fetch(fake + "/__calls")).json();
const open = (p) => p.goto(base + "/briefings", { waitUntil: "networkidle" });
async function waitReady(p, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await p.reload({ waitUntil: "networkidle" });
    const st = await p.getByTestId("briefing").first().getAttribute("data-status");
    if (st === "ready" || st === "failed") return st;
    await p.waitForTimeout(1500);
  }
  return "timeout";
}

const { page: jamie, ctx: jctx } = await session("Jamie Lee");
console.log("Finding it:");
check((await jamie.getByRole("link", { name: "Audio briefings" }).count()) === 1, "“Audio briefings” is in the sidebar");
await jamie.goto(base + "/themes", { waitUntil: "networkidle" });
await jamie.getByRole("link", { name: "🎧 Audio briefing" }).click();
await jamie.waitForURL("**/briefings");
let main = await jamie.locator("main").innerText();
check(/Only the 10 most recent briefings are kept, and each one is deleted automatically 30 days after it was made/.test(main) && /Download anything you want to keep/.test(main), "the page says only 10 are kept, for 30 days, so download to keep");

console.log("\nThe choices:");
const ticked = await jamie.locator('input[name="themeId"]:checked').count();
check(ticked === 3, "the three biggest themes are ticked to start with", String(ticked));
check(await jamie.locator('input[name="length"][value="balanced"]').isChecked() && (await jamie.locator('input[name="length"][value="deep"]').isDisabled()) && /Deep dive.*COMING SOON/s.test(main), "Balanced is the default; Deep dive shows as coming soon");
check(await jamie.locator('input[name="nameMode"][value="mask"]').isChecked(), "names are initials by default");
check(/Script and voices by Google Gemini/.test(main), "says which AI writes and voices it");
while (await jamie.locator('input[name="themeId"]:checked').count()) await jamie.locator('input[name="themeId"]:checked').first().uncheck();
check(await jamie.getByRole("button", { name: "🎧 Create audio briefing" }).isDisabled(), "with no theme ticked, Create is disabled");
const all = await jamie.locator('input[name="themeId"]').all();
for (const cb of all.slice(0, 2)) await cb.check();

console.log("\nMaking one:");
let before = (await calls()).length;
await jamie.getByRole("button", { name: "🎧 Create audio briefing" }).click();
await jamie.locator("text=/Started — the script is being written and voiced/").waitFor({ timeout: 15000 });
check(true, "it starts and says it takes a minute or two");
const st0 = await jamie.getByTestId("briefing").first().getAttribute("data-status");
check(["writing", "voicing", "ready"].includes(st0), "it appears straight away while it's being made", st0);
check(await waitReady(jamie) === "ready", "and becomes ready");
const got = (await calls()).slice(before);
const script = got.find((c) => c.provider === "gemini" && /podcast-style/.test(c.prompt));
const voice = got.filter((c) => c.provider === "gemini-tts");
check(script && script.last4 === "PLAT", "the script was written by Gemini on the platform key");
check(voice.length >= 1 && voice[0].model === "gemini-3.8-flash-lite-tts" && voice[0].last4 === "PLAT" && voice[0].speakers.includes("Ava") && voice[0].speakers.includes("Leo"), "then voiced by two speakers, Ava and Leo");
const item = jamie.getByTestId("briefing").first();
let t = await item.innerText();
check(/Ready/.test(t) && /Briefing by gemini/.test(t) && /0:\d\d|1:\d\d/.test(t), "shows its title, length and status", t.split("\n").slice(0, 2).join(" | "));
check(/Deleted automatically in 30 days/.test(t) && /download it to keep it/.test(t), "and when it will be deleted");
check((await item.locator("audio").count()) === 1, "it has a player");
await item.getByText("Read the script").click();
t = await item.innerText();
check(/AI-generated briefing/.test(t) && /Ava:/.test(t) && /Leo:/.test(t), "the script can be read too, and says it's AI");
check(!/Skyline Ltd|Northwind|Globex|Initech|Umbrella/.test(t) && /[A-Z]\. [A-Z]\./.test(t), "customer names were said as initials");

console.log("\nListening and downloading:");
const id = (await item.locator("audio").getAttribute("src")).split("/")[3];
let r = await jctx.request.get(`${base}/api/briefings/${id}/audio`);
const body = await r.body();
check(r.status() === 200 && r.headers()["content-type"] === "audio/mpeg" && body[0] === 0xff, "the audio is an MP3", `${(body.length / 1000).toFixed(0)} KB`);
r = await jctx.request.get(`${base}/api/briefings/${id}/audio`, { headers: { Range: "bytes=0-99" } });
check(r.status() === 206 && (await r.body()).length === 100 && r.headers()["content-range"] === `bytes 0-99/${body.length}`, "seeking works (needed for iPhones)");
r = await jctx.request.get(`${base}/api/briefings/${id}/audio?download=1`);
check(/attachment; filename="insight-hub-briefing-\d{4}-\d\d-\d\d-briefing-by-gemini\.mp3"/.test(r.headers()["content-disposition"] ?? ""), "Download saves it as a named MP3 file", r.headers()["content-disposition"]);
check((await fetch(`${base}/api/briefings/${id}/audio`)).status === 401, "nobody signed out can get it");

console.log("\nThe bell:");
await jamie.reload({ waitUntil: "networkidle" });
await jamie.getByRole("button", { name: /^Notifications/ }).click();
check(/Audio briefing ready: Briefing by gemini/.test(await jamie.getByRole("dialog", { name: "Notifications" }).innerText()), "the bell says it's ready");
await jamie.keyboard.press("Escape");

console.log("\nOther people:");
const { page: vera, ctx: vctx } = await session("Vera Viewer");
await open(vera);
main = await vera.locator("main").innerText();
check(/Briefing by gemini/.test(main) && (await vera.getByRole("button", { name: /Create audio briefing/ }).count()) === 0 && (await vera.getByRole("button", { name: "Delete" }).count()) === 0, "a viewer can see and play briefings, but not make or delete them");
check((await vctx.request.get(`${base}/api/briefings/${id}/audio`)).status() === 200, "…and can download them");
const { page: tess, ctx: tctx } = await session("Tess Tester");
check((await tctx.request.get(`${base}/api/briefings/${id}/audio`)).status() === 404, "another workspace can't get Jamie's audio");

console.log("\nA workspace using Claude:");
await tess.goto(base + "/integrations", { waitUntil: "networkidle" });
const ai = tess.locator("section", { hasText: "AI connection" });
await ai.getByLabel("Anthropic (Claude)", { exact: true }).check();
await tess.getByLabel("AI API key").fill("sk-ant-api03-good-claude-key-00000000000CD34");
await tess.getByRole("button", { name: "Check and save" }).click();
await ai.locator("text=/^✓ /").first().waitFor({ timeout: 20000 });
await open(tess);
main = await tess.locator("main").innerText();
check(/Script written by Anthropic \(Claude\); voices by Google Gemini/.test(main), "it says Claude writes and Gemini voices");
before = (await calls()).length;
await tess.getByRole("button", { name: "🎧 Create audio briefing" }).click();
await tess.locator("text=/Started/").waitFor({ timeout: 15000 });
check(await waitReady(tess) === "ready", "it's made");
const g2 = (await calls()).slice(before);
check(g2.some((c) => c.provider === "anthropic" && c.last4 === "CD34" && /podcast-style/.test(c.prompt)) && g2.some((c) => c.provider === "gemini-tts" && c.last4 === "PLAT"), "the script came from Claude, the voices from Gemini");
check(/Briefing by anthropic/.test(await tess.locator("main").innerText()) && !/Briefing by gemini/.test(await tess.locator("main").innerText()), "and Tess sees only her own workspace's briefings");

console.log("\nDeleting:");
await open(jamie);
await jamie.getByTestId("briefing").first().getByRole("button", { name: "Delete" }).click();
await jamie.waitForTimeout(1500);
await open(jamie);
check((await jamie.getByTestId("briefing").count()) === 0 && (await jctx.request.get(`${base}/api/briefings/${id}/audio`)).status() === 404, "Delete removes it and its audio");

console.log(errors.length ? "\nBrowser errors:\n" + errors.join("\n") : "\nNo browser errors.");
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
