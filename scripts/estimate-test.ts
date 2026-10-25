// Run: npx tsx scripts/estimate-test.ts
import { estimateBenefitEffort } from "../src/lib/estimate.ts";
import { computeScore } from "../src/lib/score.ts";
let fail = 0;
const check = (n: string, ok: boolean, d = "") => { console.log((ok ? "✓ " : "✗ ") + n + (d ? "  (" + d + ")" : "")); if (!ok) fail++; };
const item = (type: string | null, sentiment: string | null = "Neutral", severity: string | null = "Medium") => ({ type, sentiment, severity });

const bug = estimateBenefitEffort({ items: [item("Bug", "Negative", "High"), item("Bug", "Negative", "High")], demand: 2 });
const feat = estimateBenefitEffort({ items: [item("Feature"), item("Feature")], demand: 1 });
check("bugs estimate smaller effort than features", bug.effort < feat.effort, `${bug.effort} vs ${feat.effort}`);
check("many people + negative + high severity => higher benefit", bug.benefit > feat.benefit, `${bug.benefit} vs ${feat.benefit}`);
const big = estimateBenefitEffort({ items: [item("UX")], demand: 50 });
check("demand contribution is capped (no runaway benefit)", big.benefit <= 10 && big.benefit <= 8, `${big.benefit}`);
const none = estimateBenefitEffort({ items: [], demand: 0 });
check("no items gives sane defaults, not NaN", Number.isFinite(none.benefit) && Number.isFinite(none.effort) && none.effort === 5, JSON.stringify(none));
const spread = [item("Bug"), item("Feature"), item("UX"), item("Praise"), item("Question")];
const mixed = estimateBenefitEffort({ items: spread, demand: 5 });
check("values always integers 1–10", [mixed.benefit, mixed.effort].every((v) => Number.isInteger(v) && v >= 1 && v <= 10));
const sA = computeScore(bug.benefit, bug.effort, 2), sB = computeScore(feat.benefit, feat.effort, 1);
check("different items now get different scores", sA !== sB, `${sA} vs ${sB}`);
check("reason explains the number", /2 people raised it/.test(bug.reason), bug.reason);
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
