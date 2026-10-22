// Run: npx tsx scripts/quote-preview-test.ts
// Importing the component file pulls in server actions; re-implement-free check
// by reading the exported helper source via dynamic extraction instead.
import { readFileSync } from "node:fs";
const src = readFileSync("src/components/review-card.tsx", "utf8");
const body = src.match(/export function previewQuote[\s\S]*?\n}\n/)![0].replace("export ", "").replace(/: string/g, "").replace(/: number/g, "");
const previewQuote = new Function("QUOTE_PREVIEW_CHARS", body + "; return previewQuote;")(280) as (q: string, m?: number) => string;
let fail = 0;
const check = (n: string, ok: boolean) => { console.log((ok ? "✓ " : "✗ ") + n); if (!ok) fail++; };
const short = "Boards load slowly.";
check("short quote untouched", previewQuote(short) === short);
const long = "word ".repeat(200).trim();
const p = previewQuote(long);
check("long quote shortened", p.length <= 280 && p.length < long.length);
check("cuts at a word boundary", long.startsWith(p) && (long[p.length] === " "));
check("preview is a true prefix (no content altered)", long.startsWith(p));
check("unbroken text still cut", previewQuote("x".repeat(1000)).length === 280);
check("component keeps full text when expanded", /expanded\s*\?\s*"Show less"/.test(src) && /: item\.quote\}/.test(src));
process.exit(fail ? 1 : 0);
