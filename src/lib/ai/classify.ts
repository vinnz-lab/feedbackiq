import { geminiJson } from "./gemini";
import type { FeedbackTypeT, SentimentT, PriorityT, ConfidenceT } from "@/db/schema";

export type Classification = {
  type: FeedbackTypeT;
  sentiment: SentimentT;
  severity: PriorityT;
  confidence: ConfidenceT;
  theme: string; // an existing theme title, or "NEW"
};

const TYPES = ["Feature", "Bug", "UX", "Question", "Praise"];
const SENTS = ["Positive", "Neutral", "Negative"];
const PRIOS = ["High", "Medium", "Low"];

export async function classifyItem(
  quote: string,
  themeTitles: string[],
  areas: string[],
): Promise<Classification> {
  const prompt = `You are a product-feedback analyst. Classify the single piece of customer feedback below.
Return ONLY a JSON object with keys: type, sentiment, severity, confidence, theme.
- type: exactly one of ${TYPES.join(", ")}
- sentiment: exactly one of ${SENTS.join(", ")}
- severity: exactly one of ${PRIOS.join(", ")} (how urgent/impactful)
- confidence: your confidence in this classification, one of High, Medium, Low
- theme: the SINGLE best match from this list, OR — if none fits well — a concise NEW theme title in Title Case (3–5 words, e.g. "Mobile App Stability"). Do NOT return the literal word "NEW". Existing themes: ${
    themeTitles.length ? themeTitles.map((t) => `"${t}"`).join(", ") : "(none yet)"
  }
Known product areas for context: ${areas.join(", ") || "(none)"}.

Feedback: """${quote.slice(0, 2000)}"""`;

  const r = await geminiJson(prompt);
  const pick = (v: unknown, allowed: string[], def: string) =>
    typeof v === "string" && allowed.includes(v) ? v : def;

  return {
    type: pick(r.type, TYPES, "Feature") as FeedbackTypeT,
    sentiment: pick(r.sentiment, SENTS, "Neutral") as SentimentT,
    severity: pick(r.severity, PRIOS, "Medium") as PriorityT,
    confidence: pick(r.confidence, ["High", "Medium", "Low"], "Medium") as ConfidenceT,
    theme: typeof r.theme === "string" ? r.theme : "NEW",
  };
}
