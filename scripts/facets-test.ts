// Run: npx tsx scripts/facets-test.ts
import { deriveFacets } from "../src/lib/facets.ts";
let fail = 0;
const check = (n: string, ok: boolean, d = "") => { console.log((ok ? "✓ " : "✗ ") + n + (d ? "  (" + d + ")" : "")); if (!ok) fail++; };
const it = (type: string | null, sentiment: string | null, severity: string | null) => ({ type, sentiment, severity });

const bugs = deriveFacets([it("Bug", "Negative", "High"), it("Bug", "Negative", "High"), it("Feature", "Neutral", "Low")]);
check("most common type wins", bugs.type === "Bug");
check("most common sentiment wins", bugs.sentiment === "Negative");
check("most common severity wins", bugs.priority === "High");
check("tie in sentiment favours the worse one", deriveFacets([it("UX", "Positive", null), it("UX", "Negative", null)]).sentiment === "Negative");
check("tie in type is deterministic (Bug before Feature)", deriveFacets([it("Feature", null, null), it("Bug", null, null)]).type === "Bug");
const none = deriveFacets([]);
check("no feedback => no tags (not made up)", none.type === null && none.sentiment === null && none.priority === null);
const partial = deriveFacets([it(null, null, null), it("Praise", "Positive", null)]);
check("missing values are skipped", partial.type === "Praise" && partial.sentiment === "Positive" && partial.priority === null);
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
