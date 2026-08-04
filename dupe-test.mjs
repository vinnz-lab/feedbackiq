/**
 * End-to-end duplicate detection against a locally running app.
 * Usage: node dupe-test.mjs
 */
const base = process.env.BASE || "http://localhost:4000";
const results = [];
const check = (n, ok, d = "") => {
  results.push([ok, n, d]);
  console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`);
};

const uid = (await (await fetch(base + "/login")).text()).match(
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
)[0];
const cookie = `fiq_uid=${uid}`;

async function ingest(paste, force = false) {
  const res = await fetch(base + "/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ paste, force }),
  });
  return res.json();
}

const text = `Exports keep timing out on large boards, roughly ${Date.now()} rows.`;

console.log("\nDuplicate detection:");

const first = await ingest(text);
check("first import is accepted", first.totalItems === 1, JSON.stringify(first.sources?.[0]?.status));

const second = await ingest(text);
const dup = second.sources?.[0];
check("second identical import is skipped", second.totalItems === 0, `totalItems=${second.totalItems}`);
check("it is flagged as a duplicate", dup?.duplicate === true);
check("it explains where it came from", /already imported/i.test(dup?.note ?? ""), dup?.note);

// Trivial reformatting must not defeat it.
const reformatted = await ingest("  " + text.replace(/ /g, "  ").toUpperCase() + "\n\n");
check(
  "reformatted copy is still caught",
  reformatted.totalItems === 0,
  `totalItems=${reformatted.totalItems}`,
);

// A deliberate override must still work — needed after a parser fix.
const forced = await ingest(text, true);
check("explicit override imports anyway", forced.totalItems === 1, `totalItems=${forced.totalItems}`);

// Genuinely new content must still get in.
const fresh = await ingest(text + " Also dark mode please.");
check("genuinely new content is accepted", fresh.totalItems === 1);

const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
