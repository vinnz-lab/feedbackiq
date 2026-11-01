import { aiJson } from "./client";

/**
 * Proposes which themes describe the same underlying problem.
 *
 * One Gemini call for the whole list, so this stays cheap and safe on the free
 * tier however many themes there are.
 *
 * Nothing here merges anything. It returns proposals for a person to approve,
 * because a wrong merge destroys a distinct theme permanently and only someone
 * who knows the product can say whether "Slow Board Loading" and "Filtering
 * Performance" are one problem or two.
 */
export type ThemeForReview = {
  id: string;
  title: string;
  mentions: number;
};

export type MergeProposal = {
  /** The name the merged theme should carry. */
  canonicalTitle: string;
  /** Two or more existing theme ids. */
  themeIds: string[];
  /** One line, shown to the user so the suggestion can be judged. */
  reason: string;
};

const MAX_GROUPS = 15;

function buildPrompt(themes: ThemeForReview[]) {
  const list = themes
    .map((t) => `- id=${t.id} · "${t.title}" · ${t.mentions} mention${t.mentions === 1 ? "" : "s"}`)
    .join("\n");

  return `You are tidying up the theme list of a product-feedback tool. Themes have accumulated because each new piece of feedback tended to create its own theme instead of joining an existing one.

Identify groups of themes that describe THE SAME underlying problem and should become one.

Be conservative. Merging is irreversible in effect and destroys a distinct theme, so:
- Only group themes a product manager would agree are genuinely the same issue.
- Different symptoms of one root cause are the same theme (e.g. "Slow Board Loading" and "Slow Filtering" are both list performance).
- Different areas of the product are NOT the same theme, even when the wording rhymes. "Mobile App Crashes" and "Mobile Comment Mentions" are both mobile, but they are different problems — do not group them.
- A bug and a feature request about the same area are usually different themes.
- If you are unsure, leave them alone. Returning fewer groups is better than returning a wrong one.
- Never put the same theme in two groups.
- Only ever use ids from the list below.

For each group choose canonicalTitle: the clearest name for the combined theme, in Title Case, 3–6 words. Prefer the wording of the theme with the most mentions.
Give reason as ONE short sentence a person can judge at a glance.

Return at most ${MAX_GROUPS} groups. If nothing should be merged, return {"groups":[]}.

Return ONLY JSON: {"groups":[{"canonicalTitle":"...","themeIds":["...","..."],"reason":"..."}]}

THEMES:
${list}`;
}

/**
 * Validates the model's answer against the themes we actually sent.
 *
 * An id that doesn't exist, a group of one, or a theme claimed by two groups
 * would all corrupt the merge, so they are dropped here rather than trusted.
 */
export function validateProposals(raw: unknown, themes: ThemeForReview[]): MergeProposal[] {
  const known = new Map(themes.map((t) => [t.id, t]));
  const groups = Array.isArray((raw as { groups?: unknown })?.groups)
    ? ((raw as { groups: unknown[] }).groups as Record<string, unknown>[])
    : [];

  const claimed = new Set<string>();
  const out: MergeProposal[] = [];

  for (const g of groups) {
    const title = typeof g.canonicalTitle === "string" ? g.canonicalTitle.trim() : "";
    const reason = typeof g.reason === "string" ? g.reason.trim() : "";
    const ids = Array.isArray(g.themeIds)
      ? (g.themeIds as unknown[]).filter((i): i is string => typeof i === "string")
      : [];

    // Only ids we sent, de-duplicated, and not already spoken for.
    const valid = [...new Set(ids)].filter((id) => known.has(id) && !claimed.has(id));

    if (!title || valid.length < 2) continue;

    valid.forEach((id) => claimed.add(id));
    out.push({
      canonicalTitle: title.slice(0, 120),
      themeIds: valid,
      reason: reason.slice(0, 300) || "Describes the same underlying problem.",
    });
    if (out.length >= MAX_GROUPS) break;
  }

  return out;
}

export async function proposeThemeMerges(themes: ThemeForReview[]): Promise<MergeProposal[]> {
  if (themes.length < 2) return [];
  const raw = await aiJson(buildPrompt(themes));
  return validateProposals(raw, themes);
}
