import { createHash } from "node:crypto";

/**
 * Duplicate detection for imported feedback.
 *
 * Why this matters beyond tidiness: a theme's mention count drives the roadmap
 * score, so importing the same call transcript twice makes every point in it
 * look twice as corroborated and silently reorders the roadmap around phantom
 * demand. Duplicated evidence is worse than missing evidence, because it reads
 * as agreement.
 *
 * Two layers, because neither alone is enough:
 *
 *  1. SOURCE fingerprint — cheap early exit when the identical file is
 *     uploaded again. Catches the common case before any AI credits are spent.
 *
 *  2. QUOTE keys — the real safety net. A weekly spreadsheet export gains rows
 *     each week, so its file fingerprint changes every time even though most
 *     rows were already imported. Only comparing the feedback itself catches
 *     that, and it also covers sources imported before fingerprinting existed.
 */

/** Kept in step with the rawText slice stored on sources, so a fingerprint can
 *  be reconstructed for older sources that predate this feature. */
export const HASH_SLICE = 20_000;

function sha256(s: string | Buffer | Uint8Array): string {
  const h = createHash("sha256");
  if (typeof s === "string") h.update(s, "utf8");
  else h.update(s);
  return h.digest("hex");
}

/** Lower-cased, whitespace-collapsed. Trivial reformatting must not defeat a
 *  comparison: a re-export with different line endings is the same feedback. */
export function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Fingerprint for text-bearing sources (transcripts, emails, notes,
 * spreadsheets, pasted text). Deliberately hashes the extracted TEXT rather
 * than the raw bytes, so the same content still matches after a re-export and
 * so older sources can be back-filled from their stored text.
 */
export function fingerprintText(text: string): string {
  return sha256(normalise(text).slice(0, HASH_SLICE));
}

/** Fingerprint for binary sources (audio/video), where there is no text yet. */
export function fingerprintBytes(bytes: Buffer | Uint8Array): string {
  return sha256(bytes);
}

/**
 * Comparison key for an individual feedback item.
 *
 * Only applied to substantial quotes. Two customers independently writing
 * "please add dark mode" is genuine corroboration and must NOT be collapsed;
 * two identical long verbatim sentences are a re-import, not a coincidence.
 */
export const MIN_DEDUPE_CHARS = 40;

export function quoteKey(quote: string): string | null {
  const n = normalise(quote);
  return n.length >= MIN_DEDUPE_CHARS ? sha256(n) : null;
}

/** Short, human-readable form for notes and logs. */
export function shortFingerprint(hash: string): string {
  return hash.slice(0, 12);
}
