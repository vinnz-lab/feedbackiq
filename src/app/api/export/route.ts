import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { eq, inArray } from "drizzle-orm";
import { logAudit } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Downloads the whole workspace as one JSON file.
 *
 * The free Supabase plan has NO automatic backups and its docs state plainly
 * that "database backups are not available for download for Free Plan
 * projects" — the documented alternative is a command-line tool. This gives the
 * same safety net from the browser, and removes the deadline that otherwise
 * applies to restoring a paused project.
 *
 * Owner-only: it returns every quote, customer name and email in the workspace.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to export." }, { status: 401 });
  const ctx = await getWorkspaceContext();
  if (!ctx) return Response.json({ error: "You don't have access to a workspace yet." }, { status: 403 });
  if (ctx.role !== "owner") {
    return Response.json({ error: "Only the workspace owner can export." }, { status: 403 });
  }
  const wsId = ctx.workspace.id;

  try {
    const db = await getDb();
    const byWs = <T extends { workspaceId: unknown }>(t: T) => eq(t.workspaceId as never, wsId);

    // ONLY the current workspace. Other workspaces (other testers, later other
    // clients) must never appear in someone else's backup.
    // One query at a time. Firing all of them at once on a cold serverless
    // connection is what stalled the live backup for the full five minutes.
    const tenants = await db.select().from(schema.tenants).where(eq(schema.tenants.id, ctx.workspace.tenantId));
    const workspaces = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, wsId));
    const workspaceMembers = await db.select().from(schema.workspaceMembers).where(byWs(schema.workspaceMembers));
    const productAreas = await db.select().from(schema.productAreas).where(byWs(schema.productAreas));
    const sources = await db.select().from(schema.sources).where(byWs(schema.sources));
    const themes = await db.select().from(schema.themes).where(byWs(schema.themes));
    const feedbackItems = await db.select().from(schema.feedbackItems).where(byWs(schema.feedbackItems));
    const enhancements = await db.select().from(schema.enhancements).where(byWs(schema.enhancements));
    const trackerConnections = await db.select().from(schema.trackerConnections).where(byWs(schema.trackerConnections));
    const digests = await db.select().from(schema.digests).where(byWs(schema.digests));
    const aiConfigs = await db.select().from(schema.aiConfigs).where(byWs(schema.aiConfigs));
    const auditEvents = await db.select().from(schema.auditEvents).where(byWs(schema.auditEvents));

    const memberIds = workspaceMembers.map((m) => m.userId);
    const users = memberIds.length
      ? await db.select().from(schema.users).where(inArray(schema.users.id, memberIds))
      : [];
    const enhIds = enhancements.map((e) => e.id);
    const evidenceLinks = enhIds.length
      ? await db.select().from(schema.evidenceLinks).where(inArray(schema.evidenceLinks.enhancementId, enhIds))
      : [];

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      note:
        "FeedbackIQ export of ONE workspace (" + ctx.workspace.name + "). Everything in it is included, so this file is enough " +
        "to rebuild that workspace. Keep it somewhere safe — it contains customer " +
        "names and feedback.",
      counts: {
        tenants: tenants.length,
        workspaces: workspaces.length,
        workspaceMembers: workspaceMembers.length,
        users: users.length,
        productAreas: productAreas.length,
        sources: sources.length,
        themes: themes.length,
        feedbackItems: feedbackItems.length,
        enhancements: enhancements.length,
        evidenceLinks: evidenceLinks.length,
        trackerConnections: trackerConnections.length,
        digests: digests.length,
        aiConfigs: aiConfigs.length,
        auditEvents: auditEvents.length,
      },
      data: {
        tenants,
        workspaces,
        workspaceMembers,
        users,
        productAreas,
        sources,
        themes,
        feedbackItems,
        enhancements,
        evidenceLinks,
        trackerConnections,
        digests,
        aiConfigs,
        auditEvents,
      },
    };

    const stamp = new Date().toISOString().slice(0, 10);
    // Fire-and-forget audit: an export is a sensitive read worth recording.
    const ws = ctx.workspace;
    {
      await logAudit({
        workspaceId: ws.id,
        actorId: user.id,
        actorLabel: user.name,
        action: "data.export",
        entityType: "workspace",
        entityId: ws.id,
        after: { items: feedbackItems.length },
      }).catch(() => {});
    }

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="feedbackiq-${ctx.workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-backup-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("export failed", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
