/**
 * Tests spreadsheet column detection against the shapes that broke it.
 *
 * The live failure: a sheet with a "Feedback ID" column imported every row as a
 * bare row number, because the old heuristic took the first header matching
 * /feedback/ without ever looking at the column's contents.
 *
 * Run: npx tsx scripts/parse-test.ts
 */
async function main() {
  const { pickColumns, rowsToItems } = await import("../src/lib/ingest/parse.ts");

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (name: string, ok: boolean, detail = "") =>
    (ok ? pass : fail).push(`${name}${detail ? " — " + detail : ""}`);

  // --- 1. The exact failure: "Feedback ID" must not win over "Feedback". ---
  const withIdCol = Array.from({ length: 12 }, (_, i) => ({
    "Feedback ID": String(i + 1),
    Date: "2026-05-14",
    Customer: "Northgate Logistics",
    Submitter: "R. Kowalski",
    Feedback: "The board takes nearly ten seconds to load once we pass two hundred cards.",
    Severity: "High",
  }));
  const a = pickColumns(withIdCol);
  check('"Feedback ID" does not win over "Feedback"', a.textCol === "Feedback", `picked "${a.textCol}"`);
  check("customer column still detected", a.customerCol === "Customer", `picked "${a.customerCol}"`);
  check("submitter column still detected", a.submitterCol === "Submitter", `picked "${a.submitterCol}"`);
  check("date column still detected", a.dateCol === "Date", `picked "${a.dateCol}"`);
  check("confident mapping", a.uncertain === false);

  // --- 2. No obvious header name: pick the prose column by content. ---
  const noNiceHeaders = Array.from({ length: 10 }, (_, i) => ({
    Ref: `R-${i}`,
    Who: "Sarah Kim",
    Body: "Exporting a large board to CSV times out and support suggested off-hours.",
    Score: "4",
  }));
  const b = pickColumns(noNiceHeaders);
  check("falls back to the prose column", b.textCol === "Body", `picked "${b.textCol}"`);

  // --- 3. Numeric column must never be chosen even if named invitingly. ---
  const numericTrap = Array.from({ length: 10 }, (_, i) => ({
    "Comment No": String(100 + i),
    Notes: "Notifications fire for every card I have ever touched and cannot be muted.",
  }));
  const c = pickColumns(numericTrap);
  check("numeric column rejected", c.textCol === "Notes", `picked "${c.textCol}"`);

  // --- 4. Rows convert with real text, not row numbers. ---
  const { items, mapping, uncertain } = rowsToItems(withIdCol);
  check("items carry real prose", items.every((i) => i.quote.length > 20), `first: "${items[0]?.quote.slice(0, 40)}…"`);
  check("no item is a bare number", !items.some((i) => /^\d+$/.test(i.quote)));
  check("mapping is reported", mapping === "Feedback", `mapping="${mapping}"`);
  check("provenance preserved", items[0]?.customer === "Northgate Logistics" && !!items[0]?.rowRef);
  check("not flagged uncertain", uncertain === false);

  // --- 5. A genuinely ambiguous sheet SHOULD be flagged. ---
  const ambiguous = Array.from({ length: 8 }, (_, i) => ({
    A: String(i),
    B: String(i * 2),
    C: "ok",
  }));
  const d = pickColumns(ambiguous);
  check("ambiguous sheet flagged uncertain", d.uncertain === true, `textCol="${d.textCol}"`);

  console.log("\nPASS:");
  pass.forEach((p) => console.log("  ✓ " + p));
  if (fail.length) {
    console.log("\nFAIL:");
    fail.forEach((f) => console.log("  ✗ " + f));
  }
  console.log(`\n${pass.length}/${pass.length + fail.length} checks passed`);
  process.exit(fail.length ? 1 : 0);
}
main();
