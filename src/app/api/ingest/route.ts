import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { parseFile, parsePaste, type ParsedSource } from "@/lib/ingest/parse";
import {
  fingerprintBytes,
  fingerprintText,
  quoteKey,
} from "@/lib/ingest/fingerprint";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceContext, type Workspace } from "@/lib/workspace";
import { can, deniedMessage } from "@/lib/permissions";
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

/** The text that identifies a source. Spreadsheets carry no rawText, so their
 *  extracted rows stand in — still content-based, so a renamed copy matches. */
function sourceText(p: ParsedSource): string {
  return p.rawText ?? p.items.map((i) => i.quote).join("\n");
}

/** A parsed source plus, for audio, the bytes we still need to send onward. */
type Incoming = { parsed: ParsedSource; audio?: Buffer; hash: string };

async function persist(ws: Workspace, incoming: Incoming[], force: boolean) {
  const db = await getDb();

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
    const meta = e.meta as { contentHash?: string; rawText?: string } | null;
    // Sources imported before fingerprinting existed have no stored hash.
    // Reconstruct one from their saved text so they still count as "already
    // imported" — otherwise the feature only protects data created after it
    // shipped, which is exactly how a duplicate slipped through.
    const h = meta?.contentHash ?? (meta?.rawText ? fingerprintText(meta.rawText) : null);
    if (h && !seen.has(h)) seen.set(h, { filename: e.filename, createdAt: e.createdAt });
  }

  // Every quote already in the workspace, so re-imported feedback is skipped
  // even when the file itself differs (a weekly export that gained rows).
  const priorQuotes = await db
    .select({ quote: schema.feedbackItems.quote })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.workspaceId, ws.id));
  const knownQuotes = new Set<string>();
  for (const r of priorQuotes) {
    const k = quoteKey(r.quote);
    if (k) knownQuotes.add(k);
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
        note: `Already imported as "${prior.filename}" on ${prior.createdAt.toLocaleDateString("en-GB")}.`,
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
    // Remember a deliberate override so the splitter honours the same intent —
    // otherwise "import anyway" would create a source that splits into nothing.
    let meta: Record<string, unknown> = { contentHash: hash };
    if (force && prior) meta.forcedImport = true;
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

    // Drop individual items already present. Without this, a source whose
    // fingerprint differs (or predates fingerprinting) still re-imports every
    // point inside it and doubles the demand behind each theme.
    const fresh = force
      ? s.items
      : s.items.filter((it) => {
          const k = quoteKey(it.quote);
          if (!k) return true; // too short to judge — keep it
          if (knownQuotes.has(k)) return false;
          knownQuotes.add(k);
          return true;
        });
    const skippedItems = s.items.length - fresh.length;

    const [src] = await db
      .insert(schema.sources)
      .values({
        workspaceId: ws.id,
        kind: s.kind,
        filename: s.filename,
        status,
        itemCount: fresh.length,
        note,
        autoIngested: false,
        meta,
      })
      .returning();

    if (fresh.length) {
      await db.insert(schema.feedbackItems).values(
        fresh.map((it) => ({
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

    totalItems += fresh.length;
    summary.push({
      filename: s.filename,
      kind: s.kind,
      status,
      items: fresh.length,
      duplicate: fresh.length === 0 && skippedItems > 0,
      note:
        skippedItems > 0
          ? `${skippedItems} of ${s.items.length} already imported and skipped.${note ? " " + note : ""}`
          : (note ?? undefined),
    });
  }
  return { totalItems, sources: summary };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to upload feedback." }, { status: 401 });
  }
  // Uploads always land in the caller's CURRENT workspace — never chosen by the request.
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    return Response.json({ error: "You don't have access to a workspace yet." }, { status: 403 });
  }
  if (!can(ctx.role, "edit")) {
    return Response.json({ error: deniedMessage("edit") }, { status: 403 });
  }
  const ws = ctx.workspace;

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
            hash:
              parsed.kind === "recording"
                ? fingerprintBytes(buf)
                : fingerprintText(sourceText(parsed)),
          });
        }
      }
      const paste = form.get("paste");
      if (typeof paste === "string" && paste.trim()) {
        incoming.push({ parsed: parsePaste(paste), hash: fingerprintText(paste) });
      }
    } else {
      const body = (await request.json().catch(() => ({}))) as {
        paste?: string;
        force?: boolean;
      };
      if (body.force) force = true;
      if (body.paste && body.paste.trim()) {
        incoming.push({ parsed: parsePaste(body.paste), hash: fingerprintText(body.paste) });
      }
    }

    if (!incoming.length) {
      return Response.json({ error: "No files or text provided." }, { status: 400 });
    }
    const result = await persist(ws, incoming, force);

    {
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
