"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { proposeThemeMerges, type MergeProposal } from "@/lib/ai/consolidate";
import { GeminiRateLimitError } from "@/lib/ai/gemini";
import { mergeThemes } from "@/lib/themes/merge";
import { guardAiRun, requireUser } from "@/lib/guard";

export type ReviewResult = {
  proposals: (MergeProposal & { titles: string[] })[];
  themeCount: number;
  error?: string;
};

/**
 * Asks the AI which themes describe the same problem. Proposes only — nothing
 * is changed until a person approves a group.
 */
export async function reviewThemes(): Promise<ReviewResult> {
  try {
    const user = await requireUser();
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { proposals: [], themeCount: 0, error: "No workspace found." };

    const gate = await guardAiRun("ai.summarize", ws.id, user);
    if (!gate.ok) return { proposals: [], themeCount: 0, error: gate.error };

    const themes = await db.select().from(schema.themes).where(eq(schema.themes.workspaceId, ws.id));
    if (themes.length < 2) {
      return { proposals: [], themeCount: themes.length, error: "Not enough themes to review yet." };
    }

    // Mention counts go to the model so it can prefer the dominant wording.
    const withCounts = await Promise.all(
      themes.map(async (t) => {
        const [{ n }] = await db
          .select({ n: count() })
          .from(schema.feedbackItems)
          .where(eq(schema.feedbackItems.themeId, t.id));
        return { id: t.id, title: t.title, mentions: Number(n) };
      }),
    );

    const proposals = await proposeThemeMerges(withCounts);
    const byId = new Map(withCounts.map((t) => [t.id, t.title]));

    return {
      themeCount: themes.length,
      proposals: proposals.map((p) => ({
        ...p,
        titles: p.themeIds.map((id) => byId.get(id) ?? "(gone)"),
      })),
    };
  } catch (e) {
    if (e instanceof GeminiRateLimitError) {
      // Nothing was changed — the review is read-only and a single AI call, so
      // there is no partial progress to lose. Say so, and give the wait that
      // Google actually reported rather than a guess.
      return {
        proposals: [],
        themeCount: 0,
        error: `${e.advice} Nothing was changed, so just run it again.`,
      };
    }
    return { proposals: [], themeCount: 0, error: (e as Error).message };
  }
}

export type ApplyResult = {
  ok: boolean;
  message?: string;
  error?: string;
  /** Concrete numbers, so the confirmation can prove what happened. */
  themesRemoved?: number;
  itemsKept?: number;
  survivorTitle?: string;
  /** True when this group had already been merged (e.g. a double click). */
  alreadyDone?: boolean;
};

/** Applies one approved group. */
export async function applyMerge(themeIds: string[], canonicalTitle: string): Promise<ApplyResult> {
  try {
    await requireUser();
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { ok: false, error: "No workspace found." };

    const outcome = await mergeThemes(ws.id, themeIds, canonicalTitle);

    // The surviving summary described fewer items, so it is now quietly wrong.
    // Clear it — one fast write — instead of regenerating here.
    //
    // Rewriting it inline meant this action awaited a PACED, RETRYING Gemini
    // call: a 6–20s gap between requests plus up to three attempts on a 429. So
    // the button sat on "Merging…" for a minute or more while the merge itself
    // had already committed in milliseconds, and the user could not tell
    // whether their data had changed. A destructive action must confirm as soon
    // as it is durable, never wait on an optional one.
    //
    // The existing "Regenerate summaries" button fills it back in, and an empty
    // summary is honest where a stale one is not.
    await db
      .update(schema.themes)
      .set({ summary: null })
      .where(eq(schema.themes.id, outcome.survivorId));
    const summaryNote = " Its summary was cleared — hit “Regenerate summaries” when convenient.";

    revalidatePath("/themes");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");

    const merged = outcome.mergedAway.length;
    return {
      ok: true,
      themesRemoved: merged,
      itemsKept: outcome.itemsMoved,
      survivorTitle: outcome.survivorTitle,
      message:
        `Merged ${merged} theme${merged === 1 ? "" : "s"} into “${outcome.survivorTitle}”. ` +
        `All ${outcome.itemsMoved} feedback item${outcome.itemsMoved === 1 ? "" : "s"} kept and moved across — none deleted.` +
        (outcome.enhancementsUpdated
          ? ` ${outcome.enhancementsUpdated} roadmap item${outcome.enhancementsUpdated === 1 ? "" : "s"} rescored.`
          : "") +
        (outcome.roadmapNeedsTidying
          ? " Note: this theme now has more than one roadmap item — worth tidying."
          : "") +
        summaryNote,
    };
  } catch (e) {
    const msg = (e as Error).message;
    // mergeThemes throws this when the themes are already gone — which is what
    // a double click looks like. The merge DID happen, so say so rather than
    // showing a failure for something that actually succeeded.
    if (/no longer exist/i.test(msg)) {
      return {
        ok: true,
        alreadyDone: true,
        message: "That merge had already been applied — nothing further to do.",
      };
    }
    return { ok: false, error: msg };
  }
}
