import { geminiJson } from "./gemini";
import type { FeedbackTypeT, SentimentT, PriorityT, ConfidenceT } from "@/db/schema";

/**
 * Splits a long source (meeting transcript, long email, pasted notes) into the
 * distinct pieces of feedback it contains — and classifies each in the SAME
 * call.
 *
 * Why one call instead of split-then-classify-each: a 9-minute call holds ~20
 * separate points, so classifying them individually would cost ~21 requests and
 * blow the free-tier rate limit. Doing both at once costs ~1 per chunk AND
 * classifies better, because the model can see the whole conversation rather
 * than one sentence in isolation.
 */
export type ExtractedItem = {
  quote: string;
  speaker: string | null;
  timestampLabel: string | null;
  type: FeedbackTypeT;
  sentiment: SentimentT;
  severity: PriorityT;
  confidence: ConfidenceT;
  theme: string;
};

const TYPES = ["Feature", "Bug", "UX", "Question", "Praise"];
const SENTS = ["Positive", "Neutral", "Negative"];
const PRIOS = ["High", "Medium", "Low"];
const CONFS = ["High", "Medium", "Low"];

/** Sources longer than this are treated as containers of several points. */
import { SPLIT_THRESHOLD_CHARS } from "./limits";
export { SPLIT_THRESHOLD_CHARS };
/** Chunk size for very long transcripts. Flash's context is large; the real
 *  constraint is output length, so keep chunks modest. */
const CHUNK_CHARS = 18_000;
const MAX_ITEMS_PER_CHUNK = 40;

/** Splits on line boundaries so speaker/timestamp lines stay intact. */
export function chunkText(text: string, size = CHUNK_CHARS): string[] {
  if (text.length <= size) return [text];
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur.length + line.length + 1 > size && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

function buildPrompt(chunk: string, themeTitles: string[], areas: string[]) {
  return `You are a product-feedback analyst. The text below is ONE source (a meeting transcript, a long email, or pasted notes). It usually contains SEVERAL separate pieces of customer feedback.

Extract every DISTINCT piece of feedback and classify each one.

Rules:
- One entry per distinct point. If someone raises three issues, that is three entries.
- Include praise as well as complaints — positive feedback matters.
- IGNORE greetings, scheduling, filler and pure acknowledgements ("sounds good", "thanks", "let me know").
- quote: the speaker's own words for that point, trimmed to the substantive sentence(s). Do not invent or paraphrase into corporate language. Max ~300 characters.
- speaker: the person's name if the text attributes it, else null.
- timestampLabel: the timestamp for that line if present (e.g. "00:04:27"), else null.
- type: exactly one of ${TYPES.join(", ")}
- sentiment: exactly one of ${SENTS.join(", ")}
- severity: exactly one of ${PRIOS.join(", ")} (how urgent/impactful)
- confidence: your confidence in this entry, one of ${CONFS.join(", ")}
- theme: STRONGLY PREFER an existing theme from the list below — reuse is the whole point, since a theme mentioned by ten customers is what tells the team it matters. Only invent a new theme when the point is genuinely about a different part of the product, not merely worded differently. Group related complaints together (e.g. slow loading and slow filtering are both performance). If you do invent one, use a concise Title Case title of 3–5 words, and never return the literal word "NEW".

Existing themes: ${themeTitles.length ? themeTitles.map((t) => `"${t}"`).join(", ") : "(none yet)"}
Known product areas for context: ${areas.join(", ") || "(none)"}

Return ONLY JSON: {"items":[{"quote":"...","speaker":null,"timestampLabel":null,"type":"...","sentiment":"...","severity":"...","confidence":"...","theme":"..."}]}
Return at most ${MAX_ITEMS_PER_CHUNK} entries. If the text contains no real feedback, return {"items":[]}.

SOURCE:
"""${chunk}"""`;
}

const pick = (v: unknown, allowed: string[], def: string) =>
  typeof v === "string" && allowed.includes(v) ? v : def;

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : null;
};

export function normaliseItems(raw: unknown): ExtractedItem[] {
  const arr = Array.isArray((raw as { items?: unknown })?.items)
    ? ((raw as { items: unknown[] }).items as Record<string, unknown>[])
    : [];
  const out: ExtractedItem[] = [];
  const seen = new Set<string>();

  for (const r of arr) {
    const quote = str(r.quote);
    if (!quote || quote.length < 8) continue; // too short to be real feedback
    // Guard against the model repeating itself across chunks.
    const key = quote.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      quote: quote.slice(0, 600),
      speaker: str(r.speaker),
      timestampLabel: str(r.timestampLabel),
      type: pick(r.type, TYPES, "Feature") as FeedbackTypeT,
      sentiment: pick(r.sentiment, SENTS, "Neutral") as SentimentT,
      severity: pick(r.severity, PRIOS, "Medium") as PriorityT,
      confidence: pick(r.confidence, CONFS, "Medium") as ConfidenceT,
      theme: str(r.theme) ?? "",
    });
  }
  return out;
}

/**
 * Extracts and classifies every distinct piece of feedback in a long source.
 * Throws if the AI call fails, so the caller can distinguish rate limiting from
 * a genuine error.
 */
export async function extractFeedbackItems(
  text: string,
  themeTitles: string[],
  areas: string[],
): Promise<ExtractedItem[]> {
  const chunks = chunkText(text);
  const all: ExtractedItem[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const raw = await geminiJson(buildPrompt(chunk, themeTitles, areas));
    for (const item of normaliseItems(raw)) {
      const key = item.quote.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
    }
  }
  return all;
}
