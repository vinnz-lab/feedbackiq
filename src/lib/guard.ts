import { and, desc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Security + abuse guards.
 *
 * Why this file exists: the (app) layout gates *page rendering*, but server
 * actions and route handlers are independently addressable HTTP endpoints.
 * Anything that mutates data or spends AI quota must check the caller itself.
 */

/** AI runs are capped per workspace: a cooldown stops double-clicks, the daily
 *  cap stops a runaway loop draining the Gemini free-tier quota. */
export const AI_COOLDOWN_MS = 15_000;
export const AI_DAILY_CAP = 25;

export type AiAction = "ai.classify" | "ai.summarize" | "ai.digest";

/** Returns the signed-in user, or throws. Use in every mutating server action. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  return user;
}

/** Records an entry in the audit trail. */
export async function logAudit(opts: {
  workspaceId: string;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  after?: unknown;
}) {
  const db = await getDb();
  await db.insert(schema.auditEvents).values({
    workspaceId: opts.workspaceId,
    actorId: opts.actorId ?? null,
    actorLabel: opts.actorLabel ?? null,
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId ?? null,
    after: (opts.after ?? null) as never,
  });
}

/**
 * Rate-limits an AI action and records the attempt.
 *
 * Backed by the audit_events table rather than process memory on purpose:
 * Vercel runs several instances, so an in-memory counter would be trivially
 * bypassed. This also gives a real audit trail for free.
 *
 * Call BEFORE spending any quota. A recorded attempt counts even if the run
 * later fails, which is correct — a failed run still costs API calls.
 */
export async function guardAiRun(
  action: AiAction,
  workspaceId: string,
  actor: { id: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await getDb();
  const ae = schema.auditEvents;

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await db
    .select({ createdAt: ae.createdAt })
    .from(ae)
    .where(and(eq(ae.workspaceId, workspaceId), eq(ae.action, action), gt(ae.createdAt, dayAgo)))
    .orderBy(desc(ae.createdAt));

  if (recent.length >= AI_DAILY_CAP) {
    return {
      ok: false,
      error: `Daily AI limit reached (${AI_DAILY_CAP} runs in 24h). This protects your AI quota and budget — try again later.`,
    };
  }

  const last = recent[0]?.createdAt;
  if (last) {
    const waited = Date.now() - new Date(last).getTime();
    if (waited < AI_COOLDOWN_MS) {
      const secs = Math.ceil((AI_COOLDOWN_MS - waited) / 1000);
      return { ok: false, error: `Just ran — please wait ${secs}s before running this again.` };
    }
  }

  await logAudit({
    workspaceId,
    actorId: actor.id,
    actorLabel: actor.name,
    action,
    entityType: "ai_run",
  });
  return { ok: true };
}
