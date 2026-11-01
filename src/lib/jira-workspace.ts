import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeScore } from "@/lib/score";
import { decryptSecret } from "@/lib/secret-box";
import { buildJiraTicket, type EvidenceItem, type JiraAuth, type NameMode, NAME_MODES } from "@/lib/jira";

export type JiraConnection = typeof schema.trackerConnections.$inferSelect;

/** The workspace's connection row, or null. Rows without credentials (old demo placeholders) count as not connected. */
export async function getJiraConnection(workspaceId: string): Promise<JiraConnection | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.trackerConnections)
    .where(and(eq(schema.trackerConnections.workspaceId, workspaceId), eq(schema.trackerConnections.provider, "jira")))
    .limit(1);
  return row ?? null;
}

export function isConnected(c: JiraConnection | null): c is JiraConnection & { siteUrl: string; authEmail: string; encryptedToken: string; projectKey: string } {
  return Boolean(c?.siteUrl && c.authEmail && c.encryptedToken && c.projectKey);
}

export function nameModeOf(c: JiraConnection | null): NameMode {
  return NAME_MODES.includes(c?.nameMode as NameMode) ? (c!.nameMode as NameMode) : "include";
}

/** What the UI may see about a connection — never the token. */
export function connectionView(c: JiraConnection | null) {
  return isConnected(c)
    ? {
        connected: true as const,
        site: c.siteUrl,
        email: c.authEmail,
        projectKey: c.projectKey,
        issueType: c.issueType ?? "Story",
        nameMode: nameModeOf(c),
        tokenLast4: c.tokenLast4,
        updatedAt: c.updatedAt.toISOString(),
      }
    : { connected: false as const };
}

/** Decrypted login for this workspace's Jira. Throws a plain-language error if it can't be used. */
export async function jiraAuthFor(workspaceId: string): Promise<{ auth: JiraAuth; conn: JiraConnection & { projectKey: string } }> {
  const c = await getJiraConnection(workspaceId);
  if (!isConnected(c)) throw new Error("Connect Jira first, in Integrations → Jira.");
  let token: string;
  try {
    token = decryptSecret(c.encryptedToken);
  } catch {
    throw new Error("The saved Jira token can't be read. Its owner should connect Jira again in Integrations.");
  }
  return { auth: { site: c.siteUrl, email: c.authEmail, token }, conn: c };
}

/** This deployment's own address, for the link back from the ticket. */
export async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The ticket for one roadmap item: its CURRENT theme name and summary, the
 * numbers, and the five strongest pieces of approved feedback behind it
 * (high-severity and negative first, then newest).
 */
export async function buildTicketFor(workspaceId: string, enhancementId: string, nameMode: NameMode) {
  const db = await getDb();
  const [row] = await db
    .select({ e: schema.enhancements, theme: schema.themes })
    .from(schema.enhancements)
    .leftJoin(schema.themes, eq(schema.enhancements.themeId, schema.themes.id))
    .where(and(eq(schema.enhancements.workspaceId, workspaceId), eq(schema.enhancements.id, enhancementId)))
    .limit(1);
  if (!row) return null;
  const { e, theme } = row;

  let items: EvidenceItem[] = [];
  let mentions = e.demand;
  if (theme) {
    const fi = schema.feedbackItems;
    const rows = await db
      .select({
        quote: fi.quote,
        customer: fi.customer,
        submitter: fi.submitter,
        speaker: fi.speaker,
        timestampLabel: fi.timestampLabel,
        rowRef: fi.rowRef,
        severity: fi.severity,
        sentiment: fi.sentiment,
        createdAt: fi.createdAt,
        sourceKind: schema.sources.kind,
        sourceName: schema.sources.filename,
      })
      .from(fi)
      .leftJoin(schema.sources, eq(fi.sourceId, schema.sources.id))
      .where(and(eq(fi.workspaceId, workspaceId), eq(fi.themeId, theme.id), eq(fi.reviewStatus, "approved")))
      .orderBy(desc(fi.createdAt));
    mentions = rows.length || e.demand;
    const rank = (r: (typeof rows)[number]) => (r.severity === "High" ? 2 : 0) + (r.sentiment === "Negative" ? 1 : 0);
    items = [...rows].sort((a, b) => rank(b) - rank(a)).slice(0, 5);
  }

  const link = `${await appOrigin()}${theme ? `/themes/${theme.id}` : "/roadmap"}`;
  return buildJiraTicket({
    title: theme?.title ?? e.title,
    summary: theme?.summary ?? e.description ?? null,
    mentions,
    score: computeScore(e.benefit, e.effort, e.demand),
    benefit: e.benefit,
    effort: e.effort,
    items,
    nameMode,
    link,
  });
}
