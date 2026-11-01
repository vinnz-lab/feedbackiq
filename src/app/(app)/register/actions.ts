"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { FeedbackTypeT, SentimentT, PriorityT } from "@/db/schema";
import { requireCapability } from "@/lib/permissions";

async function touch() {
  revalidatePath("/register");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout"); // sidebar review badge
}

/**
 * Approving an item that the AI has not analysed gives it no theme, so it
 * counts for nothing on the Themes page — and used to silently look "done".
 * Only analysed items (those with a type) are approved here; the rest are left
 * in the queue and reported back so the caller can say so.
 */
export async function bulkApprove(ids: string[]): Promise<{ approved: number; skipped: number }> {
  const { workspace } = await requireCapability("edit");
  const inWs = eq(schema.feedbackItems.workspaceId, workspace.id);
  if (!ids.length) return { approved: 0, skipped: 0 };
  const db = await getDb();
  const done = await db
    .update(schema.feedbackItems)
    .set({ reviewStatus: "approved", reviewReason: null })
    .where(and(inWs, inArray(schema.feedbackItems.id, ids), isNotNull(schema.feedbackItems.type)))
    .returning({ id: schema.feedbackItems.id });
  await touch();
  return { approved: done.length, skipped: ids.length - done.length };
}

export async function bulkDiscard(ids: string[]) {
  const { workspace } = await requireCapability("edit");
  const inWs = eq(schema.feedbackItems.workspaceId, workspace.id);
  if (!ids.length) return;
  const db = await getDb();
  await db
    .update(schema.feedbackItems)
    .set({ reviewStatus: "discarded" })
    .where(and(inWs, inArray(schema.feedbackItems.id, ids)));
  await touch();
}

export async function approveItem(id: string): Promise<{ approved: boolean }> {
  const { workspace } = await requireCapability("edit");
  const inWs = eq(schema.feedbackItems.workspaceId, workspace.id);
  const db = await getDb();
  const done = await db
    .update(schema.feedbackItems)
    .set({ reviewStatus: "approved", reviewReason: null })
    .where(and(inWs, eq(schema.feedbackItems.id, id), isNotNull(schema.feedbackItems.type)))
    .returning({ id: schema.feedbackItems.id });
  await touch();
  return { approved: done.length > 0 };
}

export async function discardItem(id: string) {
  const { workspace } = await requireCapability("edit");
  const inWs = eq(schema.feedbackItems.workspaceId, workspace.id);
  const db = await getDb();
  await db
    .update(schema.feedbackItems)
    .set({ reviewStatus: "discarded" })
    .where(and(inWs, eq(schema.feedbackItems.id, id)));
  await touch();
}

export async function correctAndApprove(
  id: string,
  patch: {
    type?: FeedbackTypeT;
    sentiment?: SentimentT;
    severity?: PriorityT;
    themeId?: string | null;
  },
) {
  const { workspace } = await requireCapability("edit");
  const inWs = eq(schema.feedbackItems.workspaceId, workspace.id);
  const db = await getDb();
  // The theme comes from the browser, so it must be checked: a theme from
  // another workspace would link this item across the boundary.
  if (patch.themeId) {
    const [t] = await db
      .select({ id: schema.themes.id })
      .from(schema.themes)
      .where(and(eq(schema.themes.id, patch.themeId), eq(schema.themes.workspaceId, workspace.id)))
      .limit(1);
    if (!t) throw new Error("That theme isn't in this workspace.");
  }
  await db
    .update(schema.feedbackItems)
    .set({
      type: patch.type ?? null,
      sentiment: patch.sentiment ?? null,
      severity: patch.severity ?? null,
      themeId: patch.themeId ?? null,
      reviewStatus: "approved",
      reviewReason: null,
    })
    .where(and(inWs, eq(schema.feedbackItems.id, id)));
  await touch();
}
