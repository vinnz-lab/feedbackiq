"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appOrigin } from "@/lib/jira-workspace";
import { CHANNEL_NAME, checkChannelUrl, postToChannel, slackMessage, teamsMessage, testMessage, type ChannelKind } from "@/lib/digest-channels";
import type { DigestContent } from "@/lib/digest-content";
import { logAudit } from "@/lib/guard";
import { requireCapability } from "@/lib/permissions";
import { canEncrypt, decryptSecret, encryptSecret } from "@/lib/secret-box";
import { generateShareToken, hashShareToken, SHARE_KINDS, type ShareKind } from "@/lib/share-links";
import { latestDigest } from "@/lib/sharing-data";
import { requireWorkspace } from "@/lib/workspace";

export type ActionState = { ok?: string; error?: string };
const isChannel = (k: unknown): k is ChannelKind => k === "slack" || k === "teams";

async function owner() {
  const ctx = await requireWorkspace();
  if (ctx.role !== "owner") throw new Error("Only the workspace owner can change this.");
  return ctx;
}

/* ------------------------------------------------------------ Slack / Teams */

/** Connects a Slack or Teams channel by its webhook link, after a test post. Owner only. */
export async function connectChannel(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await owner();
    const kind = fd.get("kind");
    if (!isChannel(kind)) return { error: "Pick Slack or Teams." };
    if (!canEncrypt()) return { error: "Saving links isn't switched on yet (the platform owner needs to set AI_KEYS_SECRET)." };
    const checked = checkChannelUrl(kind, String(fd.get("url") ?? ""));
    if (!checked.ok) return { error: checked.error };
    const problem = await postToChannel(kind, checked.url, testMessage(kind, ctx.workspace.name));
    if (problem) return { error: problem };
    const db = await getDb();
    const values = { workspaceId: ctx.workspace.id, kind, encryptedUrl: encryptSecret(checked.url), urlHint: checked.hint, createdBy: ctx.user.id, createdAt: new Date(), lastPostedAt: null };
    await db
      .insert(schema.digestChannels)
      .values(values)
      .onConflictDoUpdate({ target: [schema.digestChannels.workspaceId, schema.digestChannels.kind], set: { encryptedUrl: values.encryptedUrl, urlHint: values.urlHint, createdBy: values.createdBy, createdAt: values.createdAt, lastPostedAt: null } });
    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "channel.connected", entityType: "workspace", entityId: ctx.workspace.id, after: { kind, hint: checked.hint } });
    revalidatePath("/integrations");
    revalidatePath("/digest");
    return { ok: `Connected — a test message was sent to the ${CHANNEL_NAME[kind]} channel.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function disconnectChannel(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await owner();
    const kind = fd.get("kind");
    if (!isChannel(kind)) return { error: "Pick Slack or Teams." };
    const db = await getDb();
    await db.delete(schema.digestChannels).where(and(eq(schema.digestChannels.workspaceId, ctx.workspace.id), eq(schema.digestChannels.kind, kind)));
    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "channel.disconnected", entityType: "workspace", entityId: ctx.workspace.id, after: { kind } });
    revalidatePath("/integrations");
    revalidatePath("/digest");
    return { ok: `${CHANNEL_NAME[kind]} disconnected.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Posts the latest digest to a connected channel. Anyone who can edit. */
export async function postDigest(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireCapability("edit");
    const kind = fd.get("kind");
    if (!isChannel(kind)) return { error: "Pick Slack or Teams." };
    const db = await getDb();
    const [ch] = await db
      .select()
      .from(schema.digestChannels)
      .where(and(eq(schema.digestChannels.workspaceId, ctx.workspace.id), eq(schema.digestChannels.kind, kind)))
      .limit(1);
    if (!ch) return { error: `${CHANNEL_NAME[kind]} isn't connected. The workspace owner can connect it in Integrations.` };
    const digest = await latestDigest(ctx.workspace.id);
    if (!digest?.content) return { error: "Generate a digest first." };
    // Don't let a double click post twice.
    if (ch.lastPostedAt && Date.now() - ch.lastPostedAt.getTime() < 30_000) return { error: "It was posted moments ago." };
    let url: string;
    try {
      url = decryptSecret(ch.encryptedUrl);
    } catch {
      return { error: `The saved ${CHANNEL_NAME[kind]} link can't be read any more. The owner should connect it again.` };
    }
    const link = `${await appOrigin()}/digest`;
    const c = digest.content as DigestContent;
    const payload = kind === "slack" ? slackMessage(c, ctx.workspace.name, link) : teamsMessage(c, ctx.workspace.name, link);
    const problem = await postToChannel(kind, url, payload);
    if (problem) return { error: problem };
    await db
      .update(schema.digestChannels)
      .set({ lastPostedAt: new Date() })
      .where(and(eq(schema.digestChannels.workspaceId, ctx.workspace.id), eq(schema.digestChannels.id, ch.id)));
    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "digest.posted", entityType: "digest", entityId: digest.id, after: { kind } });
    revalidatePath("/digest");
    revalidatePath("/integrations");
    return { ok: `Posted to ${CHANNEL_NAME[kind]}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ------------------------------------------------------------ Share links */

/** Creates (or replaces) the read-only link to the digest or roadmap. Owner only. */
export async function createShareLink(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await owner();
    const kind = fd.get("kind") as ShareKind;
    if (!SHARE_KINDS.includes(kind)) return { error: "Unknown link type." };
    if (!canEncrypt()) return { error: "Share links aren't switched on yet (the platform owner needs to set AI_KEYS_SECRET)." };
    const token = generateShareToken();
    const db = await getDb();
    const values = { workspaceId: ctx.workspace.id, kind, tokenHash: hashShareToken(token), encryptedToken: encryptSecret(token), createdBy: ctx.user.id, createdAt: new Date(), viewCount: 0, lastViewedAt: null };
    const existed = (await db.select({ id: schema.shareLinks.id }).from(schema.shareLinks).where(and(eq(schema.shareLinks.workspaceId, ctx.workspace.id), eq(schema.shareLinks.kind, kind))).limit(1)).length > 0;
    await db
      .insert(schema.shareLinks)
      .values(values)
      .onConflictDoUpdate({ target: [schema.shareLinks.workspaceId, schema.shareLinks.kind], set: { tokenHash: values.tokenHash, encryptedToken: values.encryptedToken, createdBy: values.createdBy, createdAt: values.createdAt, viewCount: 0, lastViewedAt: null } });
    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: existed ? "share.replaced" : "share.created", entityType: "workspace", entityId: ctx.workspace.id, after: { kind } });
    revalidatePath(`/${kind}`);
    return { ok: existed ? "New link created — the old one no longer works." : "Link created. Anyone with it can view, but not change anything." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function turnOffShareLink(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await owner();
    const kind = fd.get("kind") as ShareKind;
    if (!SHARE_KINDS.includes(kind)) return { error: "Unknown link type." };
    const db = await getDb();
    await db.delete(schema.shareLinks).where(and(eq(schema.shareLinks.workspaceId, ctx.workspace.id), eq(schema.shareLinks.kind, kind)));
    await logAudit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, actorLabel: ctx.user.name, action: "share.turned_off", entityType: "workspace", entityId: ctx.workspace.id, after: { kind } });
    revalidatePath(`/${kind}`);
    return { ok: "Link turned off. Anyone who had it now sees “switched off”." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
