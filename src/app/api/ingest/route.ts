import { getDb, schema } from "@/db";
import { parseFile, parsePaste, type ParsedSource } from "@/lib/ingest/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function persist(sources: ParsedSource[]) {
  const db = await getDb();
  const [ws] = await db.select().from(schema.workspaces).limit(1);
  if (!ws) throw new Error("No workspace found");

  const summary: { filename: string; kind: string; status: string; items: number; note?: string }[] = [];
  let totalItems = 0;

  for (const s of sources) {
    const [src] = await db
      .insert(schema.sources)
      .values({
        workspaceId: ws.id,
        kind: s.kind,
        filename: s.filename,
        status: s.status,
        itemCount: s.items.length,
        note: s.note ?? null,
        autoIngested: false,
        meta: s.rawText ? { rawText: s.rawText.slice(0, 20000) } : null,
      })
      .returning();

    if (s.items.length) {
      await db.insert(schema.feedbackItems).values(
        s.items.map((it) => ({
          workspaceId: ws.id,
          sourceId: src.id,
          quote: it.quote,
          customer: it.customer ?? null,
          submitter: it.submitter ?? null,
          speaker: it.speaker ?? null,
          timestampLabel: it.timestampLabel ?? null,
          rowRef: it.rowRef ?? null,
          occurredAt: it.occurredAt ?? null,
          reviewStatus: "needs_review" as const,
          reviewReason: "awaiting AI",
        })),
      );
    }

    totalItems += s.items.length;
    summary.push({
      filename: s.filename,
      kind: s.kind,
      status: s.status,
      items: s.items.length,
      note: s.note,
    });
  }
  return { totalItems, sources: summary };
}

export async function POST(request: Request) {
  try {
    const ct = request.headers.get("content-type") || "";
    const parsed: ParsedSource[] = [];

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      for (const f of form.getAll("files")) {
        if (f instanceof File && f.size > 0) {
          const buf = Buffer.from(await f.arrayBuffer());
          parsed.push(await parseFile(f.name, buf));
        }
      }
      const paste = form.get("paste");
      if (typeof paste === "string" && paste.trim()) parsed.push(parsePaste(paste));
    } else {
      const body = (await request.json().catch(() => ({}))) as { paste?: string };
      if (body.paste && body.paste.trim()) parsed.push(parsePaste(body.paste));
    }

    if (!parsed.length) {
      return Response.json({ error: "No files or text provided." }, { status: 400 });
    }
    const result = await persist(parsed);
    return Response.json(result);
  } catch (err) {
    console.error("ingest error", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
