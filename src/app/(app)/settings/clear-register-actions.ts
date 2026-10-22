"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser, logAudit } from "@/lib/guard";

export type ClearRegisterState = {
  error?: string;
  ok?: string;
  counts?: Record<string, number>;
};

/**
 * Empties the feedback register so a demo or fresh start begins clean.
 *
 * Deliberately narrow: it removes feedback, sources, themes, roadmap items and
 * digests. Users, logins, team settings, AI configuration and the audit trail
 * are kept. Product areas are kept too, since they are taxonomy rather than
 * feedback.
 *
 * Owner-only, requires the typed word CLEAR and an acknowledged backup, and the
 * deletion runs in one transaction so a failure cannot leave half a register.
 */
export async function clearRegister(
  _prev: ClearRegisterState,
  formData: FormData,
): Promise<ClearRegisterState> {
  try {
    const actor = await requireUser();
    if (actor.role !== "owner") return { error: "Only the workspace owner can clear the register." };

    if (String(formData.get("confirm") ?? "").trim() !== "CLEAR") {
      return { error: "Type CLEAR exactly to confirm." };
    }
    if (formData.get("backupDone") !== "on") {
      return { error: "Download a backup first, then tick the box to confirm." };
    }

    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { error: "No workspace found." };
    const wsId = ws.id;

    const tally = async (table: { workspaceId: unknown }) => {
      const [{ n }] = await db
        .select({ n: count() })
        .from(table as typeof schema.themes)
        .where(eq((table as typeof schema.themes).workspaceId, wsId));
      return Number(n);
    };
    const before = {
      feedbackItems: await tally(schema.feedbackItems as never),
      sources: await tally(schema.sources as never),
      themes: await tally(schema.themes as never),
      roadmapItems: await tally(schema.enhancements as never),
      digests: await tally(schema.digests as never),
    };

    // One transaction: either the whole register goes or none of it does.
    // Children first, so the order never depends on cascade behaviour.
    await db.transaction(async (tx) => {
      await tx.delete(schema.digests).where(eq(schema.digests.workspaceId, wsId));
      await tx.delete(schema.enhancements).where(eq(schema.enhancements.workspaceId, wsId));
      await tx.delete(schema.feedbackItems).where(eq(schema.feedbackItems.workspaceId, wsId));
      await tx.delete(schema.sources).where(eq(schema.sources.workspaceId, wsId));
      await tx.delete(schema.themes).where(eq(schema.themes.workspaceId, wsId));
    });

    await logAudit({
      workspaceId: wsId,
      actorId: actor.id,
      actorLabel: actor.name,
      action: "register.cleared",
      entityType: "workspace",
      entityId: wsId,
      after: before,
    });

    revalidatePath("/", "layout");

    const parts = Object.entries(before)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, " $1").toLowerCase()}`);
    return {
      ok: parts.length
        ? `Cleared ${parts.join(", ")}. The register is empty and ready to start again.`
        : "The register was already empty.",
      counts: before,
    };
  } catch (e) {
    return { error: `Could not clear the register: ${(e as Error).message}` };
  }
}
