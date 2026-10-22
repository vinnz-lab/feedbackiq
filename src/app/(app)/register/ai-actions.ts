"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { classifyItem } from "@/lib/ai/classify";
import { extractFeedbackItems, SPLIT_THRESHOLD_CHARS } from "@/lib/ai/extract";
import { quoteKey } from "@/lib/ingest/fingerprint";
import { findSimilarTitle } from "@/lib/themes/similarity";
import { currentIntervalMs, GeminiRateLimitError } from "@/lib/ai/gemini";
import { guardAiRun, logAudit, requireUser } from "@/lib/guard";

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
  /** Long sources (transcripts, long emails) broken into atomic items. */
  split?: number;
  /** Atomic items produced by splitting those sources. */
  extracted?: number;
  /** Extracted points that were already in the workspace. */
  duplicatesSkipped?: number;
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
export async function runAiAnalysis(itemIds?: string[]): Promise<AiRunResult> {
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

    // Work to do = anything unclassified, PLUS any long source still whole.
    // A long source that was already "classified" is still wrong — classifyItem
    // only ever saw its first 2000 characters — so it must remain eligible for
    // splitting rather than being permanently skipped.
    //
    // When the caller passes ids, work is limited to exactly those rows (still
    // subject to the same eligibility test, so an already-classified item in
    // the selection is left alone rather than re-spent on). With no ids it
    // covers everything eligible, as before.
    const scoped = itemIds && itemIds.length > 0 ? inArray(schema.feedbackItems.id, itemIds) : undefined;
    //
    // Also included: items that were APPROVED before the AI ever ran on them.
    // They sit in the register with no type, sentiment or theme, so they never
    // show up in Themes — approval alone does not analyse anything.
    const needsWork = and(
      scoped,
      or(
        and(
          eq(schema.feedbackItems.reviewStatus, "needs_review"),
          or(
            isNull(schema.feedbackItems.type),
            sql`length(${schema.feedbackItems.quote}) > ${SPLIT_THRESHOLD_CHARS}`,
          ),
        ),
        and(
          eq(schema.feedbackItems.reviewStatus, "approved"),
          isNull(schema.feedbackItems.type),
          sql`length(${schema.feedbackItems.quote}) <= ${SPLIT_THRESHOLD_CHARS}`,
        ),
      ),
    );

    const items = await db
      .select()
      .from(schema.feedbackItems)
      .where(needsWork)
      .limit(MAX_ITEMS_PER_RUN);

    let processed = 0;
    let failed = 0;
    let firstError: string | undefined;
    let timedOut = false;
    let rateLimited = false;
    let throttleAdvice: string | undefined;
    let consecutiveThrottles = 0;
    let split = 0;
    let extracted = 0;
    let duplicatesSkipped = 0;

    /** Find-or-create a theme by title, keeping the local caches in step. */
    const resolveTheme = async (title: string): Promise<string | null> => {
      const t = title.trim();
      if (!t || t.toLowerCase() === "new") return null;
      const hit = themeByTitle.get(t.toLowerCase());
      if (hit) return hit;

      // Exact matching alone let "Slow Board Loading Time" and "Slow Board
      // Loading" become two themes, which is how the list grew to 36. Reuse a
      // near-identical existing theme rather than minting a variant.
      const near = findSimilarTitle(t, themeRows);
      if (near) {
        themeByTitle.set(t.toLowerCase(), near.id);
        return near.id;
      }
      const [nt] = await db
        .insert(schema.themes)
        .values({ workspaceId: ws.id, title: t, isEmerging: true })
        .returning({ id: schema.themes.id, title: schema.themes.title });
      themeByTitle.set(nt.title.toLowerCase(), nt.id);
      themeRows.push({ id: nt.id, title: nt.title });
      return nt.id;
    };

    // ---- Pass 1: break long sources into atomic items ----------------------
    // A 9-minute call transcript arrives as ONE item holding ~20 separate
    // points; left whole it is useless to themes, dashboards and the roadmap
    // (and classifyItem only ever saw its first 2000 characters).
    const longOnes = items.filter((i) => i.quote.length > SPLIT_THRESHOLD_CHARS);

    // Quotes already in the workspace. Extraction is where duplicates actually
    // appear: two exports of the same call have different file fingerprints, so
    // ingest lets both through, yet they yield identical points.
    const knownQuotes = new Set<string>();
    if (longOnes.length) {
      const prior = await db
        .select({ quote: schema.feedbackItems.quote })
        .from(schema.feedbackItems)
        .where(eq(schema.feedbackItems.workspaceId, ws.id));
      for (const r of prior) {
        const k = quoteKey(r.quote);
        if (k) knownQuotes.add(k);
      }
    }

    /** Sources imported with a deliberate override want their copies kept. */
    const forcedSources = new Set(
      (
        await db
          .select({ id: schema.sources.id, meta: schema.sources.meta })
          .from(schema.sources)
          .where(eq(schema.sources.workspaceId, ws.id))
      )
        .filter((s) => (s.meta as { forcedImport?: boolean } | null)?.forcedImport)
        .map((s) => s.id),
    );

    for (const parent of longOnes) {
      if (Date.now() - started > TIME_BUDGET_MS - currentIntervalMs()) {
        timedOut = true;
        break;
      }
      try {
        const found = await extractFeedbackItems(
          parent.quote,
          themeRows.map((t) => t.title),
          areaNames,
        );
        consecutiveThrottles = 0;

        const forced = parent.sourceId ? forcedSources.has(parent.sourceId) : false;
        const fresh = forced
          ? found
          : found.filter((f) => {
              const k = quoteKey(f.quote);
              if (!k) return true; // too short to judge — keep it
              if (knownQuotes.has(k)) return false;
              knownQuotes.add(k);
              return true;
            });
        const dupes = found.length - fresh.length;
        duplicatesSkipped += dupes;

        // Resolve themes before opening the transaction — creating a theme is
        // idempotent by title, so it is safe outside and keeps the write short.
        const withThemes: { f: (typeof fresh)[number]; themeId: string | null }[] = [];
        for (const f of fresh) withThemes.push({ f, themeId: await resolveTheme(f.theme) });

        // Insert the children and retire the container in ONE transaction.
        // Previously the container was discarded only AFTER every insert, so a
        // run killed in between (time budget, rate limit) left the container
        // queued and the next run split it all over again — duplicates with no
        // duplicate import involved.
        await db.transaction(async (tx) => {
          if (withThemes.length) {
            await tx.insert(schema.feedbackItems).values(
              withThemes.map(({ f, themeId }) => ({
                workspaceId: ws.id,
                sourceId: parent.sourceId,
                quote: f.quote,
                customer: parent.customer,
                submitter: parent.submitter,
                // Provenance is the whole point of splitting — keep who said it
                // and when, so every item stays traceable to the recording.
                speaker: f.speaker ?? parent.speaker,
                timestampLabel: f.timestampLabel ?? parent.timestampLabel,
                occurredAt: parent.occurredAt,
                type: f.type,
                sentiment: f.sentiment,
                severity: f.severity,
                confidence: f.confidence,
                themeId,
                reviewStatus: "needs_review" as const,
                reviewReason: f.confidence === "Low" ? "low confidence" : null,
              })),
            );
          }

          // The full text stays on the source record, so nothing is lost.
          await tx
            .update(schema.feedbackItems)
            .set({
              reviewStatus: "discarded",
              reviewReason: dupes
                ? `split into ${fresh.length} items · ${dupes} already present`
                : `split into ${fresh.length} items`,
            })
            .where(eq(schema.feedbackItems.id, parent.id));
        });

        await logAudit({
          workspaceId: ws.id,
          actorId: user.id,
          actorLabel: "AI",
          action: "ai.split",
          entityType: "feedback_item",
          entityId: parent.id,
          after: { extracted: fresh.length, duplicatesSkipped: dupes, forced },
        });

        split++;
        extracted += fresh.length;
      } catch (e) {
        if (e instanceof GeminiRateLimitError) {
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

    // ---- Pass 2: classify the remaining atomic items -----------------------
    const shortOnes = rateLimited
      ? []
      : items.filter((i) => i.quote.length <= SPLIT_THRESHOLD_CHARS);

    for (const it of shortOnes) {
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
          throttleAdvice = e.advice;
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
    // that failed, and anything beyond MAX_ITEMS_PER_RUN. Uses the same
    // predicate as the work query so "still waiting" includes unsplit sources.
    const [{ n: remaining }] = await db
      .select({ n: count() })
      .from(schema.feedbackItems)
      .where(needsWork);

    // The caller renders the counts, so don't repeat them in the reason.
    let error: string | undefined;
    if (rateLimited) {
      error =
        "reached the Gemini free-tier rate limit. Wait about a minute, then run again to continue.";
    } else if (failed > 0) {
      error = firstError;
    }

    return {
      processed,
      failed,
      remaining: Number(remaining),
      split,
      extracted,
      duplicatesSkipped,
      error,
      timedOut,
      rateLimited,
    };
  } catch (e) {
    return { processed: 0, failed: 0, remaining: 0, error: (e as Error).message };
  }
}
