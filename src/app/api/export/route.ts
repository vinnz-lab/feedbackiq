import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
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
  if (user.role !== "owner") {
    return Response.json({ error: "Only the workspace owner can export." }, { status: 403 });
  }

  try {
    const db = await getDb();

    // Ordered so the file reads top-down: who and where, then the taxonomy,
    // then the feedback itself.
    const [
      tenants,
      workspaces,
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
    ] = await Promise.all([
      db.select().from(schema.tenants),
      db.select().from(schema.workspaces),
      db.select().from(schema.users),
      db.select().from(schema.productAreas),
      db.select().from(schema.sources),
      db.select().from(schema.themes),
      db.select().from(schema.feedbackItems),
      db.select().from(schema.enhancements),
      db.select().from(schema.evidenceLinks),
      db.select().from(schema.trackerConnections),
      db.select().from(schema.digests),
      db.select().from(schema.aiConfigs),
      db.select().from(schema.auditEvents),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      note:
        "Full FeedbackIQ export. Every table is included, so this file is enough " +
        "to rebuild the workspace. Keep it somewhere safe — it contains customer " +
        "names and feedback.",
      counts: {
        tenants: tenants.length,
        workspaces: workspaces.length,
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
    const [ws] = workspaces;
    if (ws) {
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
        "Content-Disposition": `attachment; filename="feedbackiq-backup-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("export failed", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
