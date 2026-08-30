"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { proposeThemeMerges, type MergeProposal } from "@/lib/ai/consolidate";
import { GeminiRateLimitError } from "@/lib/ai/gemini";
import { summarizeTheme } from "@/lib/ai/summarize";
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
      return {
        proposals: [],
        themeCount: 0,
        error: "Reached the Gemini free-tier rate limit. Wait about a minute and try again.",
      };
    }
    return { proposals: [], themeCount: 0, error: (e as Error).message };
  }
}

export type ApplyResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

/** Applies one approved group. */
export async function applyMerge(themeIds: string[], canonicalTitle: string): Promise<ApplyResult> {
  try {
    await requireUser();
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { ok: false, error: "No workspace found." };

    const outcome = await mergeThemes(ws.id, themeIds, canonicalTitle);

    // The surviving summary was written about fewer items, so it is now quietly
    // wrong. Try to rewrite it; if the AI is unavailable, CLEAR it rather than
    // leave a description that no longer matches the feedback beneath it.
    let summaryNote = "";
    try {
      const quotes = await db
        .select({ q: schema.feedbackItems.quote })
        .from(schema.feedbackItems)
        .where(eq(schema.feedbackItems.themeId, outcome.survivorId))
        .limit(15);
      const summary = quotes.length
        ? await summarizeTheme(outcome.survivorTitle, quotes.map((x) => x.q))
        : null;
      await db
        .update(schema.themes)
        .set({ summary: summary ?? null })
        .where(eq(schema.themes.id, outcome.survivorId));
      if (!summary) summaryNote = " Summary cleared — regenerate when convenient.";
    } catch {
      await db
        .update(schema.themes)
        .set({ summary: null })
        .where(eq(schema.themes.id, outcome.survivorId));
      summaryNote = " Summary cleared (AI unavailable) — regenerate when convenient.";
    }

    revalidatePath("/themes");
    revalidatePath("/dashboard");
    revalidatePath("/roadmap");

    const merged = outcome.mergedAway.length;
    return {
      ok: true,
      message:
        `Merged ${merged} theme${merged === 1 ? "" : "s"} into “${outcome.survivorTitle}”. ` +
        `${outcome.itemsMoved} feedback item${outcome.itemsMoved === 1 ? "" : "s"} kept.` +
        (outcome.enhancementsUpdated
          ? ` ${outcome.enhancementsUpdated} roadmap item${outcome.enhancementsUpdated === 1 ? "" : "s"} rescored.`
          : "") +
        (outcome.roadmapNeedsTidying
          ? " Note: this theme now has more than one roadmap item — worth tidying."
          : "") +
        summaryNote,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
