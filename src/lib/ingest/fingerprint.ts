import { createHash } from "node:crypto";

/**
 * Content fingerprinting, so the same feedback can't be imported twice.
 *
 * Why this matters beyond tidiness: a theme's mention count drives the roadmap
 * score. Import the same call transcript twice and every point in it appears to
 * have been raised by twice as many people, so the roadmap silently reorders
 * around phantom demand. Duplicated evidence is worse than missing evidence,
 * because it looks like corroboration.
 *
 * Hashing the CONTENT rather than the filename means a renamed copy
 * ("transcript.txt" → "transcript (1).txt") is still recognised.
 */
export function fingerprint(input: Buffer | Uint8Array | string): string {
  const h = createHash("sha256");
  if (typeof input === "string") {
    // Normalise whitespace and case so trivial edits (a re-export with
    // different line endings, or trailing blank lines) still match.
    h.update(input.replace(/\s+/g, " ").trim().toLowerCase(), "utf8");
  } else {
    h.update(input);
  }
  return h.digest("hex");
}

/** Short, human-readable form for notes and logs. */
export function shortFingerprint(hash: string): string {
  return hash.slice(0, 12);
}
