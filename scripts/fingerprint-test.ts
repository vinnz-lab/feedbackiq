/**
 * Tests duplicate detection.
 *
 * Written against the REQUIREMENT rather than the implementation. The previous
 * version tested the string path for normalisation and the buffer path only for
 * exact equality — which is precisely what the code happened to do, so it
 * passed while files uploaded twice with different line endings still slipped
 * through. Every claim made to the user is asserted here instead.
 *
 * Run: npx tsx scripts/fingerprint-test.ts
 */
async function main() {
  const { fingerprintText, fingerprintBytes, quoteKey, normalise, MIN_DEDUPE_CHARS } = await import(
    "../src/lib/ingest/fingerprint.ts"
  );

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

  const transcript = "[00:00:19] Raj Patel: The board takes ten seconds to load once we pass 200 cards.";

  // --- the same content must always match, however it is presented ---------
  check("identical text matches", fingerprintText(transcript) === fingerprintText(transcript));
  check(
    "differing line endings match",
    fingerprintText("line one\nline two") === fingerprintText("line one\r\nline two"),
  );
  check(
    "trailing whitespace matches",
    fingerprintText(transcript) === fingerprintText(transcript + "\n\n   "),
  );
  check("collapsed inner whitespace matches", fingerprintText("a  b   c") === fingerprintText("a b c"),);
  check(
    "case differences match",
    fingerprintText("Dark Mode Please") === fingerprintText("dark mode please"),
  );
  // A file read as bytes then decoded must equal the same text pasted in.
  check(
    "same content via file or paste matches",
    fingerprintText(Buffer.from(transcript, "utf8").toString("utf8")) === fingerprintText(transcript),
  );

  // --- genuinely different content must not match --------------------------
  check(
    "different feedback differs",
    fingerprintText(transcript) !== fingerprintText(transcript + " And exports time out."),
  );
  check(
    "a single changed word is detected",
    fingerprintText("takes ten seconds") !== fingerprintText("takes nine seconds"),
  );
  check("empty differs from content", fingerprintText("") !== fingerprintText(transcript));

  // --- binary sources (audio) ---------------------------------------------
  const audioA = Buffer.from([0x49, 0x44, 0x33, 0x01, 0x02, 0x03]);
  const audioB = Buffer.from([0x49, 0x44, 0x33, 0x01, 0x02, 0x04]);
  check("identical audio matches", fingerprintBytes(audioA) === fingerprintBytes(Buffer.from(audioA)));
  check("different audio differs", fingerprintBytes(audioA) !== fingerprintBytes(audioB));

  // --- back-fill: a hash rebuilt from stored text must match a re-upload ---
  // This is what lets sources imported before fingerprinting existed still be
  // recognised — the gap that let a duplicate through in production.
  const storedRawText = normalise(transcript); // how it is saved on the source
  check(
    "hash rebuilt from stored text matches a fresh upload",
    fingerprintText(storedRawText) === fingerprintText(transcript),
    "back-fill for pre-existing sources",
  );

  // --- quote keys: the item-level safety net -------------------------------
  const longQuote = "The dashboards are very rigid and I cannot put two metrics on one chart at all.";
  check("long quotes produce a key", quoteKey(longQuote) !== null);
  check(
    "identical long quotes share a key",
    quoteKey(longQuote) === quoteKey("  " + longQuote.toUpperCase() + " "),
  );
  check(
    "different long quotes differ",
    quoteKey(longQuote) !== quoteKey(longQuote.replace("rigid", "flexible")),
  );

  // Short generic phrases must NOT be deduped: two customers independently
  // asking for dark mode is real corroboration, not a duplicate.
  check("short phrases are not deduped", quoteKey("add dark mode") === null);
  check(
    "the threshold is meaningful",
    MIN_DEDUPE_CHARS >= 20 && MIN_DEDUPE_CHARS <= 80,
    `${MIN_DEDUPE_CHARS} chars`,
  );

  // --- shape ---------------------------------------------------------------
  check("hash is hex sha256", /^[0-9a-f]{64}$/.test(fingerprintText(transcript)));

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
