/**
 * The Bug/Feature, sentiment and priority tags on a theme card, worked out from
 * the feedback behind the theme.
 *
 * Themes the AI creates are stored with only a title, so reading these tags from
 * the theme row left every real card blank. The feedback items always carry
 * them, so the card now reflects what people actually said.
 */
export type Facets = {
  type: string | null;
  sentiment: string | null;
  priority: string | null;
};

type Item = { type: string | null; sentiment: string | null; severity: string | null };

/** Most common value; ties go to the earlier entry in `prefer`, then alphabetical. */
function dominant(values: (string | null)[], prefer: string[] = []): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  if (counts.size === 0) return null;
  const rank = (v: string) => {
    const i = prefer.indexOf(v);
    return i === -1 ? prefer.length : i;
  };
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]),
  )[0][0];
}

export function deriveFacets(items: Item[]): Facets {
  return {
    type: dominant(items.map((i) => i.type), ["Bug", "Feature", "UX", "Question", "Praise"]),
    // Ties favour the worse sentiment: a problem hidden by a tie is the costly mistake.
    sentiment: dominant(items.map((i) => i.sentiment), ["Negative", "Neutral", "Positive"]),
    priority: dominant(items.map((i) => i.severity), ["High", "Medium", "Low"]),
  };
}
