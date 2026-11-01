/**
 * Spreadsheet reading is safe for files from OTHER people (testers, clients).
 * Run: npx tsx scripts/xlsx-safety-test.ts
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

async function main() {
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
  const [maj, min, pat] = XLSX.version.split(".").map(Number);
  check(`SheetJS is a fixed version (≥ 0.20.2 fixes both CVEs) — running ${XLSX.version}`, maj > 0 || min > 20 || (min === 20 && pat >= 2));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  check("it comes from the official SheetJS server, not a third-party copy", /^https:\/\/cdn\.sheetjs\.com\/xlsx-0\.20\.\d+\/xlsx-0\.20\.\d+\.tgz$/.test(pkg.dependencies.xlsx), pkg.dependencies.xlsx);
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  check("the lockfile pins it with an integrity hash", /^sha512-/.test(lock.packages["node_modules/xlsx"]?.integrity ?? ""));

  const { parseFile } = await import("../src/lib/ingest/parse.ts");

  // A normal .xlsx, built the way Excel would save it.
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Feedback", "Customer", "Date"],
    ["Board loading is slow on big projects", "Acme", "2026-10-01"],
    ["Please add dark mode", "Globex", "2026-10-02"],
    ["", "", ""],
    ["Export to Excel drops the colours", "Initech", "2026-10-03"],
  ]), "Survey");
  const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  const parsed = await parseFile("survey.xlsx", buf);
  check("a normal .xlsx still imports every row", parsed.items.length === 3, `${parsed.items.length} items`);
  check("…with the customer picked up", parsed.items.some((i) => i.customer === "Globex"));

  // Hostile file 1: column names that try to tamper with JavaScript objects.
  const evil = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(evil, XLSX.utils.aoa_to_sheet([
    ["__proto__", "constructor", "Feedback"],
    ["{\"polluted\":true}", "x", "Ordinary feedback text here"],
  ]), "Sheet1");
  const before = ({} as Record<string, unknown>).polluted;
  await parseFile("evil.xlsx", Buffer.from(XLSX.write(evil, { type: "buffer", bookType: "xlsx" })));
  check("a file with __proto__ / constructor headers doesn't tamper with the app", before === undefined && ({} as Record<string, unknown>).polluted === undefined && (Object.prototype as Record<string, unknown>).polluted === undefined);

  // Hostile file 2: junk that isn't a spreadsheet at all, and a huge cell.
  const junk = Buffer.from("PK\u0003\u0004" + "garbage".repeat(5000));
  const t0 = Date.now();
  let junkItems = 0;
  try { junkItems = (await parseFile("broken.xlsx", junk)).items.length; } catch { junkItems = 0; }
  check("a corrupt file imports nothing, and fails quickly instead of hanging the server", junkItems === 0 && Date.now() - t0 < 5000, `${junkItems} items, ${Date.now() - t0}ms`);
  const long = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(long, XLSX.utils.aoa_to_sheet([["Feedback"], ["a".repeat(30000) + "!"]]), "S");
  const t1 = Date.now();
  await parseFile("long.xlsx", Buffer.from(XLSX.write(long, { type: "buffer", bookType: "xlsx" })));
  check("a file with a very long cell reads quickly", Date.now() - t1 < 5000, `${Date.now() - t1}ms`);

  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
