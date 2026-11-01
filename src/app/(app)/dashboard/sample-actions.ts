"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/guard";
import { requireCapability } from "@/lib/permissions";
import { loadSampleData, removeSampleData } from "@/lib/sample-data";

export type SampleState = { ok?: string; error?: string };

const PAGES = ["/dashboard", "/themes", "/register", "/roadmap", "/trends", "/digest"];

/** Fills an empty workspace with sample feedback. Anyone who can edit. */
export async function addSampleData(_prev: SampleState, _fd: FormData): Promise<SampleState> {
  try {
    const ctx = await requireCapability("edit");
    const r = await loadSampleData(ctx.workspace.id);
    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "sample.loaded", entityType: "workspace", entityId: ctx.workspace.id, after: r });
    PAGES.forEach((p) => revalidatePath(p));
    return { ok: `Added ${r.items} sample feedback items in ${r.themes} themes. Have a look around — and remove it all with one click when you're done.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Removes the sample data again. Anyone who can edit. */
export async function clearSampleData(_prev: SampleState, _fd: FormData): Promise<SampleState> {
  try {
    const ctx = await requireCapability("edit");
    const r = await removeSampleData(ctx.workspace.id);
    if (!r.removed) return { ok: "There's no sample data in this workspace." };
    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "sample.removed", entityType: "workspace", entityId: ctx.workspace.id });
    PAGES.forEach((p) => revalidatePath(p));
    return { ok: "Sample data removed." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
