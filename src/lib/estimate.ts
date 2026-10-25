/**
 * Default benefit and effort for a roadmap item, worked out from the feedback
 * behind it. These are starting points a person should adjust, not verdicts.
 *
 * benefit (1–10): how much it would help. Driven by how many people raised it,
 *   how negative they were, and how severe they said it was.
 * effort (1–10): how big the change probably is. Driven by what kind of feedback
 *   dominates: a bug is usually smaller than a new feature.
 */

export type EstimateInput = {
  /** Approved items behind the theme. */
  items: { type: string | null; sentiment: string | null; severity: string | null }[];
  /** Distinct people or sources, used as "demand". */
  demand: number;
};

export type Estimate = { benefit: number; effort: number; reason: string };

const EFFORT_BY_TYPE: Record<string, number> = {
  Bug: 3,
  UX: 4,
  Question: 2,
  Praise: 2,
  Feature: 6,
};

const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

export function estimateBenefitEffort({ items, demand }: EstimateInput): Estimate {
  const n = items.length || 1;
  const share = (pred: (i: EstimateInput["items"][number]) => boolean) =>
    items.filter(pred).length / n;

  const negative = share((i) => i.sentiment === "Negative");
  const high = share((i) => i.severity === "High");

  // Demand carries most of the weight, capped so one loud theme can't dominate.
  let benefit = 4 + Math.min(demand, 6) * 0.5;
  if (negative >= 0.5) benefit += 1;
  if (high >= 0.5) benefit += 1;

  // Effort follows the most common feedback type.
  const counts = new Map<string, number>();
  for (const i of items) if (i.type) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const effort = dominant && EFFORT_BY_TYPE[dominant] ? EFFORT_BY_TYPE[dominant] : 5;

  const reason =
    `${demand} ${demand === 1 ? "person" : "people"} raised it` +
    (negative >= 0.5 ? ", mostly negative" : "") +
    (high >= 0.5 ? ", mostly high severity" : "") +
    (dominant ? `; mostly ${dominant.toLowerCase()} feedback, so effort is estimated as ${effort <= 3 ? "small" : effort >= 6 ? "larger" : "medium"}` : "");

  return { benefit: clamp(benefit), effort: clamp(effort), reason };
}
