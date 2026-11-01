import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * A briefing's MP3, for members of its workspace only. Supports Range requests,
 * which iPhones need to play audio at all and which makes seeking work.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return new Response("Not signed in.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found.", { status: 404 });
  const db = await getDb();
  const [row] = await db
    .select({ mp3: schema.audioFiles.mp3, title: schema.audioBriefings.title, createdAt: schema.audioBriefings.createdAt })
    .from(schema.audioFiles)
    .innerJoin(schema.audioBriefings, eq(schema.audioBriefings.id, schema.audioFiles.briefingId))
    .where(and(eq(schema.audioFiles.workspaceId, ctx.workspace.id), eq(schema.audioFiles.briefingId, id), gt(schema.audioBriefings.expiresAt, new Date())))
    .limit(1);
  if (!row) return new Response("This briefing has been deleted or has expired.", { status: 404 });

  const buf = row.mp3;
  const size = buf.length;
  const url = new URL(request.url);
  const name = `insight-hub-briefing-${row.createdAt.toISOString().slice(0, 10)}-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "audio"}.mp3`;
  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    ...(url.searchParams.has("download") ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(buf), { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
