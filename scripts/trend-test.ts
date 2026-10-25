// Run: npx tsx scripts/trend-test.ts
import { computeTrend } from "../src/lib/trend.ts";
let fail = 0;
const check = (n: string, ok: boolean, d = "") => { console.log((ok ? "✓ " : "✗ ") + n + (d ? "  (" + d + ")" : "")); if (!ok) fail++; };
const now = new Date("2026-10-25T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

check("no feedback => nothing shown", computeTrend([], now).kind === "none");
check("only old feedback (3 weeks) => nothing shown", computeTrend([ago(21), ago(30)], now).kind === "none");
check("this week only => New, not 0%", JSON.stringify(computeTrend([ago(1), ago(2)], now)) === JSON.stringify({ kind: "new", thisWeek: 2 }));
const up = computeTrend([ago(1), ago(2), ago(3), ago(9)], now);
check("3 vs 1 => +200%", up.kind === "change" && up.pct === 200, JSON.stringify(up));
const down = computeTrend([ago(1), ago(8), ago(9), ago(10)], now);
check("1 vs 3 => -67%", down.kind === "change" && down.pct === -67, JSON.stringify(down));
const flat = computeTrend([ago(1), ago(9)], now);
check("1 vs 1 => 0% (real, measured)", flat.kind === "change" && flat.pct === 0);
check("last week only (this week quiet) => -100%", (() => { const t = computeTrend([ago(9), ago(10)], now); return t.kind === "change" && t.pct === -100; })());
check("future dates ignored", computeTrend([new Date(now.getTime() + 86_400_000)], now).kind === "none");
check("null / invalid dates ignored, no crash", computeTrend([null, "not a date", ago(1)], now).kind === "new");
check("boundary: exactly 7 days old counts as last week", (() => { const t = computeTrend([ago(7), ago(1)], now); return t.kind === "change" && t.lastWeek === 1; })());
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
