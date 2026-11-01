import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { quoteKey } from "@/lib/ingest/fingerprint";
import {
  hashWebhookToken,
  looksLikeWebhookToken,
  MAX_BODY_BYTES,
  MAX_PER_MINUTE,
  parseWebhookBody,
} from "@/lib/webhook";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * Receives feedback for the workspace that owns `token`. No login: the secret
 * address IS the permission. Everything arrives in Needs review, flagged
 * "arrived unattended", exactly like other automatic sources.
 */
export async function receiveWebhook(token: string | null, request: Request): Promise<Response> {
  // Same answer for malformed, unknown and switched-off addresses.
  const denied = () => json({ ok: false, error: "Unknown or switched-off webhook address." }, 401);
  if (!looksLikeWebhookToken(token)) return denied();

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ ok: false, error: "Too much data in one request (max 256 KB)." }, 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json({ ok: false, error: "Too much data in one request (max 256 KB)." }, 413);

  const db = await getDb();
  const [hook] = await db
    .select()
    .from(schema.incomingWebhooks)
    .where(and(eq(schema.incomingWebhooks.tokenHash, hashWebhookToken(token)), eq(schema.incomingWebhooks.enabled, true)))
    .limit(1);
  if (!hook) return denied();

  // A rolling one-minute allowance, updated atomically.
  const [win] = await db
    .update(schema.incomingWebhooks)
    .set({
      windowStart: sql`CASE WHEN ${schema.incomingWebhooks.windowStart} IS NULL OR ${schema.incomingWebhooks.windowStart} < now() - interval '1 minute' THEN now() ELSE ${schema.incomingWebhooks.windowStart} END`,
      windowCount: sql`CASE WHEN ${schema.incomingWebhooks.windowStart} IS NULL OR ${schema.incomingWebhooks.windowStart} < now() - interval '1 minute' THEN 1 ELSE ${schema.incomingWebhooks.windowCount} + 1 END`,
      lastUsedAt: new Date(),
    })
    .where(eq(schema.incomingWebhooks.id, hook.id))
    .returning({ count: schema.incomingWebhooks.windowCount });
  if ((win?.count ?? 0) > MAX_PER_MINUTE) {
    return json({ ok: false, error: `Too many requests — at most ${MAX_PER_MINUTE} a minute.` }, 429, { "Retry-After": "60" });
  }

  const parsed = parseWebhookBody(raw, request.headers.get("content-type") ?? "");
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  // Skip feedback already in the workspace (and repeats within this request).
  const known = new Set<string>();
  for (const r of await db
    .select({ quote: schema.feedbackItems.quote })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.workspaceId, hook.workspaceId))) {
    const k = quoteKey(r.quote);
    if (k) known.add(k);
  }
  const fresh = parsed.items.filter((it) => {
    const k = quoteKey(it.quote);
    if (!k) return true;
    if (known.has(k)) return false;
    known.add(k);
    return true;
  });
  const skipped = parsed.items.length - fresh.length;

  if (fresh.length) {
    await db.transaction(async (tx) => {
      const [src] = await tx
        .insert(schema.sources)
        .values({
          workspaceId: hook.workspaceId,
          kind: "webhook",
          filename: parsed.source ? `${parsed.source} (webhook)` : "Webhook",
          status: "processed",
          itemCount: fresh.length,
          autoIngested: true,
          note: `Sent in by another app${skipped ? ` · ${skipped} already present, skipped` : ""}`,
          meta: { via: "webhook" },
        })
        .returning({ id: schema.sources.id });
      await tx.insert(schema.feedbackItems).values(
        fresh.map((it) => ({
          workspaceId: hook.workspaceId,
          sourceId: src.id,
          quote: it.quote,
          customer: it.customer,
          submitter: it.submitter,
          occurredAt: it.occurredAt,
          reviewStatus: "needs_review" as const,
          reviewReason: "arrived unattended",
        })),
      );
      await tx
        .update(schema.incomingWebhooks)
        .set({ receivedCount: sql`${schema.incomingWebhooks.receivedCount} + ${fresh.length}` })
        .where(eq(schema.incomingWebhooks.id, hook.id));
    });
  }

  return json({
    ok: true,
    received: fresh.length,
    skippedDuplicates: skipped,
    ...(parsed.ignored ? { ignored: parsed.ignored } : {}),
    ...(parsed.truncated ? { truncated: parsed.truncated } : {}),
  });
}

export const webhookHelp = () =>
  json(
    {
      ok: false,
      error: "Send feedback to this address with POST, as JSON such as {\"feedback\": \"…\", \"customer\": \"…\"}.",
    },
    405,
    { Allow: "POST" },
  );
