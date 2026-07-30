"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { classifyItem } from "@/lib/ai/classify";
import { guardAiRun, requireUser } from "@/lib/guard";

/**
 * M2b-1: classify the unclassified needs-review items with Gemini.
 * Fills type/sentiment/severity/confidence + best-match theme. Items stay in
 * the needs-review queue — a human still approves (AI writes suggestions,
 * humans write facts).
 */
export async function runAiAnalysis(): Promise<{ processed: number; error?: string }> {
  try {
    const user = await requireUser();
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { processed: 0, error: "No workspace found." };

    const gate = await guardAiRun("ai.classify", ws.id, user);
    if (!gate.ok) return { processed: 0, error: gate.error };

    const themeRows = await db
      .select({ id: schema.themes.id, title: schema.themes.title })
      .from(schema.themes); // mutable — new themes get pushed as we create them
    const themeByTitle = new Map(themeRows.map((t) => [t.title.toLowerCase(), t.id]));
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
        const c = await classifyItem(it.quote, themeRows.map((t) => t.title), areaNames);

        // Match an existing theme, or auto-create a new one (deduped by title).
        let themeId = themeByTitle.get(c.theme.toLowerCase()) ?? null;
        if (!themeId && ws && c.theme && c.theme.toLowerCase() !== "new") {
          const [nt] = await db
            .insert(schema.themes)
            .values({
              workspaceId: ws.id,
              title: c.theme,
              type: c.type,
              sentiment: c.sentiment,
              priority: c.severity,
              isEmerging: true,
            })
            .returning({ id: schema.themes.id, title: schema.themes.title });
          themeId = nt.id;
          themeByTitle.set(nt.title.toLowerCase(), nt.id);
          themeRows.push({ id: nt.id, title: nt.title });
        }

        await db
          .update(schema.feedbackItems)
          .set({
            type: c.type,
            sentiment: c.sentiment,
            severity: c.severity,
            confidence: c.confidence,
            themeId,
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
