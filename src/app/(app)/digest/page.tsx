import { desc, eq } from "drizzle-orm";
import { currentWorkspaceId } from "@/lib/workspace";
import { currentCan } from "@/lib/permissions";
import { getDb, schema } from "@/db";
import { GenerateDigestButton } from "@/components/generate-digest-button";
import { DigestView } from "@/components/digest-view";
import { PostDigestButtons } from "@/components/post-digest-buttons";
import { ShareLinkPanel } from "@/components/share-link-panel";
import type { DigestContent } from "@/lib/digest-content";
import { getChannels, getShareLink } from "@/lib/sharing-data";
import { appOrigin } from "@/lib/jira-workspace";
import { requireWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
// Server Action timeout is set at the page level; AI batches are paced and
// can run for minutes. 300s is the Vercel Hobby ceiling.
export const maxDuration = 300;


export default async function DigestPage() {
  const wsId = await currentWorkspaceId();
  const canEdit = await currentCan("edit");
  const db = await getDb();
  const [latest] = await db
    .select()
    .from(schema.digests)
    .where(eq(schema.digests.workspaceId, wsId))
    .orderBy(desc(schema.digests.createdAt))
    .limit(1);
  const c = latest?.content as DigestContent | undefined;
  const ctx = await requireWorkspace();
  const isOwner = ctx.role === "owner";
  const [channels, share, origin] = await Promise.all([getChannels(wsId), isOwner ? getShareLink(wsId, "digest") : null, appOrigin()]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">Weekly digest</h1>
          <p className="mt-1 text-[13px] text-muted">
            An AI-written briefing of what changed in your feedback — for stakeholders who won&apos;t read every item.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canEdit && c && <PostDigestButtons channels={channels} />}
          {isOwner && <ShareLinkPanel kind="digest" view={share} origin={origin} />}
          {canEdit && <GenerateDigestButton />}
        </div>
      </div>

      {!c ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-11 text-center shadow-[var(--shadow)]">
          <div className="text-[16px] font-semibold">No digest yet</div>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
            Click <b>Generate weekly digest</b> and the AI will summarise your top themes, movers and
            notable quotes into a one-page briefing.
          </p>
        </div>
      ) : (
        <DigestView c={c} createdAt={latest?.createdAt ?? null} />
      )}
    </div>
  );
}
