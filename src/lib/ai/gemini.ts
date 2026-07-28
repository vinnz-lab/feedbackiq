/**
 * Minimal Gemini client via REST (no SDK dependency).
 * Uses the free Google AI Studio tier. Key lives in GEMINI_API_KEY (env only).
 */
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function geminiJson(prompt: string): Promise<Record<string, unknown>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");
  return JSON.parse(text) as Record<string, unknown>;
}
