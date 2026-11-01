"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { browseUrl, createJiraIssue, getJiraIssueStatus, JiraError, mapJiraStatus } from "@/lib/jira";
import { buildTicketFor, jiraAuthFor, nameModeOf } from "@/lib/jira-workspace";
import { logAudit } from "@/lib/guard";
import { requireCapability } from "@/lib/permissions";

/** Marks a roadmap item as "a ticket is being created", so two clicks can't make two tickets. */
const SENDING = "__sending__";
const STALE_CLAIM_MS = 2 * 60_000;

/** Owners and contributors (see lib/permissions.ts). Viewers can see the links but not send or refresh. */
async function jiraContext() {
  return requireCapability("jira");
}

export type PreviewResult = { ok: boolean; preview?: string; error?: string };

/** Exactly what would be sent, with the workspace's name setting applied. Sends nothing. */
export async function previewJiraTicket(enhancementId: string): Promise<PreviewResult> {
  try {
    const ctx = await jiraContext();
    const { conn } = await jiraAuthFor(ctx.workspace.id);
    const t = await buildTicketFor(ctx.workspace.id, enhancementId, nameModeOf(conn));
    if (!t) return { ok: false, error: "That roadmap item no longer exists." };
    return { ok: true, preview: t.preview };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type SendResult = { ok: boolean; key?: string; url?: string; already?: boolean; error?: string };

export async function sendToJira(enhancementId: string): Promise<SendResult> {
  let claimed = false;
  let wsId = "";
  try {
    const ctx = await jiraContext();
    wsId = ctx.workspace.id;
    const { auth, conn } = await jiraAuthFor(wsId);
    const db = await getDb();
    const inWs = and(eq(schema.enhancements.workspaceId, wsId), eq(schema.enhancements.id, enhancementId));

    const [current] = await db.select().from(schema.enhancements).where(inWs).limit(1);
    if (!current) return { ok: false, error: "That roadmap item no longer exists." };
    if (current.jiraKey && current.jiraKey !== SENDING) {
      return { ok: true, already: true, key: current.jiraKey, url: current.jiraUrl ?? undefined };
    }

    // Claim it. Only one request can win; a claim left behind by a crash expires.
    const won = await db
      .update(schema.enhancements)
      .set({ jiraKey: SENDING, jiraSyncedAt: new Date() })
      .where(
        and(
          inWs,
          or(
            isNull(schema.enhancements.jiraKey),
            and(eq(schema.enhancements.jiraKey, SENDING), lt(schema.enhancements.jiraSyncedAt, new Date(Date.now() - STALE_CLAIM_MS))),
          ),
        ),
      )
      .returning({ id: schema.enhancements.id });
    if (!won.length) return { ok: false, error: "This item is already being sent. Refresh the page in a moment." };
    claimed = true;

    const t = await buildTicketFor(wsId, enhancementId, nameModeOf(conn));
    if (!t) throw new Error("That roadmap item no longer exists.");
    const issue = await createJiraIssue(auth, conn.projectKey, conn.issueType ?? "Story", t.summary, t.description);
    const url = browseUrl(auth.site, issue.key);

    let jiraStatus: string | null = null;
    let category: string | null = null;
    try {
      const s = await getJiraIssueStatus(auth, issue.key);
      jiraStatus = s?.name ?? null;
      category = s?.category ?? null;
    } catch {
      /* the ticket exists; its status can be refreshed later */
    }
    await db
      .update(schema.enhancements)
      .set({
        jiraKey: issue.key,
        jiraUrl: url,
        jiraStatus,
        jiraStatusCategory: category,
        jiraSyncedAt: new Date(),
        // In a ticket queue = committed to. Don't overwrite a later status.
        ...(current.status === "review" ? { status: "planned" as const } : {}),
      })
      .where(inWs);
    claimed = false;

    await logAudit({
      workspaceId: wsId,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "jira.issue_created",
      entityType: "enhancement",
      entityId: enhancementId,
      after: { key: issue.key },
    });
    revalidatePath("/roadmap");
    return { ok: true, key: issue.key, url };
  } catch (e) {
    return { ok: false, error: e instanceof JiraError || e instanceof Error ? e.message : "Couldn't send to Jira." };
  } finally {
    if (claimed && wsId) {
      // Nothing was created: release the claim so it can be tried again.
      const db = await getDb();
      await db
        .update(schema.enhancements)
        .set({ jiraKey: null, jiraSyncedAt: null })
        .where(and(eq(schema.enhancements.workspaceId, wsId), eq(schema.enhancements.id, enhancementId), eq(schema.enhancements.jiraKey, SENDING)));
    }
  }
}

export type RefreshResult = { ok: boolean; message?: string; error?: string };

const MAX_REFRESH = 100;

/** Pulls the status of every linked ticket from Jira and updates the roadmap to match. Owner only. */
export async function refreshFromJira(): Promise<RefreshResult> {
  try {
    const ctx = await jiraContext();
    const { auth } = await jiraAuthFor(ctx.workspace.id);
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.enhancements)
      .where(
        and(
          eq(schema.enhancements.workspaceId, ctx.workspace.id),
          isNotNull(schema.enhancements.jiraKey),
          ne(schema.enhancements.jiraKey, SENDING),
        ),
      )
      .limit(MAX_REFRESH);
    if (!rows.length) return { ok: true, message: "No roadmap items are linked to Jira yet." };

    let changed = 0;
    let same = 0;
    let missing = 0;
    let elsewhere = 0;
    for (const e of rows) {
      const inWs = and(eq(schema.enhancements.workspaceId, ctx.workspace.id), eq(schema.enhancements.id, e.id));
      // A ticket on a different Jira site than the one connected now can't be checked.
      if (e.jiraUrl && !e.jiraUrl.startsWith(`${auth.site}/`)) {
        elsewhere++;
        continue;
      }
      let s;
      try {
        s = await getJiraIssueStatus(auth, e.jiraKey!);
      } catch (err) {
        if (err instanceof JiraError && (err.status === 401 || err.status === 403)) return { ok: false, error: err.message };
        throw err;
      }
      if (!s) {
        missing++;
        await db.update(schema.enhancements).set({ jiraStatus: "Not found in Jira", jiraSyncedAt: new Date() }).where(inWs);
        continue;
      }
      const next = mapJiraStatus(s.category, s.resolution);
      if (next !== e.status) changed++;
      else same++;
      await db
        .update(schema.enhancements)
        .set({
          status: next,
          jiraStatus: s.name,
          jiraStatusCategory: s.category,
          jiraSyncedAt: new Date(),
          jiraUrl: e.jiraUrl ?? browseUrl(auth.site, e.jiraKey!),
        })
        .where(inWs);
    }
    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "jira.refreshed",
      entityType: "workspace",
      entityId: ctx.workspace.id,
      after: { checked: rows.length, changed, missing },
    });
    revalidatePath("/roadmap");
    const parts = [`Checked ${rows.length} ticket${rows.length === 1 ? "" : "s"}`, `${changed} status${changed === 1 ? "" : "es"} updated`];
    if (missing) parts.push(`${missing} not found in Jira`);
    if (elsewhere) parts.push(`${elsewhere} on a different Jira site`);
    return { ok: true, message: `${parts.join(" · ")}.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
