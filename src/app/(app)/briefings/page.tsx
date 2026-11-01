import Link from "next/link";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireWorkspace } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import { getAiKeyStatus } from "@/lib/ai/workspace-key";
import { PROVIDERS } from "@/lib/ai/providers";
import { DAILY_LIMIT, KEEP_DAYS, KEEP_LATEST, isStuck, voiceKeyFor, type ScriptJson } from "@/lib/briefings";
import { BriefingCreator } from "@/components/briefing-creator";
import { BriefingItem, type BriefingView } from "@/components/briefing-item";
import { RefreshWhilePending } from "@/components/refresh-while-pending";

export const dynamic = "force-dynamic";
// Writing and voicing run after the reply (see actions.ts) and need the time.
export const maxDuration = 300;

export default async function BriefingsPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.workspace.id;
  const canEdit = can(ctx.role, "edit");
  const db = await getDb();
  const b = schema.audioBriefings;
  const rows = await db.select().from(b).where(and(eq(b.workspaceId, wsId), gt(b.expiresAt, new Date()))).orderBy(desc(b.createdAt)).limit(KEEP_LATEST);

  const counts = await db
    .select({ themeId: schema.feedbackItems.themeId, n: count() })
    .from(schema.feedbackItems)
    .where(and(eq(schema.feedbackItems.workspaceId, wsId), eq(schema.feedbackItems.reviewStatus, "approved")))
    .groupBy(schema.feedbackItems.themeId);
  const themes = (await db.select({ id: schema.themes.id, title: schema.themes.title }).from(schema.themes).where(eq(schema.themes.workspaceId, wsId)))
    .map((t) => ({ ...t, mentions: Number(counts.find((c) => c.themeId === t.id)?.n ?? 0) }))
    .filter((t) => t.mentions > 0)
    .sort((a, c) => c.mentions - a.mentions);

  const ai = await getAiKeyStatus(wsId);
  const voice = await voiceKeyFor(wsId);
  const writer = ai.using === "workspace" ? PROVIDERS[ai.provider].name : "Google Gemini";
  const aiNote =
    ai.using === "none"
      ? null
      : voice
        ? ai.using === "workspace" && ai.provider !== "gemini"
          ? `Script written by ${writer}; voices by Google Gemini (the platform's key).`
          : "Script and voices by Google Gemini."
        : `Script written by ${writer}. Voices need a Google Gemini key, so briefings here are script only — add a Gemini key in Integrations → AI to get audio.`;

  const views: BriefingView[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    themeTitles: (r.themeTitles as string[]) ?? [],
    nameMode: r.nameMode,
    status: isStuck(r) ? "failed" : r.status,
    error: isStuck(r) ? "This one took too long and was stopped. Delete it and try again." : r.error,
    hasAudio: r.hasAudio,
    durationSec: r.durationSec,
    sizeBytes: r.sizeBytes,
    script: (r.script as ScriptJson | null) ?? null,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }));
  const pending = views.some((v) => v.status === "writing" || v.status === "voicing");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">Audio briefings</h1>
        <p className="mt-1 text-[13px] text-muted">
          A podcast-style conversation between two AI hosts about the feedback behind the themes you pick — to listen to on the go.
        </p>
      </div>

      <div
        data-testid="retention-note"
        className="mb-5 rounded-[10px] border px-4 py-3 text-[12.5px]"
        style={{ background: "var(--amber-soft)", borderColor: "var(--amber)", color: "var(--amber)" }}
      >
        <b>Download anything you want to keep.</b> Only the {KEEP_LATEST} most recent briefings are kept, and each one is deleted automatically{" "}
        {KEEP_DAYS} days after it was made.
      </div>

      {canEdit ? (
        ai.using === "none" ? (
          <div className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 text-[13px] text-muted shadow-[var(--shadow)]">
            This workspace has no AI key yet. Its owner can add one in <Link href="/integrations#ai" className="font-semibold text-indigo">Integrations → AI</Link>.
          </div>
        ) : themes.length === 0 ? (
          <div className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 text-[13px] text-muted shadow-[var(--shadow)]">
            There are no themes with approved feedback yet. Add and approve some feedback first — then come back to turn it into a briefing.
          </div>
        ) : (
          <BriefingCreator themes={themes} aiNote={aiNote} dailyLimit={DAILY_LIMIT} busy={pending} />
        )
      ) : (
        <p className="mb-6 text-[12.5px] text-muted">You can listen to and download briefings. Making new ones is for the workspace&apos;s editors.</p>
      )}

      <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">Your briefings · {views.length} of {KEEP_LATEST}</h2>
      {views.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center text-[13px] text-muted">No briefings yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {views.map((v) => (
            <BriefingItem key={v.id} b={v} canEdit={canEdit} />
          ))}
        </div>
      )}
      <RefreshWhilePending pending={pending} />
    </div>
  );
}
