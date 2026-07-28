// Composite prioritisation score (0–10): demand + benefit reward, effort penalty.
export function computeScore(benefit: number, effort: number, demand: number): number {
  const demandN = (Math.min(demand, 12) / 12) * 10; // normalise demand to 0–10
  const raw = benefit * 0.45 + demandN * 0.35 + (10 - effort) * 0.2;
  return Math.round(raw * 10) / 10;
}
