import { count } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keeps the database from being auto-paused.
 *
 * Supabase pauses a free project after 7 days without database queries. This
 * endpoint runs one trivial read so a scheduled call counts as activity.
 *
 * Scheduled every 3 days rather than every 4: cron gaps of 4 days mean a single
 * missed run leaves an 8-day gap, which breaches the 7-day window. At 3 days a
 * single failure still lands inside it.
 *
 * Read-only by design — it must never be able to change anything.
 */
export async function GET(request: Request) {
  // When CRON_SECRET is configured, Vercel sends it as the Authorization
  // header. Optional on purpose: requiring it would mean the schedule silently
  // fails until the variable is set, which defeats the point of the job.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Not authorised." }, { status: 401 });
    }
  }

  try {
    const db = await getDb();
    const [{ n }] = await db.select({ n: count() }).from(schema.feedbackItems);
    return Response.json({
      ok: true,
      at: new Date().toISOString(),
      feedbackItems: Number(n),
      secured: Boolean(secret),
    });
  } catch (e) {
    // Surface the failure so a broken keep-alive is visible in the logs rather
    // than looking like a success while the project drifts toward a pause.
    console.error("keepalive failed", e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
