/**
 * Tests content fingerprinting for duplicate detection.
 *
 * Why this matters: a theme's mention count drives the roadmap score, so
 * importing the same transcript twice makes every point in it look twice as
 * corroborated and silently reorders the roadmap around phantom demand.
 *
 * Run: npx tsx scripts/fingerprint-test.ts
 */
async function main() {
  const { fingerprint, shortFingerprint } = await import("../src/lib/ingest/fingerprint.ts");

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

  const transcript = "[00:00:19] Raj Patel: The board takes ten seconds to load.";

  // --- identical content -------------------------------------------------
  check("identical text matches", fingerprint(transcript) === fingerprint(transcript));

  // --- a renamed file is still the same content --------------------------
  // (filename never enters the hash, which is the whole point)
  const asBuffer = Buffer.from(transcript, "utf8");
  check("same bytes match regardless of filename", fingerprint(asBuffer) === fingerprint(asBuffer));

  // --- trivial reformatting must NOT defeat detection --------------------
  check(
    "differing line endings still match",
    fingerprint("line one\nline two") === fingerprint("line one\r\nline two"),
  );
  check(
    "trailing whitespace still matches",
    fingerprint(transcript) === fingerprint(transcript + "\n\n   "),
  );
  check(
    "collapsed inner whitespace still matches",
    fingerprint("a  b   c") === fingerprint("a b c"),
  );
  check(
    "case differences still match",
    fingerprint("Dark Mode Please") === fingerprint("dark mode please"),
  );

  // --- genuinely different content must NOT match ------------------------
  check(
    "different feedback does not match",
    fingerprint(transcript) !== fingerprint(transcript + " And exports time out."),
  );
  check("empty vs content differ", fingerprint("") !== fingerprint(transcript));
  check(
    "a single changed word is detected",
    fingerprint("takes ten seconds") !== fingerprint("takes nine seconds"),
  );

  // --- shape --------------------------------------------------------------
  check("hash is hex sha256 (64 chars)", /^[0-9a-f]{64}$/.test(fingerprint(transcript)));
  check("short form is 12 chars", shortFingerprint(fingerprint(transcript)).length === 12);

  // --- binary (audio) files ----------------------------------------------
  const audioA = Buffer.from([0x49, 0x44, 0x33, 0x01, 0x02, 0x03]);
  const audioB = Buffer.from([0x49, 0x44, 0x33, 0x01, 0x02, 0x04]);
  check("identical audio bytes match", fingerprint(audioA) === fingerprint(Buffer.from(audioA)));
  check("differing audio bytes do not match", fingerprint(audioA) !== fingerprint(audioB));

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
