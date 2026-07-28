"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { classifyItem } from "@/lib/ai/classify";

/**
 * M2b-1: classify the unclassified needs-review items with Gemini.
 * Fills type/sentiment/severity/confidence + best-match theme. Items stay in
 * the needs-review queue — a human still approves (AI writes suggestions,
 * humans write facts).
 */
export async function runAiAnalysis(): Promise<{ processed: number; error?: string }> {
  try {
    const db = await getDb();
    const themes = await db
      .select({ id: schema.themes.id, title: schema.themes.title })
      .from(schema.themes);
    const areas = await db.select({ name: schema.productAreas.name }).from(schema.productAreas);
    const areaNames = areas.map((a) => a.name);

    const items = await db
      .select()
      .from(schema.feedbackItems)
      .where(
        and(
          eq(schema.feedbackItems.reviewStatus, "needs_review"),
          isNull(schema.feedbackItems.type),
        ),
      )
      .limit(25);

    let processed = 0;
    let firstError: string | undefined;
    for (const it of items) {
      try {
        const c = await classifyItem(it.quote, themes.map((t) => t.title), areaNames);
        const match = themes.find((t) => t.title.toLowerCase() === c.theme.toLowerCase());
        await db
          .update(schema.feedbackItems)
          .set({
            type: c.type,
            sentiment: c.sentiment,
            severity: c.severity,
            confidence: c.confidence,
            themeId: match ? match.id : null,
            reviewReason: c.confidence === "Low" ? "low confidence" : it.reviewReason,
          })
          .where(eq(schema.feedbackItems.id, it.id));
        processed++;
        await new Promise((r) => setTimeout(r, 250)); // gentle pacing for the free tier
      } catch (e) {
        if (!firstError) firstError = (e as Error).message;
      }
    }

    revalidatePath("/register");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { processed, error: processed === 0 ? firstError : undefined };
  } catch (e) {
    return { processed: 0, error: (e as Error).message };
  }
}
