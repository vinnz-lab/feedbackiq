"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { summarizeTheme } from "@/lib/ai/summarize";
import { guardAiRun, requireUser } from "@/lib/guard";

export async function regenerateSummaries(): Promise<{ updated: number; error?: string }> {
  try {
    const user = await requireUser();
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { updated: 0, error: "No workspace found." };

    const gate = await guardAiRun("ai.summarize", ws.id, user);
    if (!gate.ok) return { updated: 0, error: gate.error };

    const themes = await db.select().from(schema.themes);
    let updated = 0;
    let firstError: string | undefined;

    for (const t of themes) {
      const items = await db
        .select({ q: schema.feedbackItems.quote })
        .from(schema.feedbackItems)
        .where(
          and(
            eq(schema.feedbackItems.themeId, t.id),
            eq(schema.feedbackItems.reviewStatus, "approved"),
          ),
        )
        .limit(15);
      if (!items.length) continue;
      try {
        const summary = await summarizeTheme(t.title, items.map((i) => i.q));
        if (summary) {
          await db.update(schema.themes).set({ summary }).where(eq(schema.themes.id, t.id));
          updated++;
        }
        await new Promise((r) => setTimeout(r, 250));
      } catch (e) {
        if (!firstError) firstError = (e as Error).message;
      }
    }

    revalidatePath("/themes");
    revalidatePath("/dashboard");
    return { updated, error: updated === 0 ? firstError : undefined };
  } catch (e) {
    return { updated: 0, error: (e as Error).message };
  }
}
