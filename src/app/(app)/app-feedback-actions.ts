"use server";

import { and, count, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appFeedbackUrl, FEEDBACK_KINDS, MAX_FEEDBACK_CHARS, MAX_PER_HOUR, type FeedbackKind } from "@/lib/app-feedback";
import { logAudit } from "@/lib/guard";
import { requireWorkspace } from "@/lib/workspace";

export type AppFeedbackState = { ok?: string; error?: string };

/** Sends what someone typed into "Send feedback" to the platform owner's workspace. Anyone signed in. */
export async function sendAppFeedback(_prev: AppFeedbackState, fd: FormData): Promise<AppFeedbackState> {
  try {
    const ctx = await requireWorkspace();
    const url = appFeedbackUrl();
    if (!url) return { error: "Sending feedback isn't set up yet." };
    const text = String(fd.get("feedback") ?? "").trim();
    if (text.length < 3) return { error: "Write a few words first." };
    if (text.length > MAX_FEEDBACK_CHARS) return { error: `Please keep it under ${MAX_FEEDBACK_CHARS.toLocaleString()} characters.` };
    const kindRaw = String(fd.get("kind") ?? "Idea");
    const kind: FeedbackKind = (FEEDBACK_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as FeedbackKind) : "Idea";
    const page = String(fd.get("page") ?? "").slice(0, 200).replace(/[^\w/?=&.-]/g, "");

    // A few an hour per person is plenty, and stops a stuck button flooding the inbox.
    const db = await getDb();
    const hourAgo = new Date(Date.now() - 3600_000);
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.workspaceId, ctx.workspace.id), eq(schema.auditEvents.action, "app.feedback_sent"), eq(schema.auditEvents.actorId, ctx.user.id), gt(schema.auditEvents.createdAt, hourAgo)));
    if (Number(n) >= MAX_PER_HOUR) return { error: "Thanks — that's plenty for now. Try again in an hour." };

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "In-app feedback",
        feedback: `[${kind}] ${text}${page ? `\n\n(sent from ${page})` : ""}`,
        customer: ctx.workspace.name,
        name: `${ctx.user.name} <${ctx.user.email}>`,
        date: new Date().toISOString(),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res || !res.ok) return { error: "Couldn't send it just now. Please try again in a minute." };

    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "app.feedback_sent", entityType: "workspace", entityId: ctx.workspace.id, after: { kind, chars: text.length } });
    return { ok: "Thank you — it's on its way to the Insight Hub team." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
