// Run: npx tsx scripts/merge-title-test.ts
import { readFileSync } from "node:fs";
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const ui = strip(readFileSync("src/components/consolidate-themes.tsx", "utf8"));
const act = strip(readFileSync("src/app/(app)/themes/consolidate-actions.ts", "utf8"));
const checks: [string, boolean][] = [
  ["each proposal has an editable name box", /<input\s[\s\S]*?value=\{title\}/.test(ui)],
  ["the box starts from the AI's proposal", /titles\[key\] \?\? g\.canonicalTitle/.test(ui)],
  ["merge sends the EDITED name, not the original", /applyMerge\(g\.themeIds, title\.trim\(\)\)/.test(ui) && !/applyMerge\(g\.themeIds, g\.canonicalTitle\)/.test(ui)],
  ["Merge button is disabled for an empty or too-long name", /disabled=\{applying !== null \|\| !titleOk\}/.test(ui)],
  ["server rejects an empty name too (form check is bypassable)", /if \(!name\) return \{ ok: false/.test(act)],
  ["server rejects an over-long name", /name\.length > 100/.test(act)],
  ["edits are cleared on a fresh review", /setTitles\(\{\}\)/.test(ui)],
  ["merge is still never given feedback-deleting power", !/delete\(schema\.feedbackItems\)/.test(act)],
];
let fail = 0;
for (const [n, ok] of checks) { console.log((ok ? "✓ " : "✗ ") + n); if (!ok) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} passed`);
process.exit(fail ? 1 : 0);
