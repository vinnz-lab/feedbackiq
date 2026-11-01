"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  formatTranscript,
  getTranscript,
  isTranscriptionConfigured,
  speakerCount,
} from "@/lib/ai/transcribe";
import { logAudit } from "@/lib/guard";
import { requireCapability } from "@/lib/permissions";

export type PollResult = {
  checked: number;
  completed: number;
  stillRunning: number;
  failed: number;
  error?: string;
};

/**
 * Checks any in-flight transcriptions and turns finished ones into feedback.
 *
 * Transcription is asynchronous and Vercel has no background workers, so this
 * runs on demand rather than on a timer. Each completed recording becomes a
 * single timestamped, speaker-labelled transcript item, which the existing
 * splitter then breaks into individually attributed feedback points.
 */
export async function pollTranscriptions(): Promise<PollResult> {
  const out: PollResult = { checked: 0, completed: 0, stillRunning: 0, failed: 0 };
  try {
    const wsId = (await requireCapability("edit")).workspace.id;
    if (!isTranscriptionConfigured()) {
      return { ...out, error: "Transcription is not configured (ASSEMBLYAI_API_KEY)." };
    }

    const db = await getDb();
    const pending = await db
      .select()
      .from(schema.sources)
      .where(and(eq(schema.sources.workspaceId, wsId), eq(schema.sources.status, "processing")));

    let firstError: string | undefined;

    for (const src of pending) {
      const jobId = (src.meta as { assemblyId?: string } | null)?.assemblyId;
      if (!jobId) continue; // seeded/demo rows have no real job behind them
      out.checked++;

      try {
        const t = await getTranscript(jobId);

        if (t.status === "queued" || t.status === "processing") {
          out.stillRunning++;
          continue;
        }

        if (t.status === "error") {
          await db
            .update(schema.sources)
            .set({ status: "failed", note: `Transcription failed: ${t.error ?? "unknown error"}` })
            .where(eq(schema.sources.id, src.id));
          out.failed++;
          continue;
        }

        const text = formatTranscript(t);
        if (!text.trim()) {
          await db
            .update(schema.sources)
            .set({ status: "failed", note: "Transcription returned no speech." })
            .where(eq(schema.sources.id, src.id));
          out.failed++;
          continue;
        }

        // One transcript item; the AI run splits it into attributed points.
        await db.insert(schema.feedbackItems).values({
          workspaceId: src.workspaceId,
          sourceId: src.id,
          quote: text,
          reviewStatus: "needs_review",
          reviewReason: "awaiting AI",
        });

        const speakers = speakerCount(t);
        const mins = t.audioDurationSec ? Math.round(t.audioDurationSec / 60) : null;
        await db
          .update(schema.sources)
          .set({
            status: "processed",
            itemCount: 1,
            note: `${mins ? `${mins} min · ` : ""}${speakers} speaker${speakers === 1 ? "" : "s"} identified · run AI analysis to split into feedback`,
            meta: { ...(src.meta as object | null), rawText: text.slice(0, 20000) },
          })
          .where(eq(schema.sources.id, src.id));

        await logAudit({
          workspaceId: src.workspaceId,
          actorLabel: "AI",
          action: "transcribe.completed",
          entityType: "source",
          entityId: src.id,
          after: { speakers, seconds: t.audioDurationSec },
        });

        out.completed++;
      } catch (e) {
        out.failed++;
        if (!firstError) firstError = (e as Error).message;
      }
    }

    if (out.completed || out.failed) {
      revalidatePath("/register");
      revalidatePath("/", "layout");
    }
    return { ...out, error: firstError };
  } catch (e) {
    return { ...out, error: (e as Error).message };
  }
}
