// Run: npx tsx scripts/roadmap-scores-test.ts
import { readFileSync } from "node:fs";
const r = (p: string) => readFileSync(p, "utf8");
const act = r("src/app/(app)/roadmap/actions.ts");
const page = r("src/app/(app)/roadmap/page.tsx");
const ed = r("src/components/score-editor.tsx");
const checks: [string, boolean][] = [
  ["promotion no longer hardcodes benefit 6 / effort 5", !/benefit: 6,\s*effort: 5/.test(act)],
  ["promotion uses the feedback-based estimate", /estimateForTheme\(wsId, themeId\)/.test(act)],
  ["manual edit clamps to 1–10 whole numbers", /Math\.min\(10, Math\.max\(1, Math\.round/.test(act)],
  ["manual edit requires a workspace member", /updateEnhancementEstimates[\s\S]*?requireWorkspace\(\)/.test(act)],
  ["re-estimate requires a workspace member", /reestimateEnhancement[\s\S]*?requireWorkspace\(\)/.test(act)],
  ["roadmap table has editable scores", /<ScoreEditor id=\{e\.id\}/.test(page)],
  ["editor saves on blur, not on every keystroke", /onBlur=/.test(ed) && !/onChange=\{\(ev\) => save/.test(ed)],
  ["editor offers re-estimate", /reestimateEnhancement\(id\)/.test(ed)],
];
let fail = 0;
for (const [n, ok] of checks) { console.log((ok ? "✓ " : "✗ ") + n); if (!ok) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} passed`);
process.exit(fail ? 1 : 0);
