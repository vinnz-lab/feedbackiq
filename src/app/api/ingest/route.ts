import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { parseFile, parsePaste, type ParsedSource } from "@/lib/ingest/parse";
import { fingerprint } from "@/lib/ingest/fingerprint";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/guard";
import {
  isTranscriptionConfigured,
  submitTranscription,
  uploadAudio,
} from "@/lib/ai/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uploads land straight in the review queue, so this endpoint must not be open
 *  to the internet: an anonymous caller could flood the workspace with junk. */

/** Vercel rejects request bodies over 4.5MB at the edge on every plan, before
 *  any of this code runs — so a larger cap here would be a lie. Kept slightly
 *  under to leave room for multipart overhead. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** A parsed source plus, for audio, the bytes we still need to send onward. */
type Incoming = { parsed: ParsedSource; audio?: Buffer; hash: string };

async function persist(incoming: Incoming[], force: boolean) {
  const db = await getDb();
  const [ws] = await db.select().from(schema.workspaces).limit(1);
  if (!ws) throw new Error("No workspace found");

  const summary: {
    filename: string;
    kind: string;
    status: string;
    items: number;
    note?: string;
    duplicate?: boolean;
  }[] = [];
  let totalItems = 0;

  // Fingerprints already in the workspace. Read once rather than per file.
  const existing = await db
    .select({ filename: schema.sources.filename, meta: schema.sources.meta, createdAt: schema.sources.createdAt })
    .from(schema.sources)
    .where(eq(schema.sources.workspaceId, ws.id));
  const seen = new Map<string, { filename: string; createdAt: Date }>();
  for (const e of existing) {
    const h = (e.meta as { contentHash?: string } | null)?.contentHash;
    if (h && !seen.has(h)) seen.set(h, { filename: e.filename, createdAt: e.createdAt });
  }

  for (const { parsed: s, audio, hash } of incoming) {
    // Skip content already imported, unless the caller deliberately overrides.
    // An override is genuinely needed sometimes — e.g. re-importing a
    // spreadsheet after a parser fix — so this warns rather than forbids.
    const prior = seen.get(hash);
    if (prior && !force) {
      summary.push({
        filename: s.filename,
        kind: s.kind,
        status: "skipped",
        items: 0,
        duplicate: true,
        note: `Already imported as "${prior.filename}" on ${prior.createdAt.toLocaleDateString("en-GB")}. Tick "import anyway" to add it again.`,
      });
      continue;
    }
    // Guard against the same file appearing twice in one upload.
    seen.set(hash, { filename: s.filename, createdAt: new Date() });
    // Recordings: hand the audio to AssemblyAI now and remember the job, so a
    // later poll can turn it into a diarized transcript. Previously the bytes
    // were simply dropped and the source sat on "queued" forever.
    // Widened to the DB enum: the parser never yields "processing", but a
    // queued transcription does.
    let status: "queued" | "processing" | "processed" | "failed" = s.status;
    let note = s.note ?? null;
    let meta: Record<string, unknown> = { contentHash: hash };
    if (s.rawText) meta.rawText = s.rawText.slice(0, 20000);

    if (s.kind === "recording" && audio) {
      if (!isTranscriptionConfigured()) {
        note = "Add ASSEMBLYAI_API_KEY to enable transcription.";
      } else {
        try {
          const url = await uploadAudio(audio);
          const jobId = await submitTranscription(url);
          meta = { ...meta, assemblyId: jobId };
          status = "processing";
          note = "Transcribing with speaker labels…";
        } catch (e) {
          status = "failed";
          note = `Could not start transcription: ${(e as Error).message}`;
        }
      }
    }

    const [src] = await db
      .insert(schema.sources)
      .values({
        workspaceId: ws.id,
        kind: s.kind,
        filename: s.filename,
        status,
        itemCount: s.items.length,
        note,
        autoIngested: false,
        meta,
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
      status,
      items: s.items.length,
      note: note ?? undefined,
    });
  }
  return { totalItems, sources: summary };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to upload feedback." }, { status: 401 });
  }

  try {
    const ct = request.headers.get("content-type") || "";
    const incoming: Incoming[] = [];
    let force = false;

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      force = form.get("force") === "true";
      for (const f of form.getAll("files")) {
        if (f instanceof File && f.size > 0) {
          if (f.size > MAX_UPLOAD_BYTES) {
            return Response.json(
              {
                error: `"${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)}MB. Uploads are capped at ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB by the hosting platform.`,
              },
              { status: 413 },
            );
          }
          const buf = Buffer.from(await f.arrayBuffer());
          const parsed = await parseFile(f.name, buf);
          // Keep the bytes only for audio — everything else is already text.
          incoming.push({
            parsed,
            audio: parsed.kind === "recording" ? buf : undefined,
            hash: fingerprint(buf),
          });
        }
      }
      const paste = form.get("paste");
      if (typeof paste === "string" && paste.trim()) {
        incoming.push({ parsed: parsePaste(paste), hash: fingerprint(paste) });
      }
    } else {
      const body = (await request.json().catch(() => ({}))) as {
        paste?: string;
        force?: boolean;
      };
      if (body.force) force = true;
      if (body.paste && body.paste.trim()) {
        incoming.push({ parsed: parsePaste(body.paste), hash: fingerprint(body.paste) });
      }
    }

    if (!incoming.length) {
      return Response.json({ error: "No files or text provided." }, { status: 400 });
    }
    const result = await persist(incoming, force);

    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (ws) {
      await logAudit({
        workspaceId: ws.id,
        actorId: user.id,
        actorLabel: user.name,
        action: "ingest.upload",
        entityType: "source",
        after: { items: result.totalItems, sources: result.sources.map((s) => s.filename) },
      });
    }

    return Response.json(result);
  } catch (err) {
    console.error("ingest error", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
