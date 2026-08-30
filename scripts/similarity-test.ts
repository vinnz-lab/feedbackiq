/**
 * Tests near-duplicate theme detection.
 *
 * Written around the two failure modes, which are NOT symmetrical:
 *  - a missed duplicate just leaves a theme for the review pass to catch;
 *  - a FALSE merge silently and permanently destroys a distinct theme.
 * So the "must NOT merge" cases matter more than the "should merge" ones, and
 * the real pairs from the user's own 36 themes are used as the fixtures.
 *
 * Run: npx tsx scripts/similarity-test.ts
 */
async function main() {
  const { titleSimilarity, findSimilarTitle, AUTO_MERGE_THRESHOLD, titleTokens } = await import(
    "../src/lib/themes/similarity.ts"
  );

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

  const sim = (a: string, b: string) => titleSimilarity(a, b);
  const merges = (a: string, b: string) => sim(a, b) >= AUTO_MERGE_THRESHOLD;

  // --- SHOULD merge: the same thing worded differently --------------------
  const shouldMerge: [string, string][] = [
    ["Slow Board Loading Time", "Slow Board Loading"],
    ["Dark Mode Support", "Dark Mode"],
    ["Export to Excel", "Excel Export"],
    ["Keyboard Shortcuts Support", "Keyboard Shortcuts"],
    ["Mobile App Crash Issues", "Mobile App Crashes"],
    ["Notification Overload", "Notifications Overload"],
    ["PDF Export Formatting Issues", "PDF Export Formatting"],
    ["Two-Way Slack Integration", "Two Way Slack Integration"],
  ];
  for (const [a, b] of shouldMerge) {
    check(`merges: "${a}" ≈ "${b}"`, merges(a, b), sim(a, b).toFixed(2));
  }

  // --- MUST NOT merge: genuinely distinct themes -------------------------
  // These are the dangerous ones. Every pair below is real from the user's data.
  const mustNotMerge: [string, string][] = [
    ["Mobile App Crash Issues", "Mobile App Comment Mentions"],
    ["Dashboard Drill-Down Functionality", "Dashboard Widget Customization Options"],
    ["Slow Board Loading Time", "Project View Filtering Performance"],
    ["Teams Integration Connection Issues", "Two-Way Slack Integration"],
    ["Scheduled Report Email Delivery", "Granular Notification Preference Settings"],
    ["Export to Excel", "PDF Export Formatting Issues"],
    ["Onboarding Setup Wizard Guidance", "Native Automation Rules Engine"],
    ["Dark Mode Support", "Keyboard Shortcuts Support"],
    ["Commenting And Mentions Experience", "Mobile App Comment Mentions"],
  ];
  for (const [a, b] of mustNotMerge) {
    check(`keeps apart: "${a}" vs "${b}"`, !merges(a, b), sim(a, b).toFixed(2));
  }

  // --- normalisation ------------------------------------------------------
  check("identical titles score 1", sim("Dark Mode", "Dark Mode") === 1);
  check("case is ignored", sim("DARK MODE", "dark mode") === 1);
  check("punctuation is ignored", sim("Two-Way Sync", "Two Way Sync") === 1);
  check(
    "filler words do not create false matches",
    !merges("Export Issues", "Import Issues"),
    sim("Export Issues", "Import Issues").toFixed(2),
  );
  check(
    "noise words alone are not a match",
    !merges("General Issues", "Feature Requests"),
    sim("General Issues", "Feature Requests").toFixed(2),
  );
  check("plural and singular unify", titleTokens("Crashes").has("crash"));
  check("unrelated titles score 0", sim("Dark Mode", "Slow Exports") === 0);

  // --- picking the BEST match, not the first -----------------------------
  const existing = [
    { id: "a", title: "Slow Loading" },
    { id: "b", title: "Slow Board Loading Time" },
    { id: "c", title: "Dark Mode" },
  ];
  const hit = findSimilarTitle("Slow Board Loading", existing);
  check("returns the closest match, not the first", hit?.id === "b", `picked ${hit?.id} (${hit?.similarity?.toFixed(2)})`);
  check("returns null when nothing is close", findSimilarTitle("Billing Invoices", existing) === null);
  check(
    "reports the similarity it matched on",
    typeof findSimilarTitle("Dark Mode Support", existing)?.similarity === "number",
  );

  // --- threshold sanity ---------------------------------------------------
  check(
    "threshold is conservative",
    AUTO_MERGE_THRESHOLD >= 0.65,
    `${AUTO_MERGE_THRESHOLD} — a silent false merge is worse than a missed one`,
  );

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
