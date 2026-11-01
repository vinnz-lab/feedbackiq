/**
 * Jira Cloud client (REST v3, basic auth with an Atlassian API token).
 *
 * SAFETY: requests only ever go to https://<name>.atlassian.net. The site URL
 * comes from a form, and the request carries the user's token, so without this
 * the server could be pointed at any address and asked to send it a secret.
 * Redirects are refused for the same reason.
 */
import type { EnhancementStatusT } from "@/db/schema";

export type NameMode = "include" | "mask" | "remove";
export const NAME_MODES: NameMode[] = ["include", "mask", "remove"];

export type JiraAuth = { site: string; email: string; token: string };

export class JiraError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "JiraError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ URLs */

/** Accepts "acme.atlassian.net", "https://acme.atlassian.net/jira/…", etc. Cloud only. */
export function normalizeJiraSite(raw: string): { ok: true; site: string } | { ok: false; error: string } {
  let s = String(raw ?? "").trim();
  if (!s) return { ok: false, error: "Enter your Jira site, e.g. yourcompany.atlassian.net." };
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: "That doesn't look like a web address." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Use the https:// address of your Jira site." };
  if (u.username || u.password || u.port) return { ok: false, error: "Enter just the site address, e.g. yourcompany.atlassian.net." };
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/.test(host)) {
    return { ok: false, error: "Only Jira Cloud is supported for now — the address should end in .atlassian.net." };
  }
  return { ok: true, site: `https://${host}` };
}

/** The address of a ticket, for linking. */
export function browseUrl(site: string, key: string) {
  return `${site}/browse/${encodeURIComponent(key)}`;
}

/* --------------------------------------------------------------- requests */

function friendly(status: number, body: string, what: string): string {
  if (status === 401) return "Jira didn't accept the email and API token. Check both, and that the token hasn't expired.";
  if (status === 403) return `This Jira account isn't allowed to ${what}.`;
  if (status === 429) return "Jira is limiting requests right now. Try again in a minute.";
  if (status >= 500) return `Jira had a problem (error ${status}). Try again shortly.`;
  try {
    const j = JSON.parse(body) as { errorMessages?: string[]; errors?: Record<string, string> };
    const parts = [...(j.errorMessages ?? []), ...Object.entries(j.errors ?? {}).map(([k, v]) => `${k}: ${v}`)];
    if (parts.length) return `Jira said: ${parts.join("; ").slice(0, 400)}`;
  } catch {
    /* not JSON */
  }
  return `Jira returned error ${status} when trying to ${what}.`;
}

export async function jiraRequest<T>(
  auth: JiraAuth,
  path: string,
  what: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: T | null; raw: string }> {
  const checked = normalizeJiraSite(auth.site);
  if (!checked.ok) throw new JiraError(checked.error);
  if (!path.startsWith("/rest/api/3/")) throw new JiraError("Unexpected Jira path.");
  let res: Response;
  try {
    res = await fetch(`${checked.site}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${auth.email}:${auth.token}`).toString("base64")}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "Jira took too long to answer." : "Couldn't reach your Jira site.";
    throw new JiraError(`${msg} Check the address and try again.`);
  }
  const raw = await res.text();
  let data: T | null = null;
  try {
    data = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data, raw };
}

/* ------------------------------------------------------------ connection */

type Project = { id: string; key: string; name: string; issueTypes?: { id: string; name: string; subtask?: boolean }[] };

/**
 * Checks the details work before anything is saved: the login, the project,
 * and that the issue type exists there. Returns Jira's own spelling of the
 * issue type, so later requests use exactly that.
 */
export async function checkJiraConnection(
  auth: JiraAuth,
  projectKey: string,
  issueType: string,
): Promise<{ ok: true; who: string; projectName: string; issueType: string } | { ok: false; error: string }> {
  try {
    const me = await jiraRequest<{ displayName?: string }>(auth, "/rest/api/3/myself", "sign in");
    if (me.status !== 200) return { ok: false, error: friendly(me.status, me.raw, "sign in") };

    const p = await jiraRequest<Project>(auth, `/rest/api/3/project/${encodeURIComponent(projectKey)}`, "open that project");
    if (p.status === 404) return { ok: false, error: `There's no project with the key ${projectKey}, or this account can't see it.` };
    if (p.status !== 200 || !p.data) return { ok: false, error: friendly(p.status, p.raw, "open that project") };

    const types = (p.data.issueTypes ?? []).filter((t) => !t.subtask);
    const match = types.find((t) => t.name.toLowerCase() === issueType.toLowerCase());
    if (!match) {
      const names = types.map((t) => t.name).join(", ");
      return { ok: false, error: `The project ${projectKey} has no “${issueType}” issue type.${names ? ` It has: ${names}.` : ""}` };
    }
    return { ok: true, who: me.data?.displayName ?? auth.email, projectName: p.data.name, issueType: match.name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* --------------------------------------------------------------- tickets */

export type ADF = { type: "doc"; version: 1; content: unknown[] };

export async function createJiraIssue(
  auth: JiraAuth,
  projectKey: string,
  issueType: string,
  summary: string,
  description: ADF,
): Promise<{ id: string; key: string }> {
  const send = (withLabels: boolean) =>
    jiraRequest<{ id: string; key: string }>(auth, "/rest/api/3/issue", "create a ticket", {
      method: "POST",
      body: {
        fields: {
          project: { key: projectKey },
          issuetype: { name: issueType },
          summary,
          description,
          ...(withLabels ? { labels: ["feedbackiq"] } : {}),
        },
      },
    });
  let r = await send(true);
  // Some projects don't let labels be set. The label is a nicety; the ticket isn't.
  if (r.status === 400 && /labels/i.test(r.raw)) r = await send(false);
  if (r.status !== 201 || !r.data?.key) throw new JiraError(friendly(r.status, r.raw, "create a ticket"), r.status);
  return { id: r.data.id, key: r.data.key };
}

export type JiraIssueStatus = { name: string; category: string; resolution: string | null };

/** null = the ticket no longer exists (or this account can't see it). */
export async function getJiraIssueStatus(auth: JiraAuth, key: string): Promise<JiraIssueStatus | null> {
  const r = await jiraRequest<{
    fields?: { status?: { name?: string; statusCategory?: { key?: string } }; resolution?: { name?: string } | null };
  }>(auth, `/rest/api/3/issue/${encodeURIComponent(key)}?fields=status,resolution`, "read the ticket");
  if (r.status === 404) return null;
  if (r.status !== 200 || !r.data) throw new JiraError(friendly(r.status, r.raw, "read the ticket"), r.status);
  return {
    name: r.data.fields?.status?.name ?? "Unknown",
    category: r.data.fields?.status?.statusCategory?.key ?? "new",
    resolution: r.data.fields?.resolution?.name ?? null,
  };
}

/** Jira's status → the roadmap's. Jira is the source of truth once a ticket exists. */
export function mapJiraStatus(category: string, resolution: string | null): EnhancementStatusT {
  if (category === "done") {
    return resolution && /won'?t|wont|declined|duplicate|cannot reproduce|rejected|not a bug|obsolete/i.test(resolution)
      ? "wontdo"
      : "shipped";
  }
  if (category === "indeterminate") return "progress";
  return "planned";
}

/* ----------------------------------------------------- names in tickets */

export function initials(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  return parts.map((p) => `${p[0].toUpperCase()}.`).join(" ");
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces the names this item is known to carry wherever they appear in its text. */
export function scrubNames(text: string, names: string[], mode: NameMode): string {
  if (mode === "include") return text;
  let out = text;
  for (const n of [...new Set(names.map((x) => x.trim()).filter((x) => x.length >= 3))].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, mode === "mask" ? initials(n) : "[name]");
  }
  return out;
}

/* ------------------------------------------------- building the ticket */

export type EvidenceItem = {
  quote: string;
  customer: string | null;
  submitter: string | null;
  speaker: string | null;
  sourceKind: string | null;
  sourceName: string | null;
  timestampLabel: string | null;
  rowRef: string | null;
};

const KIND_LABEL: Record<string, string> = {
  email: "Email",
  recording: "Call recording",
  transcript: "Call transcript",
  spreadsheet: "Spreadsheet",
  note: "Note",
  paste: "Pasted note",
  webhook: "Sent in by another app",
};

function shorten(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function attribution(it: EvidenceItem, mode: NameMode): string {
  const person = it.speaker || it.submitter;
  const who =
    mode === "remove"
      ? ""
      : [person, it.customer && it.customer !== person ? it.customer : null]
          .filter((x): x is string => Boolean(x))
          .map((x) => (mode === "mask" ? initials(x) : x))
          .join(", ");
  const where = [
    KIND_LABEL[it.sourceKind ?? ""] ?? null,
    mode === "include" ? it.sourceName : null, // file names can contain names too
    it.timestampLabel,
    it.rowRef,
  ]
    .filter(Boolean)
    .join(" · ");
  return [who, where ? `(${where})` : ""].filter(Boolean).join(" ");
}

const text = (t: string, marks?: unknown[]) => (t ? [{ type: "text", text: t, ...(marks ? { marks } : {}) }] : []);
const para = (...nodes: unknown[][]) => ({ type: "paragraph", content: nodes.flat() });
const heading = (t: string) => ({ type: "heading", attrs: { level: 3 }, content: text(t) });
const bullets = (items: unknown[][]) => ({
  type: "bulletList",
  content: items.map((n) => ({ type: "listItem", content: [para(n)] })),
});

/** The ticket's title, description (Jira's ADF) and a plain-text preview of exactly the same content. */
export function buildJiraTicket(input: {
  title: string;
  summary: string | null;
  mentions: number;
  score: number;
  benefit: number;
  effort: number;
  items: EvidenceItem[];
  nameMode: NameMode;
  link: string;
}): { summary: string; description: ADF; preview: string } {
  const summary = shorten(input.title.replace(/[\r\n]+/g, " "), 250) || "Customer feedback";
  const facts = `${input.mentions} customer mention${input.mentions === 1 ? "" : "s"} · Score ${input.score.toFixed(1)}/10 · Benefit ${input.benefit}/10 · Effort ${input.effort}/10`;
  const quotes = input.items.map((it) => {
    const names = [it.customer, it.submitter, it.speaker].filter((x): x is string => Boolean(x));
    const q = shorten(scrubNames(it.quote, names, input.nameMode), 300);
    return { q, by: attribution(it, input.nameMode) };
  });

  const content: unknown[] = [para(text("Raised from customer feedback collected in FeedbackIQ."))];
  if (input.summary) content.push(heading("Why this matters"), para(text(input.summary)));
  content.push(heading("Evidence"), bullets([text(facts)]));
  if (quotes.length) {
    content.push(
      heading("What customers said"),
      bullets(quotes.map(({ q, by }) => [...text(`“${q}”`, [{ type: "em" }]), ...text(by ? ` — ${by}` : "")])),
    );
  }
  content.push(para(text("See all the feedback in FeedbackIQ", [{ type: "link", attrs: { href: input.link } }])));

  const preview = [
    summary,
    "",
    "Raised from customer feedback collected in FeedbackIQ.",
    ...(input.summary ? ["", "Why this matters", input.summary] : []),
    "",
    "Evidence",
    `• ${facts}`,
    ...(quotes.length ? ["", "What customers said", ...quotes.map(({ q, by }) => `• “${q}”${by ? ` — ${by}` : ""}`)] : []),
    "",
    `See all the feedback in FeedbackIQ: ${input.link}`,
  ].join("\n");

  return { summary, description: { type: "doc", version: 1, content }, preview };
}
