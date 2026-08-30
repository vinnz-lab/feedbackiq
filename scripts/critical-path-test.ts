/**
 * Guards the critical path of destructive actions.
 *
 * A merge commits in milliseconds, but the action used to then await
 * summarizeTheme() — a PACED, RETRYING Gemini call (6–20s between requests,
 * up to three attempts on a 429). The button sat on "Merging…" for a minute
 * while the data had already changed, so the user could not tell success from
 * failure and clicked again.
 *
 * The rule this enforces: a destructive action must confirm as soon as it is
 * durable, and must never block on an optional call. Checked structurally
 * because the symptom only appears in production, where an API key exists and
 * pacing is active — locally the call fails instantly and the bug hides.
 *
 * Run: npx tsx scripts/critical-path-test.ts
 */
import { readFileSync } from "node:fs";

const pass: string[] = [];
const fail: string[] = [];
const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

const read = (p: string) => readFileSync(p, "utf8");

/** Comments explain the code; they are not the code. Asserting over prose gives
 *  false positives — an explanation mentioning "Gemini" is not a Gemini call. */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

// --- the merge action must not touch the AI at all ----------------------
const consolidate = read("src/app/(app)/themes/consolidate-actions.ts");
const applyMerge = consolidate.slice(consolidate.indexOf("export async function applyMerge"));

check(
  "applyMerge does not call summarizeTheme",
  !/summarizeTheme/.test(codeOnly(applyMerge)),
  "an optional AI call must not sit in a destructive action's critical path",
);
check(
  "applyMerge does not call any Gemini helper",
  !/geminiJson|classifyItem|extractFeedbackItems|proposeThemeMerges|summarizeTheme/.test(
    codeOnly(applyMerge),
  ),
);
check(
  "it clears the stale summary instead",
  /summary: null/.test(applyMerge),
  "a missing summary is honest; a stale one is not",
);

// --- the confirmation has to be substantive ----------------------------
check("it reports how many items were kept", /itemsKept/.test(applyMerge));
check("it names the surviving theme", /survivorTitle/.test(applyMerge));
check(
  "the message promises nothing was deleted",
  /none deleted/i.test(applyMerge),
  "the user's stated constraint, echoed back to them",
);
check(
  "a repeat is reported as already-applied, not an error",
  /alreadyDone/.test(applyMerge) && /no longer exist/i.test(applyMerge),
);

// --- the UI must not let a second click through -------------------------
const ui = read("src/components/consolidate-themes.tsx");
check("the merge button guards against a double click", /if \(applying\) return/.test(ui));
check("other merge buttons are held while one runs", /disabled=\{applying !== null\}/.test(ui));
check("a failed merge is styled differently from a success", /rose-soft/.test(ui) && /emerald-soft/.test(ui));

// --- the same trap elsewhere -------------------------------------------
// Ingest is the other place a slow call could hide behind a data change.
const ingest = read("src/app/api/ingest/route.ts");
check(
  "ingest's AI work is only the transcription submit, not analysis",
  !/classifyItem|summarizeTheme|proposeThemeMerges/.test(codeOnly(ingest)),
);

console.log("\nPASS:");
pass.forEach((p) => console.log("  ✓ " + p));
if (fail.length) {
  console.log("\nFAIL:");
  fail.forEach((f) => console.log("  ✗ " + f));
}
console.log(`\n${pass.length}/${pass.length + fail.length} checks passed`);
process.exit(fail.length ? 1 : 0);
