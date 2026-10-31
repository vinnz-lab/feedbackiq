/**
 * Week-over-week trend for a theme, calculated from when its feedback happened.
 *
 * The old badge read a stored number that nothing ever updated, so it said
 * "0%" on every real theme. This works it out from the data instead, and says
 * so honestly when there is nothing to compare.
 */
export type Trend =
  | { kind: "none" } // no recent feedback at all: show nothing
  | { kind: "new"; thisWeek: number } // feedback this week, none the week before
  | { kind: "change"; pct: number; thisWeek: number; lastWeek: number };

const DAY = 86_400_000;

export function computeTrend(dates: (Date | string | null)[], now: Date = new Date()): Trend {
  const t = now.getTime();
  let thisWeek = 0;
  let lastWeek = 0;
  for (const d of dates) {
    if (!d) continue;
    const ms = new Date(d).getTime();
    if (!Number.isFinite(ms)) continue;
    const age = t - ms;
    if (age < 0) continue; // dated in the future: ignore rather than guess
    if (age < 7 * DAY) thisWeek++;
    else if (age < 14 * DAY) lastWeek++;
  }
  if (thisWeek === 0 && lastWeek === 0) return { kind: "none" };
  if (lastWeek === 0) return { kind: "new", thisWeek };
  return {
    kind: "change",
    pct: Math.round(((thisWeek - lastWeek) / lastWeek) * 100),
    thisWeek,
    lastWeek,
  };
}

/** At least this many mentions this week before a theme can be "emerging". */
export const EMERGING_MIN_MENTIONS = 3;
/** Week-on-week rise that counts as emerging. */
export const EMERGING_MIN_RISE_PCT = 50;

/**
 * Whether a theme deserves the EMERGING tag.
 *
 * The old tag was stamped on every AI-created theme and never removed, so it
 * appeared on everything and meant nothing. Now it's earned:
 *  - RISING: ≥3 mentions this week and up ≥50% on last week; or
 *  - NEW: ≥3 mentions this week and none before — but only once the workspace
 *    has older feedback to compare with. In a workspace whose feedback all
 *    arrived this week, every theme is "new", so being new says nothing.
 */
export function isEmerging(trend: Trend | undefined, workspaceHasHistory: boolean): boolean {
  if (!trend || trend.kind === "none") return false;
  if (trend.thisWeek < EMERGING_MIN_MENTIONS) return false;
  if (trend.kind === "new") return workspaceHasHistory;
  return trend.pct >= EMERGING_MIN_RISE_PCT;
}
