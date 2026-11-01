import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Search inside ONE workspace: themes, feedback, roadmap items and sources.
 * Case-insensitive "contains" matching; the user's text is escaped so % and _
 * are taken literally.
 */
export const MIN_QUERY = 2;
export const MAX_QUERY = 100;

export type SearchHit = { id: string; title: string; detail?: string; href: string; badge?: string };
export type SearchResults = {
  query: string;
  themes: SearchHit[];
  feedback: SearchHit[];
  feedbackTotal: number;
  roadmap: SearchHit[];
  sources: SearchHit[];
};

export function cleanQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
}

/** For ILIKE: match the text literally anywhere. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

/** A short piece of `text` around the first match, so you can see why it matched. */
export function snippet(text: string, q: string, width = 110): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const i = flat.toLowerCase().indexOf(q.toLowerCase());
  if (flat.length <= width) return flat;
  if (i < 0) return flat.slice(0, width).trimEnd() + "…";
  const start = Math.max(0, Math.min(i - Math.floor((width - q.length) / 2), flat.length - width));
  return (start > 0 ? "…" : "") + flat.slice(start, start + width).trim() + (start + width < flat.length ? "…" : "");
}

export async function searchWorkspace(workspaceId: string, raw: string, limit = 6): Promise<SearchResults> {
  const q = cleanQuery(raw);
  const empty: SearchResults = { query: q, themes: [], feedback: [], feedbackTotal: 0, roadmap: [], sources: [] };
  if (q.length < MIN_QUERY) return empty;
  const p = likePattern(q);
  const db = await getDb();
  const s = schema;
  const fi = s.feedbackItems;

  const feedbackWhere = and(
    eq(fi.workspaceId, workspaceId),
    ne(fi.reviewStatus, "discarded"),
    or(ilike(fi.quote, p), ilike(fi.customer, p), ilike(fi.submitter, p), ilike(fi.speaker, p)),
  );

  const [themes, feedback, [{ n: feedbackTotal }], roadmap, sources] = await Promise.all([
    db
      .select({ id: s.themes.id, title: s.themes.title, summary: s.themes.summary })
      .from(s.themes)
      .where(and(eq(s.themes.workspaceId, workspaceId), or(ilike(s.themes.title, p), ilike(s.themes.summary, p))))
      // Title matches first.
      .orderBy(sql`CASE WHEN ${s.themes.title} ILIKE ${p} THEN 0 ELSE 1 END`, s.themes.title)
      .limit(limit),
    db
      .select({ id: fi.id, quote: fi.quote, customer: fi.customer, submitter: fi.submitter, status: fi.reviewStatus, themeId: fi.themeId })
      .from(fi)
      .where(feedbackWhere)
      .orderBy(desc(fi.createdAt))
      .limit(limit),
    db.select({ n: sql<number>`count(*)::int` }).from(fi).where(feedbackWhere),
    db
      .select({ id: s.enhancements.id, title: s.enhancements.title, jiraKey: s.enhancements.jiraKey, status: s.enhancements.status })
      .from(s.enhancements)
      .where(
        and(
          eq(s.enhancements.workspaceId, workspaceId),
          or(ilike(s.enhancements.title, p), ilike(s.enhancements.description, p), ilike(s.enhancements.jiraKey, p)),
        ),
      )
      .orderBy(desc(s.enhancements.score))
      .limit(limit),
    db
      .select({ id: s.sources.id, filename: s.sources.filename, itemCount: s.sources.itemCount, kind: s.sources.kind })
      .from(s.sources)
      .where(and(eq(s.sources.workspaceId, workspaceId), ilike(s.sources.filename, p)))
      .orderBy(desc(s.sources.createdAt))
      .limit(limit),
  ]);

  const enc = encodeURIComponent(q);
  const STATUS: Record<string, string> = { review: "Under review", planned: "Planned", progress: "In progress", shipped: "Shipped", wontdo: "Won't do" };
  return {
    query: q,
    themes: themes.map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.summary ? snippet(t.summary, q, 90) : undefined,
      href: `/themes/${t.id}`,
    })),
    feedback: feedback.map((f) => ({
      id: f.id,
      title: `“${snippet(f.quote, q)}”`,
      detail: f.customer ?? f.submitter ?? undefined,
      href: f.status === "needs_review" ? `/register?tab=review&q=${enc}` : f.themeId ? `/themes/${f.themeId}` : `/register?q=${enc}`,
      badge: f.status === "needs_review" ? "Needs review" : undefined,
    })),
    feedbackTotal: Number(feedbackTotal),
    roadmap: roadmap.map((r) => ({
      id: r.id,
      title: r.title,
      detail: [STATUS[r.status] ?? r.status, r.jiraKey && r.jiraKey !== "__sending__" ? r.jiraKey : null].filter(Boolean).join(" · "),
      href: "/roadmap",
    })),
    sources: sources.map((x) => ({
      id: x.id,
      title: x.filename,
      detail: `${x.itemCount} item${x.itemCount === 1 ? "" : "s"}`,
      href: `/register?tab=sources&q=${enc}`,
    })),
  };
}
