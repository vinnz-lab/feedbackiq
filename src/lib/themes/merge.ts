import { and, count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeScore } from "@/lib/score";

/**
 * Merges several themes into one.
 *
 * THE INVARIANT: no feedback item may be lost. Themes are labels; the feedback
 * underneath them is the actual asset. So the item count across the group is
 * measured before and after inside the transaction, and any discrepancy aborts
 * the whole thing. It is checked rather than assumed, because "we only reassign,
 * we never delete" is exactly the kind of intention that quietly stops being
 * true after a later edit.
 *
 * Order matters too: items are re-pointed BEFORE the old themes are deleted.
 * `feedback_items.theme_id` is ON DELETE SET NULL, so deleting first would
 * orphan the feedback instead of moving it — the items would survive but lose
 * their theme, which is a silent form of the same loss.
 */
export type MergeOutcome = {
  survivorId: string;
  survivorTitle: string;
  mergedAway: { id: string; title: string }[];
  itemsMoved: number;
  /** Roadmap items whose demand and score were recalculated. */
  enhancementsUpdated: number;
  /** True when the survivor now has more than one roadmap item. */
  roadmapNeedsTidying: boolean;
};

export async function mergeThemes(
  workspaceId: string,
  themeIds: string[],
  canonicalTitle: string,
): Promise<MergeOutcome> {
  if (themeIds.length < 2) throw new Error("A merge needs at least two themes.");

  const db = await getDb();

  const themes = await db
    .select()
    .from(schema.themes)
    .where(and(eq(schema.themes.workspaceId, workspaceId), inArray(schema.themes.id, themeIds)));

  if (themes.length < 2) throw new Error("Those themes no longer exist.");

  // Mention counts decide which theme survives: keeping the biggest one's row
  // means anything already attached to it — roadmap items especially — stays
  // attached, so a merge disturbs as little as possible.
  const counts = new Map<string, number>();
  for (const t of themes) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.feedbackItems)
      .where(eq(schema.feedbackItems.themeId, t.id));
    counts.set(t.id, Number(n));
  }
  const ordered = [...themes].sort(
    (a, b) =>
      (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const survivor = ordered[0];
  const losers = ordered.slice(1);
  const loserIds = losers.map((l) => l.id);

  // Every item in the group, captured before anything moves — this is both the
  // count to verify against and the record needed to undo the merge.
  const itemsBefore = await db
    .select({ id: schema.feedbackItems.id, themeId: schema.feedbackItems.themeId })
    .from(schema.feedbackItems)
    .where(inArray(schema.feedbackItems.themeId, themeIds));
  const totalBefore = itemsBefore.length;

  let enhancementsUpdated = 0;
  let roadmapNeedsTidying = false;

  await db.transaction(async (tx) => {
    // 1. Move the feedback across. Nothing is deleted.
    if (loserIds.length) {
      await tx
        .update(schema.feedbackItems)
        .set({ themeId: survivor.id })
        .where(inArray(schema.feedbackItems.themeId, loserIds));
    }

    // 2. Re-point roadmap items rather than removing any. Deleting one would
    //    throw away its status and Jira key; two cards on one theme is untidy
    //    but recoverable, so the user is told instead.
    if (loserIds.length) {
      await tx
        .update(schema.enhancements)
        .set({ themeId: survivor.id })
        .where(inArray(schema.enhancements.themeId, loserIds));
    }

    // 3. Rename the survivor to the agreed title.
    if (canonicalTitle.trim() && canonicalTitle.trim() !== survivor.title) {
      await tx
        .update(schema.themes)
        .set({ title: canonicalTitle.trim() })
        .where(eq(schema.themes.id, survivor.id));
    }

    // 4. VERIFY BEFORE DELETING. Everything that pointed at the group must now
    //    point at the survivor — same count, nothing dropped.
    const [{ n: nowOnSurvivor }] = await tx
      .select({ n: count() })
      .from(schema.feedbackItems)
      .where(eq(schema.feedbackItems.themeId, survivor.id));

    if (Number(nowOnSurvivor) !== totalBefore) {
      throw new Error(
        `Merge aborted: ${totalBefore} feedback items before, ${nowOnSurvivor} after. Nothing was changed.`,
      );
    }

    // 5. Only now are the emptied themes safe to remove.
    if (loserIds.length) {
      await tx.delete(schema.themes).where(inArray(schema.themes.id, loserIds));
    }

    // 6. Demand feeds the roadmap score, and it has just changed. Left alone,
    //    the roadmap would keep ranking on the old mention counts.
    const affected = await tx
      .select()
      .from(schema.enhancements)
      .where(eq(schema.enhancements.themeId, survivor.id));

    const [{ n: approved }] = await tx
      .select({ n: count() })
      .from(schema.feedbackItems)
      .where(
        and(
          eq(schema.feedbackItems.themeId, survivor.id),
          eq(schema.feedbackItems.reviewStatus, "approved"),
        ),
      );

    for (const e of affected) {
      const demand = Number(approved);
      const score = computeScore(e.benefit, e.effort, demand);
      await tx
        .update(schema.enhancements)
        .set({ demand, score: String(score) })
        .where(eq(schema.enhancements.id, e.id));
      enhancementsUpdated++;
    }
    roadmapNeedsTidying = affected.length > 1;

    // 7. Enough detail to reverse this by hand if it was wrong.
    await tx.insert(schema.auditEvents).values({
      workspaceId,
      actorLabel: "AI",
      action: "theme.merge",
      entityType: "theme",
      entityId: survivor.id,
      before: {
        survivor: { id: survivor.id, title: survivor.title },
        mergedAway: losers.map((l) => ({ id: l.id, title: l.title })),
        // The original theme of every item that moved, so the split is undoable.
        itemThemes: itemsBefore.map((i) => ({ itemId: i.id, themeId: i.themeId })),
      } as never,
      after: { title: canonicalTitle, itemsMoved: totalBefore } as never,
    });
  });

  return {
    survivorId: survivor.id,
    survivorTitle: canonicalTitle.trim() || survivor.title,
    mergedAway: losers.map((l) => ({ id: l.id, title: l.title })),
    itemsMoved: totalBefore,
    enhancementsUpdated,
    roadmapNeedsTidying,
  };
}
