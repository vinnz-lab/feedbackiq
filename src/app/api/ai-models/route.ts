export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic: lists the Gemini models this API key can use for generateContent.
export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
    };
    const models = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => m.name.replace("models/", ""));
    return Response.json({ count: models.length, models });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
