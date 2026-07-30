"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { EnhancementStatusT } from "@/db/schema";
import { requireUser } from "@/lib/guard";

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

  const [{ n: demand }] = await db
    .select({ n: count() })
    .from(schema.feedbackItems)
    .where(
      and(
        eq(schema.feedbackItems.themeId, themeId),
        eq(schema.feedbackItems.reviewStatus, "approved"),
      ),
    );

  const [created] = await db
    .insert(schema.enhancements)
    .values({
      workspaceId: theme.workspaceId,
      themeId,
      title: theme.title,
      description: theme.summary ?? null,
      benefit: 6,
      effort: 5,
      demand: Number(demand),
      status: "review",
    })
    .returning({ id: schema.enhancements.id });

  revalidatePath("/roadmap");
  revalidatePath(`/themes/${themeId}`);
  return { id: created.id, created: true };
}
