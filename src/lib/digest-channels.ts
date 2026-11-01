import type { DigestContent } from "@/lib/digest-content";

/**
 * Posting a digest to Slack or Microsoft Teams through a channel's
 * incoming-webhook address — no app to install, nothing to approve.
 */
export type ChannelKind = "slack" | "teams";
export const CHANNEL_NAME: Record<ChannelKind, string> = { slack: "Slack", teams: "Microsoft Teams" };

/** Only the real Slack/Teams webhook hosts, over https, so the server can't be pointed anywhere else. */
export function checkChannelUrl(kind: ChannelKind, raw: string): { ok: true; url: string; hint: string } | { ok: false; error: string } {
  const text = raw.trim();
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, error: "That isn't a web address. Paste the whole webhook link." };
  }
  if (u.protocol !== "https:" || u.username || u.password) return { ok: false, error: "The webhook link must start with https://" };
  const host = u.hostname.toLowerCase();
  if (kind === "slack") {
    if (host !== "hooks.slack.com" || !/^\/(services|workflows|triggers)\/[A-Za-z0-9/_-]{10,}$/.test(u.pathname)) {
      return { ok: false, error: "That isn't a Slack webhook link. It should start with https://hooks.slack.com/services/…" };
    }
  } else {
    const teamsHost = host.endsWith(".webhook.office.com") || host.endsWith(".logic.azure.com") || host.endsWith(".api.powerplatform.com");
    if (!teamsHost || u.pathname.length < 10) {
      return { ok: false, error: "That isn't a Teams webhook link. Create one in Teams with Workflows → “Post to a channel when a webhook request is received”, then paste the link it gives you." };
    }
  }
  if (text.length > 1000) return { ok: false, error: "That link is too long to be a webhook link." };
  return { ok: true, url: u.toString(), hint: `${host}/…${u.toString().slice(-4)}` };
}

const roadmapLine = (r: DigestContent["roadmap"]) =>
  `Roadmap: ${r.review} under review · ${r.planned} planned · ${r.progress} in progress · ${r.shipped} shipped`;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function slackMessage(c: DigestContent, workspace: string, link: string) {
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: clip(`📰 ${c.headline}`, 150) } },
    { type: "context", elements: [{ type: "mrkdwn", text: `*${workspace}* · weekly feedback digest from Insight Hub` }] },
    { type: "section", text: { type: "mrkdwn", text: clip(c.summary || " ", 2900) } },
  ];
  for (const s of (c.sections ?? []).slice(0, 6)) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(`*${s.heading}*\n${s.items.map((i) => `• ${i}`).join("\n")}`, 2900) } });
  }
  if (c.roadmap) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: roadmapLine(c.roadmap) }] });
  blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Insight Hub" }, url: link }] });
  return { text: `${c.headline} — ${workspace} feedback digest`, blocks };
}

export function teamsMessage(c: DigestContent, workspace: string, link: string) {
  const body: unknown[] = [
    { type: "TextBlock", text: `📰 ${c.headline}`, weight: "Bolder", size: "Large", wrap: true },
    { type: "TextBlock", text: `${workspace} · weekly feedback digest from Insight Hub`, isSubtle: true, spacing: "None", wrap: true },
    { type: "TextBlock", text: c.summary || " ", wrap: true },
  ];
  for (const s of (c.sections ?? []).slice(0, 6)) {
    body.push({ type: "TextBlock", text: s.heading, weight: "Bolder", spacing: "Medium", wrap: true });
    body.push({ type: "TextBlock", text: s.items.map((i) => `- ${i}`).join("\n"), wrap: true, spacing: "Small" });
  }
  if (c.roadmap) body.push({ type: "TextBlock", text: roadmapLine(c.roadmap), isSubtle: true, spacing: "Medium", wrap: true });
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          actions: [{ type: "Action.OpenUrl", title: "Open in Insight Hub", url: link }],
        },
      },
    ],
  };
}

export const testMessage = (kind: ChannelKind, workspace: string) =>
  kind === "slack"
    ? { text: `✅ Insight Hub is connected. ${workspace}'s feedback digest will be posted here when someone sends it.` }
    : {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: { type: "AdaptiveCard", version: "1.4", body: [{ type: "TextBlock", wrap: true, text: `✅ Insight Hub is connected. ${workspace}'s feedback digest will be posted here when someone sends it.` }] },
          },
        ],
      };

/** Sends to the channel. Returns null when it went through, or a plain-language problem. */
export async function postToChannel(kind: ChannelKind, url: string, payload: unknown): Promise<string | null> {
  const name = CHANNEL_NAME[kind];
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return `Couldn't reach ${name}. Try again in a minute.`;
  }
  if (res.ok) return null;
  const body = (await res.text().catch(() => "")).slice(0, 200);
  if (res.status === 404 || res.status === 410 || /no_service|channel_not_found|channel_is_archived/.test(body)) {
    return `${name} says this webhook link no longer exists (it may have been removed, or the channel archived). Create a new one and connect it again.`;
  }
  if (res.status === 401 || res.status === 403) return `${name} refused the message — the webhook link may have been turned off. Create a new one and connect it again.`;
  if (res.status === 429) return `${name} is rate limiting. Try again in a minute.`;
  return `${name} couldn't take the message (error ${res.status}). Try again shortly.`;
}
