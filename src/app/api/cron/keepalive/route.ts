import { and, count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { deleteExpiredBriefings } from "@/lib/briefings-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keeps the database from being auto-paused, and reports on itself.
 *
 * Supabase pauses a free project after a week without "sufficient" activity,
 * and their wording is "a few user requests to the database EACH DAY over the
 * previous week". An earlier version ran a single read every three days, which
 * was evidently too sparse — the pause warning arrived anyway. So: daily (the
 * most Vercel's Hobby plan allows), and several queries per run.
 *
 * It also records each run, which is what makes it debuggable. Vercel stamps
 * its own requests with a `vercel-cron/1.0` user agent, so a scheduled run is
 * distinguishable from someone calling the URL by hand. Without that, there is
 * no way to tell "the schedule never fired" from "the schedule fired but wasn't
 * enough" — and those need opposite fixes.
 */
const CRON_AGENT = "vercel-cron";

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

  const agent = request.headers.get("user-agent") ?? "";
  const viaCron = agent.toLowerCase().includes(CRON_AGENT);

  try {
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);

    // Audio briefings live 30 days; this is the daily sweep.
    const expiredBriefings = await deleteExpiredBriefings().catch(() => -1);

    // Several small reads rather than one, to match "a few requests each day".
    const [[items], [themes], [sources]] = await Promise.all([
      db.select({ n: count() }).from(schema.feedbackItems),
      db.select({ n: count() }).from(schema.themes),
      db.select({ n: count() }).from(schema.sources),
    ]);

    // When was this last run by the SCHEDULER, as opposed to by hand? This is
    // the answer to "is the cron actually firing?".
    let lastCronRun: string | null = null;
    let cronRunsLogged = 0;
    if (ws) {
      const priorCron = await db
        .select({ at: schema.auditEvents.createdAt })
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.action, "cron.keepalive"),
            eq(schema.auditEvents.actorLabel, "cron"),
          ),
        )
        .orderBy(desc(schema.auditEvents.createdAt))
        .limit(1);
      lastCronRun = priorCron[0]?.at ? new Date(priorCron[0].at).toISOString() : null;

      const [{ n }] = await db
        .select({ n: count() })
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.action, "cron.keepalive"),
            eq(schema.auditEvents.actorLabel, "cron"),
          ),
        );
      cronRunsLogged = Number(n);

      // A write is unambiguously activity, where a read might not be. Best
      // effort — a failed log must not make the keep-alive itself fail.
      try {
        await db.insert(schema.auditEvents).values({
          workspaceId: ws.id,
          actorLabel: viaCron ? "cron" : "manual",
          action: "cron.keepalive",
          entityType: "database",
        });
      } catch {
        /* the reads above already counted as activity */
      }
    }

    return Response.json({
      ok: true,
      expiredBriefings,
      at: new Date().toISOString(),
      viaCron,
      // Diagnostics: if cronRunsLogged stays 0 while manual calls work, the
      // schedule itself is not firing and no frequency change will help.
      lastCronRun,
      cronRunsLogged,
      counts: { feedbackItems: Number(items.n), themes: Number(themes.n), sources: Number(sources.n) },
      secured: Boolean(secret),
    });
  } catch (e) {
    console.error("keepalive failed", e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
