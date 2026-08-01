/**
 * Tests transcript-splitting logic: chunking, response normalisation, dedupe
 * and provenance. Stubs global fetch so it needs no API key.
 *
 * Run: npx tsx scripts/extract-test.ts
 */
async function main() {
  process.env.GEMINI_RPM = "600"; // keep pacing out of the way
  process.env.GEMINI_API_KEY = "test-key";

  const { chunkText, normaliseItems, extractFeedbackItems, SPLIT_THRESHOLD_CHARS } = await import(
    "../src/lib/ai/extract.ts"
  );

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

  // --- chunking -----------------------------------------------------------
  const short = "one line\ntwo line";
  check("short text is a single chunk", chunkText(short).length === 1);

  const long = Array.from({ length: 2000 }, (_, i) => `[00:0${i % 10}] Speaker: line ${i}`).join("\n");
  const chunks = chunkText(long, 5000);
  check("long text is chunked", chunks.length > 1, `${chunks.length} chunks`);
  check("chunks respect the size budget", chunks.every((c) => c.length <= 5000 + 200));
  check("no content is lost", chunks.join("\n").length >= long.length - chunks.length);
  check("lines are never cut mid-way", chunks.every((c) => !c.startsWith(" ")));

  // --- normalisation ------------------------------------------------------
  const raw = {
    items: [
      {
        quote: "The board takes nearly ten seconds to load once we pass two hundred cards.",
        speaker: "Raj Patel",
        timestampLabel: "00:00:19",
        type: "Bug",
        sentiment: "Negative",
        severity: "High",
        confidence: "High",
        theme: "Board Performance",
      },
      // duplicate of the first — must be dropped
      {
        quote: "The board takes nearly ten seconds to load once we pass two hundred cards.",
        speaker: "Raj Patel",
        type: "Bug",
        sentiment: "Negative",
        severity: "High",
        confidence: "High",
        theme: "Board Performance",
      },
      // junk: too short to be feedback
      { quote: "ok", type: "Praise", sentiment: "Positive" },
      // invalid enums must fall back rather than corrupt the row
      {
        quote: "Could we please get a dark mode for the reporting screen?",
        speaker: null,
        timestampLabel: null,
        type: "NotAType",
        sentiment: "Purple",
        severity: "Critical",
        confidence: "Absolute",
        theme: "Dark Mode",
      },
      // string "null" must become a real null
      { quote: "The Teams integration drops its connection about once a week.", speaker: "null", theme: "Integrations" },
    ],
  };
  const items = normaliseItems(raw);
  check("duplicates dropped", items.length === 3, `${items.length} items`);
  check("junk entry dropped", !items.some((i) => i.quote === "ok"));
  check("speaker preserved", items[0].speaker === "Raj Patel");
  check("timestamp preserved", items[0].timestampLabel === "00:00:19");
  check("invalid type falls back", items[1].type === "Feature", `got ${items[1].type}`);
  check("invalid sentiment falls back", items[1].sentiment === "Neutral", `got ${items[1].sentiment}`);
  check("invalid severity falls back", items[1].severity === "Medium", `got ${items[1].severity}`);
  check('string "null" becomes null', items[2].speaker === null);
  check("theme carried through", items[0].theme === "Board Performance");

  // --- end-to-end with a stubbed model ------------------------------------
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount++;
    const payload = {
      items: [
        { quote: `Point ${callCount} about slow exports timing out on big boards.`, type: "Bug", sentiment: "Negative", severity: "High", confidence: "High", theme: "Export Reliability" },
      ],
    };
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof globalThis.fetch;

  const out = await extractFeedbackItems(long, ["Export Reliability"], ["Reporting"]);
  check("multi-chunk transcript yields items", out.length > 0, `${out.length} items from ${callCount} calls`);
  check("one model call per chunk", callCount === chunkText(long).length, `${callCount} calls`);

  // --- the economics that justify this design -----------------------------
  const oneTranscript = "x".repeat(9000);
  check(
    "a typical transcript is ONE call, not one per point",
    chunkText(oneTranscript).length === 1,
    "split+classify in a single request",
  );
  check("threshold excludes ordinary items", SPLIT_THRESHOLD_CHARS > 500);

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
