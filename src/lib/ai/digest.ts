import { geminiJson } from "./gemini";

export type DigestAi = {
  headline: string;
  summary: string;
  sections: { heading: string; items: string[] }[];
};

export async function generateDigestAi(dataBlock: string): Promise<DigestAi> {
  const prompt = `You are a product analyst writing a weekly feedback digest for busy senior stakeholders. Based ONLY on the data below, return JSON:
{"headline": "one punchy sentence", "summary": "2–3 sentence executive summary", "sections": [{"heading": "string", "items": ["short bullet", "short bullet"]}]}
Use sections like "Top themes", "Emerging & movers", "What to prioritise next". Keep bullets short, specific and grounded — do NOT invent numbers or facts beyond the data.

DATA:
${dataBlock}`;

  const r = (await geminiJson(prompt)) as Partial<DigestAi>;
  return {
    headline: typeof r.headline === "string" ? r.headline : "Weekly feedback digest",
    summary: typeof r.summary === "string" ? r.summary : "",
    sections: Array.isArray(r.sections)
      ? r.sections
          .filter((s) => s && typeof s.heading === "string" && Array.isArray(s.items))
          .map((s) => ({ heading: s.heading, items: s.items.map(String).slice(0, 6) }))
      : [],
  };
}
