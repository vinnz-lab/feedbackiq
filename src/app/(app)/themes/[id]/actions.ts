"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { logAudit, requireUser } from "@/lib/guard";
import { renameTheme } from "@/lib/themes/rename";

export type RenameResult = { ok: boolean; title?: string; message?: string; error?: string };

export async function renameThemeAction(themeId: string, title: string): Promise<RenameResult> {
  try {
    const user = await requireUser();
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { ok: false, error: "No workspace found." };

    const r = await renameTheme(ws.id, themeId, String(title ?? ""));
    if (!r.ok) return { ok: false, error: r.error };
    if (!r.changed) return { ok: true, title: r.title };

    await logAudit({
      workspaceId: ws.id,
      actorId: user.id,
      actorLabel: user.name,
      action: "theme.rename",
      entityType: "theme",
      entityId: themeId,
      after: { from: r.oldTitle, to: r.title, roadmapUpdated: r.roadmapUpdated },
    });

    // The name shows on every one of these pages.
    for (const p of ["/themes", `/themes/${themeId}`, "/dashboard", "/roadmap", "/trends", "/register", "/digest"]) {
      revalidatePath(p);
    }

    return {
      ok: true,
      title: r.title,
      message:
        r.roadmapUpdated > 0
          ? `Renamed. The roadmap item was renamed too.`
          : "Renamed.",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
