/**
 * Bring-your-own AI (Gemini / OpenAI / Claude), end to end against scripts/fake-ai.mjs.
 * Run via run-ws-suites.sh (sets FAKE_AI_PORT for this suite only).
 */
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
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, page, cookie: async () => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const calls = async () => (await fetch(fake + "/__calls")).json();
const section = (p) => p.locator("section", { hasText: "AI connection" });
const status = async (p) => (await p.getByTestId("ai-status").innerText()).trim();
async function save(p, { provider, model, custom, key }) {
  await p.goto(base + "/integrations", { waitUntil: "networkidle" });
  if (provider) await section(p).getByLabel(provider, { exact: true }).check();
  if (model) await p.getByLabel("AI model").selectOption(model);
  if (custom) await p.getByLabel("Model name").fill(custom);
  if (key !== undefined) await p.getByLabel("AI API key").fill(key);
  await p.getByRole("button", { name: "Check and save" }).click();
  await p.locator("section", { hasText: "AI connection" }).locator("text=/^(⚠|✓) /").first().waitFor({ timeout: 20000 });
  return section(p).innerText();
}
const GOOD_OPENAI = "sk-proj-good-openai-key-0000000000000000AB12";
const GOOD_CLAUDE = "sk-ant-api03-good-claude-key-00000000000CD34";

const jamie = await session("Jamie Lee");
console.log("The choice:");
await jamie.page.goto(base + "/integrations", { waitUntil: "networkidle" });
let t = await section(jamie.page).innerText();
check(/Google Gemini/.test(t) && /OpenAI \(ChatGPT\)/.test(t) && /Anthropic \(Claude\)/.test(t), "three providers to choose from");
check(/Using the platform's AI key \(Google Gemini\)/.test(await status(jamie.page)), "starts on the platform key");
await section(jamie.page).getByLabel("OpenAI (ChatGPT)", { exact: true }).check();
check((await jamie.page.getByLabel("AI model").inputValue()) === "gpt-5-mini", "picking OpenAI pre-selects its recommended model");
t = await section(jamie.page).innerText();
check(/platform\.openai\.com → API keys/.test(t) && /ChatGPT Plus or Pro subscription doesn't include API use/.test(t), "says where to get a key, and that a ChatGPT subscription isn't enough");
check((await jamie.page.getByRole("link", { name: "platform.openai.com → API keys" }).getAttribute("href")) === "https://platform.openai.com/api-keys", "with a link to the right page");

console.log("\nMistakes are caught before saving:");
t = await save(jamie.page, { provider: "OpenAI (ChatGPT)", key: GOOD_CLAUDE });
check(/That key looks like it's from Anthropic \(Claude\), not OpenAI \(ChatGPT\)/.test(t), "a Claude key pasted under OpenAI", t.match(/⚠.*$/m)?.[0]);
t = await save(jamie.page, { provider: "OpenAI (ChatGPT)", key: "sk-proj-wrong-key-0000000000000000000000" });
check(/OpenAI didn't accept this key/.test(t), "a wrong key", t.match(/⚠.*$/m)?.[0]);
t = await save(jamie.page, { provider: "OpenAI (ChatGPT)", key: "sk-proj-nocredit-key-00000000000000000000" });
check(/no API credit/.test(t) && /platform\.openai\.com → Billing/.test(t), "a key whose account has no API credit", t.match(/⚠.*$/m)?.[0]);
t = await save(jamie.page, { provider: "OpenAI (ChatGPT)", model: "__other", custom: "gpt-imaginary", key: GOOD_OPENAI });
check(/can't use the model “gpt-imaginary”/.test(t), "a model the key can't use", t.match(/⚠.*$/m)?.[0]);
t = await save(jamie.page, { provider: "OpenAI (ChatGPT)", model: "__other", custom: "bad model!", key: GOOD_OPENAI });
check(/valid model name/.test(t), "a model name with odd characters");
await jamie.page.reload({ waitUntil: "networkidle" });
check(/platform's AI key/.test(await status(jamie.page)), "nothing was saved by any of those");

console.log("\nSaving an OpenAI key:");
t = await save(jamie.page, { provider: "OpenAI (ChatGPT)", key: GOOD_OPENAI });
check(/Checked and saved/.test(t) && /OpenAI \(ChatGPT\) key \(…AB12\) with gpt-5-mini/.test(t), "checked and saved", t.match(/✓.*$/m)?.[0]);
await jamie.page.reload({ waitUntil: "networkidle" });
check(/own OpenAI \(ChatGPT\) key \(…AB12\) · model gpt-5-mini/.test(await status(jamie.page)), "status shows provider, key ending and model");
check(!(await jamie.page.content()).includes("good-openai-key"), "the key never comes back into the page");
check((await section(jamie.page).getByLabel("OpenAI (ChatGPT)", { exact: true }).isChecked()) && (await jamie.page.getByLabel("AI model").inputValue()) === "gpt-5-mini", "the form opens on what's saved");

console.log("\nAI runs on it:");
let before = (await calls()).length;
await jamie.page.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
await jamie.page.getByRole("button", { name: /Run AI analysis/ }).first().click();
await jamie.page.waitForTimeout(5000);
let after = (await calls()).slice(before);
check(after.length >= 1 && after.every((c) => c.provider === "openai" && c.model === "gpt-5-mini" && c.last4 === "AB12"), "AI analysis went to OpenAI, with this workspace's key and model", `${after.length} request(s)`);
await jamie.page.reload({ waitUntil: "networkidle" });
check(/openai Provider Theme/.test(await jamie.page.locator("main").innerText()), "and its answers were used");

console.log("\nChanging just the model:");
t = await save(jamie.page, { model: "gpt-5-nano", key: "" });
check(/Saved\. AI in this workspace now uses OpenAI \(ChatGPT\) with gpt-5-nano/.test(t), "blank key keeps the saved one", t.match(/✓.*$/m)?.[0]);
const last = (await calls()).at(-1);
check(last.model === "gpt-5-nano" && last.last4 === "AB12", "the new model was tested with the saved key");

console.log("\nSwitching to Claude:");
t = await save(jamie.page, { provider: "Anthropic (Claude)", key: "" });
check(/Paste your Anthropic \(Claude\) API key/.test(t), "a different provider needs its own key");
t = await save(jamie.page, { provider: "Anthropic (Claude)", key: "sk-ant-api03-nocredit-key-0000000000000000" });
check(/no API credit/.test(t) && /console\.anthropic\.com → Billing/.test(t), "no credit on a Claude account is caught too");
t = await save(jamie.page, { provider: "Anthropic (Claude)", model: "claude-sonnet-4-5", key: GOOD_CLAUDE });
check(/Anthropic \(Claude\) key \(…CD34\) with claude-sonnet-4-5/.test(t), "Claude key saved with the chosen model");
before = (await calls()).length;
await jamie.page.goto(base + "/themes", { waitUntil: "networkidle" });
await jamie.page.getByRole("button", { name: /Regenerate summaries/ }).click();
await jamie.page.waitForTimeout(6000);
after = (await calls()).slice(before);
check(after.length >= 1 && after.every((c) => c.provider === "anthropic" && c.model === "claude-sonnet-4-5" && c.last4 === "CD34"), "theme summaries now come from Claude", `${after.length} request(s)`);
await jamie.page.reload({ waitUntil: "networkidle" });
check(/Summary written by anthropic/.test(await jamie.page.locator("main").innerText()), "Claude's answers (sent inside ``` fences) were read correctly");

console.log("\nOther people and workspaces:");
const tom = await session("Tom Becker");
await tom.page.goto(base + "/integrations", { waitUntil: "networkidle" });
t = await section(tom.page).innerText();
check(/own Anthropic \(Claude\) key \(…CD34\) · model claude-sonnet-4-5/.test(t) && (await tom.page.getByLabel("AI API key").count()) === 0, "a contributor sees which AI is used, but can't change it");
const tess = await session("Tess Tester");
await tess.page.goto(base + "/integrations", { waitUntil: "networkidle" });
check(/platform's AI key/.test(await status(tess.page)), "another workspace is unaffected");
const notOwner = await fetch(base + "/api/notifications", { headers: { Cookie: await tom.cookie() } });
check(notOwner.ok, "(sanity) Tom's session works");

console.log("\nRemoving it:");
await jamie.page.goto(base + "/integrations", { waitUntil: "networkidle" });
await jamie.page.getByRole("button", { name: "Remove my key" }).click();
await jamie.page.waitForTimeout(1500);
await jamie.page.reload({ waitUntil: "networkidle" });
check(/platform's AI key \(Google Gemini\)/.test(await status(jamie.page)), "back to the platform key");
const exp = await (await fetch(base + "/api/export", { headers: { Cookie: await jamie.cookie() } })).text();
check(!/good-openai|good-claude|encrypted_key|encryptedKey/.test(exp), "backups never contain keys");

console.log(errors.length ? "\nBrowser errors:\n" + errors.join("\n") : "\nNo browser errors.");
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
