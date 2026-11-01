"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { withAiKey } from "@/lib/ai/ai-context";
import { resolveAiKey } from "@/lib/ai/workspace-key";
import { DAILY_LIMIT, KEEP_DAYS, MAX_THEMES, STUCK_AFTER_MS, produceBriefing, pruneBriefings, voiceKeyFor } from "@/lib/briefings";
import { guardAiRun, logAudit } from "@/lib/guard";
import { NAME_MODES, type NameMode } from "@/lib/jira";
import { requireCapability } from "@/lib/permissions";

export type BriefingState = { ok?: string; error?: string };

/** Starts a briefing: checks everything, saves it as "writing", then does the slow work after replying. */
export async function createBriefing(_p: BriefingState, fd: FormData): Promise<BriefingState> {
  try {
    const ctx = await requireCapability("edit");
    const ws = ctx.workspace;
    const themeIds = [...new Set(fd.getAll("themeId").map(String))].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    if (!themeIds.length) return { error: "Pick at least one theme." };
    if (themeIds.length > MAX_THEMES) return { error: `Pick up to ${MAX_THEMES} themes — a briefing on more gets too long to follow.` };
    const nameMode = (NAME_MODES as string[]).includes(String(fd.get("nameMode"))) ? (String(fd.get("nameMode")) as NameMode) : "mask";
    if (String(fd.get("length") ?? "balanced") !== "balanced") return { error: "Deep dive is coming soon. Choose Balanced for now." };

    const db = await getDb();
    const themes = await db
      .select({ id: schema.themes.id, title: schema.themes.title })
      .from(schema.themes)
      .where(and(eq(schema.themes.workspaceId, ws.id), inArray(schema.themes.id, themeIds)));
    if (themes.length !== themeIds.length) return { error: "One of those themes no longer exists. Refresh and try again." };
    const [{ n: approved }] = await db
      .select({ n: count() })
      .from(schema.feedbackItems)
      .where(and(eq(schema.feedbackItems.workspaceId, ws.id), eq(schema.feedbackItems.reviewStatus, "approved"), inArray(schema.feedbackItems.themeId, themeIds)));
    if (!Number(approved)) return { error: "Those themes have no approved feedback yet, so there's nothing to talk about." };

    const b = schema.audioBriefings;
    const busy = await db
      .select({ id: b.id })
      .from(b)
      .where(and(eq(b.workspaceId, ws.id), inArray(b.status, ["writing", "voicing"]), gt(b.createdAt, new Date(Date.now() - STUCK_AFTER_MS))))
      .limit(1);
    if (busy.length) return { error: "A briefing is already being made. Wait for it to finish first." };

    const [{ n: today }] = await db
      .select({ n: count() })
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.workspaceId, ws.id), eq(schema.auditEvents.action, "ai.audio"), gt(schema.auditEvents.createdAt, new Date(Date.now() - 86_400_000))));
    if (Number(today) >= DAILY_LIMIT) return { error: `This workspace has made ${DAILY_LIMIT} briefings in the last 24 hours, the daily limit. Try again tomorrow.` };

    const ai = await resolveAiKey(ws.id);
    const voice = await voiceKeyFor(ws.id);
    const gate = await guardAiRun("ai.audio", ws.id, ctx.user, ai.source);
    if (!gate.ok) return { error: gate.error };

    const [row] = await db
      .insert(b)
      .values({
        workspaceId: ws.id,
        title: themes.length === 1 ? themes[0].title : `${themes[0].title} and ${themes.length - 1} more`,
        themeIds,
        themeTitles: themeIds.map((id) => themes.find((t) => t.id === id)!.title),
        length: "balanced",
        nameMode,
        status: "writing",
        createdBy: ctx.user.id,
        expiresAt: new Date(Date.now() + KEEP_DAYS * 86_400_000),
      })
      .returning({ id: b.id });
    await pruneBriefings(ws.id);
    await logAudit({ workspaceId: ws.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "briefing.created", entityType: "briefing", entityId: row.id, after: { themes: themeIds.length, nameMode, voice: voice?.source ?? "none" } });

    // The slow part (writing + voicing, a minute or two) runs after we've replied.
    after(() => withAiKey(ai, () => produceBriefing(row.id, ws.id, voice)));
    revalidatePath("/briefings");
    return {
      ok: voice
        ? "Started — the script is being written and voiced. It usually takes a minute or two; the bell will tell you when it's ready."
        : "Started — the script is being written. (Voices need a Google Gemini key, so this one will be script only.)",
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Deletes a briefing and its audio. Anyone who can edit. */
export async function deleteBriefing(_p: BriefingState, fd: FormData): Promise<BriefingState> {
  try {
    const ctx = await requireCapability("edit");
    const id = String(fd.get("id") ?? "");
    const db = await getDb();
    await db.delete(schema.audioBriefings).where(and(eq(schema.audioBriefings.workspaceId, ctx.workspace.id), eq(schema.audioBriefings.id, id)));
    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "briefing.deleted", entityType: "briefing", entityId: id });
    revalidatePath("/briefings");
    return { ok: "Deleted." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
