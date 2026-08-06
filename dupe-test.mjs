/**
 * End-to-end duplicate detection.
 *
 * Includes the case that actually escaped in production: a source imported
 * BEFORE fingerprinting existed has no stored hash, so the check had nothing to
 * compare against and let the re-upload through.
 *
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

const stamp = Date.now();
const long = (s) => `${s} — reported during the quarterly review on ${stamp}, needs attention.`;

console.log("\nSource-level:");
const a1 = await ingest(long("Exports keep timing out on large boards"));
check("first import accepted", a1.totalItems === 1);

const a2 = await ingest(long("Exports keep timing out on large boards"));
check("identical re-import skipped", a2.totalItems === 0, `totalItems=${a2.totalItems}`);
check("flagged as duplicate", a2.sources?.[0]?.duplicate === true);

const a3 = await ingest("   " + long("Exports keep timing out on large boards").toUpperCase() + "\n\n");
check("reformatted copy still caught", a3.totalItems === 0, `totalItems=${a3.totalItems}`);

console.log("\nItem-level (the real weekly-export case):");
// Pasting makes ONE item, so a multi-row file is needed to exercise this.
async function uploadCsv(name, rows) {
  const csv = "Feedback,Customer\n" + rows.map((r) => `"${r}","Acme"`).join("\n");
  const fd = new FormData();
  fd.append("files", new File([csv], name, { type: "text/csv" }));
  const res = await fetch(base + "/api/ingest", { method: "POST", headers: { Cookie: cookie }, body: fd });
  return res.json();
}

const week1 = [long("Board filtering feels frozen"), long("PDF export loses all colour")];
const c1 = await uploadCsv("week1.csv", week1);
check("first export imports every row", c1.totalItems === 2, `totalItems=${c1.totalItems}`);

// Same two rows plus a new one — a different file, so the source fingerprint
// will NOT match. Only item-level comparison can catch the repeats.
const c2 = await uploadCsv("week2.csv", [...week1, long("Search ignores hyphenated codes")]);
check(
  "grown export imports ONLY the new row",
  c2.totalItems === 1,
  `totalItems=${c2.totalItems} (expected 1 new, 2 skipped)`,
);
check("it explains what was skipped", /already imported/i.test(c2.sources?.[0]?.note ?? ""), c2.sources?.[0]?.note);

console.log("\nGuards:");
// Short generic phrases must NOT be collapsed — two people can legitimately
// both say "add dark mode", and that is genuine corroboration.
// Stamped so repeated runs against the same database stay independent.
const s1 = await ingest(`dark mode ${stamp}`);
const s2 = await ingest(`dark mode ${stamp} soon`);
check("short distinct phrases both kept", s1.totalItems === 1 && s2.totalItems === 1);

const forced = await ingest(long("Exports keep timing out on large boards"), true);
check("explicit override still imports", forced.totalItems === 1, `totalItems=${forced.totalItems}`);

const fresh = await ingest(long("Search ignores hyphenated product codes"));
check("genuinely new feedback accepted", fresh.totalItems === 1);

const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
