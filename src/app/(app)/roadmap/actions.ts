"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { EnhancementStatusT } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { estimateBenefitEffort } from "@/lib/estimate";

export async function updateEnhancementStatus(id: string, status: EnhancementStatusT) {
  await requireUser();
  const db = await getDb();
  await db
    .update(schema.enhancements)
    .set({ status })
    .where(eq(schema.enhancements.id, id));
  revalidatePath("/roadmap");
}

// Promote a theme to an enhancement on the roadmap (idempotent per theme).
export async function promoteThemeToEnhancement(
  themeId: string,
): Promise<{ id: string; created: boolean }> {
  await requireUser();
  const db = await getDb();

  const existing = await db
    .select({ id: schema.enhancements.id })
    .from(schema.enhancements)
    .where(eq(schema.enhancements.themeId, themeId))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, created: false };

  const [theme] = await db
    .select()
    .from(schema.themes)
    .where(eq(schema.themes.id, themeId))
    .limit(1);
  if (!theme) throw new Error("Theme not found");

  const est = await estimateForTheme(themeId);

  const [created] = await db
    .insert(schema.enhancements)
    .values({
      workspaceId: theme.workspaceId,
      themeId,
      title: theme.title,
      description: theme.summary ?? null,
      benefit: est.benefit,
      effort: est.effort,
      demand: est.demand,
      status: "review",
    })
    .returning({ id: schema.enhancements.id });

  revalidatePath("/roadmap");
  revalidatePath(`/themes/${themeId}`);
  return { id: created.id, created: true };
}

/** Works out default benefit/effort for a theme from its approved feedback. */
async function estimateForTheme(themeId: string) {
  const db = await getDb();
  const items = await db
    .select({
      type: schema.feedbackItems.type,
      sentiment: schema.feedbackItems.sentiment,
      severity: schema.feedbackItems.severity,
    })
    .from(schema.feedbackItems)
    .where(
      and(
        eq(schema.feedbackItems.themeId, themeId),
        eq(schema.feedbackItems.reviewStatus, "approved"),
      ),
    );
  const demand = items.length;
  const est = estimateBenefitEffort({ items, demand });
  return { ...est, demand };
}

/** Sets benefit and effort by hand. Values are clamped to 1–10 whole numbers. */
export async function updateEnhancementEstimates(
  id: string,
  benefit: number,
  effort: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(Number(n))));
  if (!Number.isFinite(benefit) || !Number.isFinite(effort)) {
    return { ok: false, error: "Scores must be numbers from 1 to 10." };
  }
  const db = await getDb();
  await db
    .update(schema.enhancements)
    .set({ benefit: clamp(benefit), effort: clamp(effort) })
    .where(eq(schema.enhancements.id, id));
  revalidatePath("/roadmap");
  return { ok: true };
}

/** Recalculates the default estimates for an existing item from its feedback. */
export async function reestimateEnhancement(
  id: string,
): Promise<{ ok: boolean; error?: string; reason?: string }> {
  await requireUser();
  const db = await getDb();
  const [enh] = await db
    .select({ themeId: schema.enhancements.themeId })
    .from(schema.enhancements)
    .where(eq(schema.enhancements.id, id))
    .limit(1);
  if (!enh?.themeId) return { ok: false, error: "This item isn't linked to a theme, so there's no feedback to estimate from." };
  const est = await estimateForTheme(enh.themeId);
  await db
    .update(schema.enhancements)
    .set({ benefit: est.benefit, effort: est.effort, demand: est.demand })
    .where(eq(schema.enhancements.id, id));
  revalidatePath("/roadmap");
  return { ok: true, reason: est.reason };
}
