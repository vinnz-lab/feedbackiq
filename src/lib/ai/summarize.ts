import { aiJson } from "./client";

export async function summarizeTheme(title: string, quotes: string[]): Promise<string> {
  const prompt = `You are a product-feedback analyst. Write a concise 1–2 sentence summary of the feedback theme "${title}", grounded ONLY in the quotes below. Name the concrete pain or request; if visible, note roughly how many or what kind of users. Do NOT invent facts or numbers. Return JSON: {"summary": "..."}.

Quotes:
${quotes.slice(0, 15).map((q, i) => `${i + 1}. "${q.slice(0, 300)}"`).join("\n")}`;

  const r = await aiJson(prompt);
  return typeof r.summary === "string" ? r.summary : "";
}
