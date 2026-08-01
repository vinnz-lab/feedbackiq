"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { classifyItem } from "@/lib/ai/classify";
import { currentIntervalMs, GeminiRateLimitError } from "@/lib/ai/gemini";
import { guardAiRun, requireUser } from "@/lib/guard";

/** Vercel caps a function at 300s (Hobby cannot raise it), so stop well short
 *  and report what's left rather than being killed mid-run. */
const TIME_BUDGET_MS = 210_000;

/** Upper bound on how many items one run will look at. Pacing, not this, is
 *  normally what limits a run. */
const MAX_ITEMS_PER_RUN = 200;

export type AiRunResult = {
  processed: number;
  failed: number;
  remaining: number;
  /** Set whenever anything went wrong — including partial failures. */
  error?: string;
  /** True when we ran out of time rather than out of items. */
  timedOut?: boolean;
  /** True when the run stopped early because the AI quota was exhausted. */
  rateLimited?: boolean;
};

/**
 * Classify the unclassified needs-review items with Gemini.
 * Fills type/sentiment/severity/confidence + best-match theme. Items stay in
 * the needs-review queue — a human still approves (AI writes suggestions,
 * humans write facts).
 *
 * Reports partial failures honestly: an earlier version only surfaced an error
 * when NOTHING succeeded, so a run that classified 5 of 40 items looked like a
 * clean success and left 35 stuck on "Awaiting AI" with no explanation.
 */
export async function runAiAnalysis(): Promise<AiRunResult> {
  const started = Date.now();
  try {
    const user = await requireUser();
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { processed: 0, failed: 0, remaining: 0, error: "No workspace found." };

    const gate = await guardAiRun("ai.classify", ws.id, user);
    if (!gate.ok) return { processed: 0, failed: 0, remaining: 0, error: gate.error };

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
      .limit(MAX_ITEMS_PER_RUN);

    let processed = 0;
    let failed = 0;
    let firstError: string | undefined;
    let timedOut = false;
    let rateLimited = false;
    let consecutiveThrottles = 0;

    for (const it of items) {
      // Leave enough headroom for one more paced call before the cap.
      if (Date.now() - started > TIME_BUDGET_MS - currentIntervalMs()) {
        timedOut = true;
        break;
      }
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
            // Clear "awaiting AI" once classified, otherwise the card keeps
            // showing the Awaiting AI chip even though the AI has run.
            reviewReason: c.confidence === "Low" ? "low confidence" : null,
          })
          .where(eq(schema.feedbackItems.id, it.id));
        processed++;
        consecutiveThrottles = 0;
        // Pacing + retry are handled centrally in lib/ai/gemini.ts.
      } catch (e) {
        if (e instanceof GeminiRateLimitError) {
          // Being throttled isn't a failure of THIS item — the allowance simply
          // ran out. Leave it unclassified so it's picked up next run.
          // Flag it either way, so even a single throttle gets explained rather
          // than leaving an item quietly unclassified.
          rateLimited = true;
          consecutiveThrottles++;
          if (consecutiveThrottles >= 2) {
            // Circuit breaker. The whole batch shares one quota, so once it's
            // exhausted, continuing just burns the time budget on retries that
            // cannot succeed and hammers a limit we already hit.
            break;
          }
        } else {
          failed++;
          if (!firstError) firstError = (e as Error).message;
        }
      }
    }

    revalidatePath("/register");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");

    // Ask the DB rather than deriving it — covers items skipped on time, items
    // that failed, and anything beyond MAX_ITEMS_PER_RUN.
    const [{ n: remaining }] = await db
      .select({ n: count() })
      .from(schema.feedbackItems)
      .where(
        and(
          eq(schema.feedbackItems.reviewStatus, "needs_review"),
          isNull(schema.feedbackItems.type),
        ),
      );

    // The caller renders the counts, so don't repeat them in the reason.
    let error: string | undefined;
    if (rateLimited) {
      error =
        "reached the Gemini free-tier rate limit. Wait about a minute, then run again to continue.";
    } else if (failed > 0) {
      error = firstError;
    }

    return { processed, failed, remaining: Number(remaining), error, timedOut, rateLimited };
  } catch (e) {
    return { processed: 0, failed: 0, remaining: 0, error: (e as Error).message };
  }
}
