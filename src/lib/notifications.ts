import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * The bell: recent things worth knowing about in ONE workspace, built from data
 * the app already keeps (sources, themes, digests, the audit trail). Nothing
 * is stored per notification; "unread" is tracked in the browser.
 */
export type Notice = {
  id: string;
  icon: string;
  title: string;
  detail?: string;
  href: string;
  at: string; // ISO
  mine: boolean; // caused by the person looking, so it never lights the dot
};
export type NoticeFeed = { waitingForReview: number; notices: Notice[] };

const WINDOW_DAYS = 14;
const MAX = 25;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export async function getNotifications(workspaceId: string, userId: string): Promise<NoticeFeed> {
  const db = await getDb();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const s = schema;

  const [review, sources, themes, digests, audits] = await Promise.all([
    db
      .select({ id: s.feedbackItems.id })
      .from(s.feedbackItems)
      .where(and(eq(s.feedbackItems.workspaceId, workspaceId), eq(s.feedbackItems.reviewStatus, "needs_review"))),
    db
      .select()
      .from(s.sources)
      .where(and(eq(s.sources.workspaceId, workspaceId), gt(s.sources.createdAt, since)))
      .orderBy(desc(s.sources.createdAt))
      .limit(MAX),
    db
      .select({ id: s.themes.id, title: s.themes.title, isEmerging: s.themes.isEmerging, createdAt: s.themes.createdAt })
      .from(s.themes)
      .where(and(eq(s.themes.workspaceId, workspaceId), gt(s.themes.createdAt, since)))
      .orderBy(desc(s.themes.createdAt))
      .limit(MAX),
    db
      .select({ id: s.digests.id, createdAt: s.digests.createdAt })
      .from(s.digests)
      .where(and(eq(s.digests.workspaceId, workspaceId), gt(s.digests.createdAt, since)))
      .orderBy(desc(s.digests.createdAt))
      .limit(5),
    db
      .select()
      .from(s.auditEvents)
      .where(
        and(
          eq(s.auditEvents.workspaceId, workspaceId),
          gt(s.auditEvents.createdAt, since),
          inArray(s.auditEvents.action, ["ingest.upload", "jira.issue_created", "jira.refreshed", "theme.merge", "theme.rename", "ai.digest"]),
        ),
      )
      .orderBy(desc(s.auditEvents.createdAt))
      .limit(MAX * 2),
  ]);

  const notices: Notice[] = [];
  const who = (a: { actorId: string | null; actorLabel: string | null }) => (a.actorId === userId ? "You" : a.actorLabel || "Someone");

  // Uploads come with who did them; match them to their sources so each shows once.
  const uploadedNames = new Map<string, { actor: string; mine: boolean }>();
  for (const a of audits) {
    if (a.action !== "ingest.upload") continue;
    const names = ((a.after as { sources?: string[] } | null)?.sources ?? []) as string[];
    for (const n of names) if (!uploadedNames.has(n)) uploadedNames.set(n, { actor: who(a), mine: a.actorId === userId });
  }

  for (const src of sources) {
    const at = src.createdAt.toISOString();
    if (src.status === "failed") {
      notices.push({ id: `src-${src.id}`, icon: "⚠️", title: `Couldn't read ${src.filename}`, detail: src.note ?? undefined, href: "/register?tab=sources", at, mine: false });
      continue;
    }
    if (!src.itemCount) continue;
    if (src.kind === "webhook" || src.autoIngested) {
      notices.push({
        id: `src-${src.id}`,
        icon: src.kind === "webhook" ? "🔌" : "📥",
        title: `${plural(src.itemCount, "new item")} arrived from ${src.filename}`,
        detail: "Waiting for review",
        href: "/register?tab=review",
        at,
        mine: false,
      });
    } else {
      const u = uploadedNames.get(src.filename);
      notices.push({
        id: `src-${src.id}`,
        icon: "📄",
        title: `${u ? `${u.actor} added` : "Added"} ${plural(src.itemCount, "item")} from ${src.filename}`,
        href: "/register?tab=review",
        at,
        mine: u?.mine ?? false,
      });
    }
  }

  for (const t of themes) {
    notices.push({
      id: `theme-${t.id}`,
      icon: t.isEmerging ? "📈" : "🏷️",
      title: `${t.isEmerging ? "Emerging theme" : "New theme"}: ${t.title}`,
      href: `/themes/${t.id}`,
      at: t.createdAt.toISOString(),
      mine: false,
    });
  }

  const digestActors = audits.filter((a) => a.action === "ai.digest");
  for (const d of digests) {
    // The digest run logged just before the digest was saved tells us who asked for it.
    const by = digestActors.find((a) => Math.abs(a.createdAt.getTime() - d.createdAt.getTime()) < 10 * 60_000);
    notices.push({
      id: `digest-${d.id}`,
      icon: "📰",
      title: `${by ? `${who(by)} generated` : "New"} weekly digest`,
      detail: "Ready to read and share",
      href: "/digest",
      at: d.createdAt.toISOString(),
      mine: by?.actorId === userId,
    });
  }

  for (const a of audits) {
    const after = (a.after ?? {}) as Record<string, unknown>;
    const base = { id: `audit-${a.id}`, at: a.createdAt.toISOString(), mine: a.actorId === userId };
    if (a.action === "jira.issue_created") {
      notices.push({ ...base, icon: "🎫", title: `${who(a)} created Jira ticket ${String(after.key ?? "")}`.trim(), href: "/roadmap", });
    } else if (a.action === "jira.refreshed") {
      const changes = (after.changes as { key: string; title: string; status: string }[] | undefined) ?? [];
      changes.forEach((c, i) =>
        notices.push({ ...base, id: `${base.id}-${i}`, icon: "🔄", title: `${c.key} is now “${c.status}” in Jira`, detail: c.title, href: "/roadmap", mine: false }),
      );
    } else if (a.action === "theme.merge") {
      notices.push({ ...base, icon: "🧩", title: `Themes merged into “${String(after.title ?? "")}”`, detail: after.itemsMoved ? `${plural(Number(after.itemsMoved), "item")} moved` : undefined, href: a.entityId ? `/themes/${a.entityId}` : "/themes", mine: false });
    } else if (a.action === "theme.rename") {
      notices.push({ ...base, icon: "✏️", title: `${who(a)} renamed a theme`, detail: `“${String(after.from ?? "")}” → “${String(after.to ?? "")}”`, href: a.entityId ? `/themes/${a.entityId}` : "/themes" });
    }
  }

  notices.sort((x, y) => y.at.localeCompare(x.at));
  return { waitingForReview: review.length, notices: notices.slice(0, MAX) };
}
