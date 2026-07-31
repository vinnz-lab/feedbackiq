"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { summarizeTheme } from "@/lib/ai/summarize";
import { currentIntervalMs, GeminiRateLimitError } from "@/lib/ai/gemini";
import { guardAiRun, requireUser } from "@/lib/guard";

/** Same honesty rule as runAiAnalysis: partial failures must be reported, not
 *  hidden behind a success count. */
export async function regenerateSummaries(): Promise<{
  updated: number;
  failed: number;
  error?: string;
}> {
  const started = Date.now();
  const TIME_BUDGET_MS = 210_000; // Vercel caps the function at 300s
  try {
    const user = await requireUser();
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { updated: 0, failed: 0, error: "No workspace found." };

    const gate = await guardAiRun("ai.summarize", ws.id, user);
    if (!gate.ok) return { updated: 0, failed: 0, error: gate.error };

    const themes = await db.select().from(schema.themes);
    let updated = 0;
    let failed = 0;
    let throttled = 0;
    let firstError: string | undefined;
    let skipped = 0;

    for (const t of themes) {
      if (Date.now() - started > TIME_BUDGET_MS - currentIntervalMs()) {
        skipped++;
        continue;
      }
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
        // Pacing + retry are handled centrally in lib/ai/gemini.ts.
      } catch (e) {
        failed++;
        if (e instanceof GeminiRateLimitError) throttled++;
        if (!firstError) firstError = (e as Error).message;
      }
    }

    revalidatePath("/themes");
    revalidatePath("/dashboard");

    let error: string | undefined;
    if (failed > 0) {
      error =
        throttled >= failed
          ? "hit the Gemini free-tier rate limit — wait a minute, then run again."
          : firstError;
    } else if (skipped > 0) {
      error = `Ran out of time with ${skipped} theme${skipped === 1 ? "" : "s"} left — run again to finish.`;
    }

    return { updated, failed, error };
  } catch (e) {
    return { updated: 0, failed: 0, error: (e as Error).message };
  }
}
