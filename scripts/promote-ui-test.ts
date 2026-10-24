// Run: npx tsx scripts/promote-ui-test.ts
import { readFileSync } from "node:fs";
const r = (p: string) => readFileSync(p, "utf8");
const card = r("src/components/theme-card.tsx");
const themes = r("src/app/(app)/themes/page.tsx");
const road = r("src/app/(app)/roadmap/page.tsx");
const chip = r("src/components/promote-chip.tsx");
const linkBlock = card.slice(card.indexOf("<Link href={`/themes/"), card.indexOf("</Link>"));
const checks: [string, boolean][] = [
  ["promote button is NOT nested inside the card link", !linkBlock.includes("PromoteChip")],
  ["card renders the promote chip", /<PromoteChip themeId=\{theme\.id\}/.test(card)],
  ["themes page tells each card if it is already on the roadmap", /onRoadmap=\{onRoadmap\.has\(t\.id\)\}/.test(themes)],
  ["chip uses the existing idempotent promote action", /promoteThemeToEnhancement\(themeId\)/.test(chip)],
  ["chip shows 'On roadmap' once added", /On roadmap/.test(chip)],
  ["chip reports failures instead of hiding them", /setError\(/.test(chip)],
  ["empty roadmap explains what to do", /No roadmap items yet/.test(road) && /href="\/themes"/.test(road)],
];
let fail = 0;
for (const [n, ok] of checks) { console.log((ok ? "✓ " : "✗ ") + n); if (!ok) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} passed`);
process.exit(fail ? 1 : 0);
