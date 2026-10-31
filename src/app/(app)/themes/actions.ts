"use server";

import { withWorkspaceAi } from "@/lib/ai/with-workspace-ai";
import { currentAiKey } from "@/lib/ai/ai-context";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { summarizeTheme } from "@/lib/ai/summarize";
import { currentIntervalMs, GeminiRateLimitError } from "@/lib/ai/gemini";
import { guardAiRun } from "@/lib/guard";
import { requireWorkspace } from "@/lib/workspace";

/** Same honesty rule as runAiAnalysis: partial failures must be reported, not
 *  hidden behind a success count. */
async function regenerateSummariesInner(): Promise<{
  updated: number;
  failed: number;
  error?: string;
}> {
  const started = Date.now();
  const TIME_BUDGET_MS = 210_000; // Vercel caps the function at 300s
  try {
    const ctx = await requireWorkspace();
    const user = ctx.user;
    const ws = ctx.workspace;
    const db = await getDb();

    const gate = await guardAiRun("ai.summarize", ws.id, user, currentAiKey()?.source ?? "platform");
    if (!gate.ok) return { updated: 0, failed: 0, error: gate.error };

    const themes = await db.select().from(schema.themes).where(eq(schema.themes.workspaceId, ws.id));
    let updated = 0;
    let failed = 0;
    let rateLimited = false;
    let throttleAdvice: string | undefined;
    let consecutiveThrottles = 0;
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
            eq(schema.feedbackItems.workspaceId, ws.id),
            eq(schema.feedbackItems.themeId, t.id),
            eq(schema.feedbackItems.reviewStatus, "approved"),
          ),
        )
        .limit(15);
      if (!items.length) continue;
      try {
        const summary = await summarizeTheme(t.title, items.map((i) => i.q));
        if (summary) {
          await db
            .update(schema.themes)
            .set({ summary })
            .where(and(eq(schema.themes.workspaceId, ws.id), eq(schema.themes.id, t.id)));
          updated++;
        }
        consecutiveThrottles = 0;
        // Pacing + retry are handled centrally in lib/ai/gemini.ts.
      } catch (e) {
        if (e instanceof GeminiRateLimitError) {
          // Same circuit breaker as the classify run: once the shared quota is
          // gone, continuing only burns time on calls that cannot succeed.
          rateLimited = true;
          throttleAdvice = e.advice;
          consecutiveThrottles++;
          if (consecutiveThrottles >= 2) break;
        } else {
          failed++;
          if (!firstError) firstError = (e as Error).message;
        }
      }
    }

    revalidatePath("/themes");
    revalidatePath("/dashboard");

    let error: string | undefined;
    if (rateLimited) {
      error = "hit the Gemini rate limit. Wait about a minute, then run again.";
    } else if (failed > 0) {
      error = firstError;
    } else if (skipped > 0) {
      error = `ran out of time with ${skipped} theme${skipped === 1 ? "" : "s"} left — run again to finish.`;
    }

    return { updated, failed, error };
  } catch (e) {
    return { updated: 0, failed: 0, error: (e as Error).message };
  }
}

/** Runs on the current workspace's AI key (see lib/ai/with-workspace-ai.ts). */
export async function regenerateSummaries(): Promise<{
  updated: number;
  failed: number;
  error?: string;
}> {
  return withWorkspaceAi((error) => ({ updated: 0, failed: 0, error }), () => regenerateSummariesInner());
}
