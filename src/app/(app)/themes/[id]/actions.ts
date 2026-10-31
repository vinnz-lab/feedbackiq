"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/guard";
import { requireWorkspace } from "@/lib/workspace";
import { renameTheme } from "@/lib/themes/rename";

export type RenameResult = { ok: boolean; title?: string; message?: string; error?: string };

export async function renameThemeAction(themeId: string, title: string): Promise<RenameResult> {
  try {
    const ctx = await requireWorkspace();
    const user = ctx.user;
    const ws = ctx.workspace;

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
