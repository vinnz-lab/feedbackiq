/**
 * Near-duplicate theme titles.
 *
 * Theme matching used to be an exact lower-cased string comparison, so
 * "Slow Board Loading Time" and "Slow Board Loading" became two themes — which
 * is how 36 themes accumulated from a handful of transcripts. This catches that
 * class deterministically, before a new theme is created.
 *
 * Deliberately conservative: this runs WITHOUT human approval, so it must only
 * fire on titles that are obviously the same thing worded differently. Looser
 * judgement calls ("Slow Board Loading" vs "Filtering Performance" — arguably
 * both performance) are left to the AI consolidation pass, which a person
 * reviews before anything is merged.
 */

/** Words that carry no distinguishing meaning in a theme title. */
const NOISE = new Set([
  "a", "an", "the", "and", "or", "to", "of", "for", "in", "on", "with", "at", "by",
  "is", "are", "be", "issue", "issues", "problem", "problems", "support", "options",
  "option", "settings", "setting", "functionality", "feature", "features", "request",
  "requests", "improvement", "improvements", "general", "misc", "other",
]);

/** Light stemming: enough to equate plural and singular without a real stemmer. */
function stem(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** The meaning-bearing words of a title, normalised. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(stem)
      .filter((w) => !NOISE.has(w)),
  );
}

/** Jaccard overlap of the meaning-bearing words: 0 = unrelated, 1 = identical. */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * High on purpose. A false merge here happens silently and permanently, whereas
 * a missed one just leaves a duplicate for the review pass to catch — so the
 * asymmetry of the two mistakes sets the threshold, not the average case.
 */
export const AUTO_MERGE_THRESHOLD = 0.7;

/**
 * The existing theme an incoming title should reuse, or null to create a new one.
 * Returns the closest match above the threshold, so the best candidate wins
 * rather than whichever happened to be checked first.
 */
export function findSimilarTitle(
  title: string,
  existing: { id: string; title: string }[],
  threshold = AUTO_MERGE_THRESHOLD,
): { id: string; title: string; similarity: number } | null {
  let best: { id: string; title: string; similarity: number } | null = null;
  for (const e of existing) {
    const similarity = titleSimilarity(title, e.title);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { id: e.id, title: e.title, similarity };
    }
  }
  return best;
}
