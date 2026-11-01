import { and, desc, eq, inArray, lt, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiJson, AiRateLimitError } from "@/lib/ai/client";
import { speakConversation, type Turn, type VoiceKey } from "@/lib/ai/tts";
import { decryptSecret } from "@/lib/secret-box";
import { durationSec, encodeMp3 } from "@/lib/audio";
import { initials, scrubNames, type NameMode } from "@/lib/jira";
import { loadEmerging, loadTrends } from "@/lib/trend-data";

/** Podcast-style briefings: rules everyone sees. */
export const KEEP_LATEST = 10;
export const KEEP_DAYS = 30;
export const DAILY_LIMIT = 5;
export const MAX_THEMES = 5;
export const HOSTS = ["Ava", "Leo"] as const;
/** A briefing still "in progress" after this long was cut off (e.g. the server timed out). */
export const STUCK_AFTER_MS = 8 * 60_000;
const QUOTES_PER_THEME = 6;

export type BriefingLength = "balanced" | "deep";
export type ScriptJson = { title: string; turns: Turn[] };

/* ------------------------------------------------------------------ names */

/** How a person is named in the briefing. */
export function nameFor(name: string | null, mode: NameMode): string | null {
  if (!name?.trim()) return null;
  return mode === "include" ? name.trim() : mode === "mask" ? initials(name) : null;
}
/** Scrubs known names out of text. "Leave out" says "a customer" — "[name]" sounds odd read aloud. */
export function scrubForAudio(text: string, names: string[], mode: NameMode): string {
  return scrubNames(text, names, mode).replace(/\[name\]/g, "a customer");
}

/* ------------------------------------------------------------------- data */

export type ThemeData = {
  id: string;
  title: string;
  summary: string | null;
  mentions: number;
  sentiment: { Positive: number; Neutral: number; Negative: number };
  trend: string;
  emerging: boolean;
  roadmap: string | null;
  quotes: { text: string; who: string | null; type: string | null; severity: string | null }[];
};

const ROADMAP_LABEL: Record<string, string> = { review: "on the roadmap, under review", planned: "planned", progress: "in progress", shipped: "shipped", wontdo: "decided against" };

export async function gatherBriefing(workspaceId: string, themeIds: string[], mode: NameMode): Promise<{ themes: ThemeData[]; names: string[] }> {
  const db = await getDb();
  const s = schema;
  const themes = await db.select().from(s.themes).where(and(eq(s.themes.workspaceId, workspaceId), inArray(s.themes.id, themeIds)));
  const items = await db
    .select()
    .from(s.feedbackItems)
    .where(and(eq(s.feedbackItems.workspaceId, workspaceId), eq(s.feedbackItems.reviewStatus, "approved"), inArray(s.feedbackItems.themeId, themeIds)))
    .orderBy(desc(s.feedbackItems.createdAt));
  const enh = await db.select().from(s.enhancements).where(and(eq(s.enhancements.workspaceId, workspaceId), inArray(s.enhancements.themeId, themeIds)));
  const trends = await loadTrends(workspaceId);
  const emerging = await loadEmerging(workspaceId, trends);

  const names = new Set<string>();
  for (const it of items) for (const n of [it.customer, it.submitter, it.speaker]) if (n?.trim()) names.add(n.trim());
  const nameList = [...names];
  const sev = (x: string | null) => (x === "High" ? 0 : x === "Medium" ? 1 : 2);

  const out = themeIds
    .map((id) => themes.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => {
      const mine = items.filter((i) => i.themeId === t.id);
      const sentiment = { Positive: 0, Neutral: 0, Negative: 0 };
      for (const i of mine) if (i.sentiment) sentiment[i.sentiment as keyof typeof sentiment]++;
      const tr = trends.get(t.id);
      const trend = !tr || tr.kind === "none" ? "steady" : tr.kind === "new" ? `new this week (${tr.thisWeek})` : `${tr.pct > 0 ? "up" : "down"} ${Math.abs(tr.pct)}% week on week (${tr.thisWeek} this week vs ${tr.lastWeek})`;
      const e = enh.find((x) => x.themeId === t.id);
      const best = [...mine].sort((a, b) => sev(a.severity) - sev(b.severity) || (a.sentiment === "Negative" ? -1 : 1) - (b.sentiment === "Negative" ? -1 : 1)).slice(0, QUOTES_PER_THEME);
      return {
        id: t.id,
        title: t.title,
        summary: t.summary ? scrubForAudio(t.summary, nameList, mode) : null,
        mentions: mine.length,
        sentiment,
        trend,
        emerging: emerging.has(t.id),
        roadmap: e ? ROADMAP_LABEL[e.status] ?? e.status : null,
        quotes: best.map((q) => ({
          text: scrubForAudio(q.quote.slice(0, 400), nameList, mode),
          who: nameFor(q.customer ?? q.submitter ?? q.speaker, mode),
          type: q.type,
          severity: q.severity,
        })),
      };
    });
  return { themes: out, names: nameList };
}

/* ----------------------------------------------------------------- script */

export function scriptPrompt(themes: ThemeData[], mode: NameMode, length: BriefingLength) {
  const words = length === "deep" ? "1300 to 1600" : "650 to 800";
  const data = themes
    .map(
      (t, i) =>
        `THEME ${i + 1}: ${t.title}
- Mentions (approved feedback): ${t.mentions} · sentiment: ${t.sentiment.Negative} negative, ${t.sentiment.Neutral} neutral, ${t.sentiment.Positive} positive
- Trend: ${t.trend}${t.emerging ? " · flagged as EMERGING" : ""}
- Roadmap: ${t.roadmap ?? "not on the roadmap yet"}
- Summary: ${t.summary ?? "(none)"}
- Quotes:
${t.quotes.map((q) => `  • "${q.text}" — ${q.who ?? "a customer"}${q.severity ? ` (${q.severity} severity${q.type ? `, ${q.type}` : ""})` : ""}`).join("\n")}`,
    )
    .join("\n\n");
  const naming =
    mode === "include"
      ? "Refer to customers by the names given."
      : mode === "mask"
        ? "Customers are given as initials (e.g. “K. H.”). Use only those initials — never guess a full name."
        : "Customers are not named. Say “one customer”, “a team” or similar — never invent a name or company.";
  return `You are writing a short, natural podcast-style conversation between two hosts, Ava and Leo, for a busy product team. They are talking through the customer feedback below so a listener on the go understands what customers are saying and why it matters.

Rules:
- Use ONLY the facts below. Never invent numbers, customers, quotes, dates or plans. If something isn't in the data, don't say it.
- Ava opens by saying it's an AI-generated briefing from Insight Hub and which themes it covers.
- Cover every theme: what the problem or request is, how many mentions, how people feel, whether it's rising, and one or two short quotes said naturally (“one customer put it like this…”). Say if it's already on the roadmap.
- Leo adds interpretation and asks the questions a listener would ask; Ava keeps it moving. Short, spoken sentences. Contractions. No lists, no headings, no stage directions, no sound effects, no emoji.
- ${naming}
- End with a quick recap: the one or two things worth looking at next, based only on the data.
- About ${words} words in total, in roughly 14 to 30 alternating turns.

Return JSON: {"title": "short episode title (max 8 words)", "turns": [{"speaker": "Ava" | "Leo", "text": "..."}]}

DATA:
${data}`;
}

const DISCLOSURE = "Welcome to your Insight Hub audio briefing. Quick note before we start: we're AI voices, and everything we cover comes from your team's approved customer feedback.";

/** Checks and tidies what the AI wrote, and makes sure no full name slips through. */
export function cleanScript(raw: Record<string, unknown>, names: string[], mode: NameMode): ScriptJson {
  const turns = (Array.isArray(raw.turns) ? raw.turns : [])
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .map((t) => ({ speaker: String(t.speaker ?? "").trim(), text: String(t.text ?? "").replace(/\s+/g, " ").trim() }))
    .filter((t) => t.text)
    .map((t, i) => ({
      speaker: (HOSTS as readonly string[]).includes(t.speaker) ? t.speaker : HOSTS[i % 2],
      text: scrubForAudio(t.text.replace(/\*+|#+|\[[^\]]*\]/g, "").slice(0, 900), names, mode),
    }))
    .slice(0, 60);
  if (turns.length < 4) throw new Error("The AI didn't write a usable script. Try again.");
  if (!/\bAI\b|artificial/i.test(turns[0].text)) turns.unshift({ speaker: "Ava", text: DISCLOSURE });
  const title = String(raw.title ?? "").replace(/\*+|#+|\[[^\]]*\]|"/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Your feedback briefing";
  return { title: scrubForAudio(title, names, mode), turns };
}

export const scriptWords = (s: ScriptJson) => s.turns.reduce((n, t) => n + t.text.split(/\s+/).length, 0);

/* ----------------------------------------------------------- voice + run */

/**
 * Which Gemini key may voice this workspace's briefing: its own Gemini key, or
 * the platform's if it's allowed to use it. Null = script only.
 */
export async function voiceKeyFor(workspaceId: string): Promise<VoiceKey | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.workspaceAiSettings).where(eq(schema.workspaceAiSettings.workspaceId, workspaceId)).limit(1);
  if (row?.encryptedKey && (row.provider ?? "gemini") === "gemini") {
    try {
      return { key: decryptSecret(row.encryptedKey), source: "workspace" };
    } catch {
      return null;
    }
  }
  const allowed = row?.allowPlatformKey ?? true;
  const platform = process.env.GEMINI_API_KEY;
  return allowed && platform ? { key: platform, source: "platform" } : null;
}

function friendly(e: unknown): string {
  if (e instanceof AiRateLimitError) return `Couldn't finish: ${e.advice}`;
  const m = (e as Error)?.message ?? "Something went wrong.";
  return m.replace(/AIza[0-9A-Za-z_-]+|sk-[A-Za-z0-9_-]+/g, "[key]").slice(0, 300);
}

/** Writes the script (on the workspace's AI) and records the voices. Call inside withAiKey. */
export async function produceBriefing(id: string, workspaceId: string, voice: VoiceKey | null) {
  const db = await getDb();
  const b = schema.audioBriefings;
  const where = and(eq(b.workspaceId, workspaceId), eq(b.id, id));
  try {
    const [row] = await db.select().from(b).where(where).limit(1);
    if (!row) return;
    const mode = row.nameMode as NameMode;
    const { themes, names } = await gatherBriefing(workspaceId, row.themeIds as string[], mode);
    if (!themes.length) throw new Error("Those themes no longer exist.");
    const script = cleanScript(await aiJson(scriptPrompt(themes, mode, row.length as BriefingLength)), names, mode);
    await db.update(b).set({ title: script.title, script, status: voice ? "voicing" : "ready" }).where(where);
    if (!voice) return;
    const pcm = await speakConversation(script.turns, voice);
    const mp3 = await encodeMp3(pcm);
    await db.transaction(async (tx) => {
      await tx.insert(schema.audioFiles).values({ briefingId: id, workspaceId, mp3 });
      await tx.update(b).set({ status: "ready", hasAudio: true, durationSec: durationSec(pcm), sizeBytes: mp3.length, voiceSource: voice.source }).where(where);
    });
  } catch (e) {
    await db.update(b).set({ status: "failed", error: friendly(e) }).where(where).catch(() => {});
  }
}

/* -------------------------------------------------------------- retention */

/** Keeps only the newest KEEP_LATEST briefings and drops expired ones, in one workspace. */
export async function pruneBriefings(workspaceId: string) {
  const db = await getDb();
  const b = schema.audioBriefings;
  await db.delete(b).where(and(eq(b.workspaceId, workspaceId), lt(b.expiresAt, new Date())));
  const keep = await db.select({ id: b.id }).from(b).where(eq(b.workspaceId, workspaceId)).orderBy(desc(b.createdAt)).limit(KEEP_LATEST);
  if (keep.length === KEEP_LATEST) {
    await db.delete(b).where(and(eq(b.workspaceId, workspaceId), notInArray(b.id, keep.map((k) => k.id))));
  }
}

export const isStuck = (r: { status: string; createdAt: Date }) =>
  (r.status === "writing" || r.status === "voicing") && Date.now() - r.createdAt.getTime() > STUCK_AFTER_MS;
