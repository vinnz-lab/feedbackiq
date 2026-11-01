import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptSecret } from "@/lib/secret-box";
import { hashShareToken, looksLikeShareToken, sharePath, type ShareKind } from "@/lib/share-links";
import type { ChannelKind } from "@/lib/digest-channels";

export type ChannelView = { kind: ChannelKind; hint: string; lastPostedAt: string | null };
export type ShareView = { kind: ShareKind; path: string | null; views: number; lastViewedAt: string | null; unreadable?: boolean };

export async function getChannels(workspaceId: string): Promise<ChannelView[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.digestChannels).where(eq(schema.digestChannels.workspaceId, workspaceId));
  return rows.map((r) => ({ kind: r.kind as ChannelKind, hint: r.urlHint, lastPostedAt: r.lastPostedAt?.toISOString() ?? null }));
}

/** The owner's view of a share link, including the link itself (decrypted) so it can be copied again. */
export async function getShareLink(workspaceId: string, kind: ShareKind): Promise<ShareView | null> {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.workspaceId, workspaceId), eq(schema.shareLinks.kind, kind)))
    .limit(1);
  if (!r) return null;
  let path: string | null = null;
  try {
    path = sharePath(decryptSecret(r.encryptedToken));
  } catch {
    /* key changed: the link still works for those who have it, but can't be shown */
  }
  return { kind, path, views: r.viewCount, lastViewedAt: r.lastViewedAt?.toISOString() ?? null, unreadable: !path };
}

/**
 * For the public page: which workspace and what a token opens. Counts the view.
 * Returns null for anything that isn't a live link — the page shows the same
 * "switched off or doesn't exist" message either way.
 */
export async function openShareLink(token: string) {
  if (!looksLikeShareToken(token)) return null;
  const db = await getDb();
  const [r] = await db
    .update(schema.shareLinks)
    .set({ viewCount: sql`${schema.shareLinks.viewCount} + 1`, lastViewedAt: new Date() })
    .where(eq(schema.shareLinks.tokenHash, hashShareToken(token)))
    .returning();
  if (!r) return null;
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, r.workspaceId)).limit(1);
  if (!ws) return null;
  return { kind: r.kind as ShareKind, workspace: ws };
}

export async function latestDigest(workspaceId: string) {
  const db = await getDb();
  const [d] = await db
    .select()
    .from(schema.digests)
    .where(eq(schema.digests.workspaceId, workspaceId))
    .orderBy(desc(schema.digests.createdAt))
    .limit(1);
  return d ?? null;
}
