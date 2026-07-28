"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { FeedbackTypeT, SentimentT, PriorityT } from "@/db/schema";

async function touch() {
  revalidatePath("/register");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout"); // sidebar review badge
}

export async function bulkApprove(ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  await db
    .update(schema.feedbackItems)
    .set({ reviewStatus: "approved", reviewReason: null })
    .where(inArray(schema.feedbackItems.id, ids));
  await touch();
}

export async function bulkDiscard(ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  await db
    .update(schema.feedbackItems)
    .set({ reviewStatus: "discarded" })
    .where(inArray(schema.feedbackItems.id, ids));
  await touch();
}

export async function approveItem(id: string) {
  const db = await getDb();
  await db
    .update(schema.feedbackItems)
    .set({ reviewStatus: "approved", reviewReason: null })
    .where(eq(schema.feedbackItems.id, id));
  await touch();
}

export async function discardItem(id: string) {
  const db = await getDb();
  await db
    .update(schema.feedbackItems)
    .set({ reviewStatus: "discarded" })
    .where(eq(schema.feedbackItems.id, id));
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
  const db = await getDb();
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
    .where(eq(schema.feedbackItems.id, id));
  await touch();
}
