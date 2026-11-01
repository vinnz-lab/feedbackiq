import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/workspace";
import { getJiraConnection, isConnected } from "@/lib/jira-workspace";
import { JiraCell, RefreshFromJiraButton } from "@/components/jira-cell";
import { getDb, schema } from "@/db";
import { computeScore } from "@/lib/score";
import { RoadmapBoard, type EnhCard } from "@/components/roadmap-board";
import { ScoreEditor } from "@/components/score-editor";
import type { EnhancementStatusT } from "@/db/schema";

export const dynamic = "force-dynamic";
// "Refresh from Jira" checks each linked ticket in turn.
export const maxDuration = 300;

const STATUS_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  review: { label: "Under review", bg: "var(--slate-soft)", fg: "var(--slate)" },
  planned: { label: "Planned", bg: "var(--indigo-soft)", fg: "var(--indigo)" },
  progress: { label: "In progress", bg: "var(--amber-soft)", fg: "var(--amber)" },
  shipped: { label: "Shipped", bg: "var(--emerald-soft)", fg: "var(--emerald)" },
  wontdo: { label: "Won't do", bg: "var(--slate-soft)", fg: "var(--slate)" },
};

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view = rawView === "board" ? "board" : "backlog";
  const ctx = await requireWorkspace();
  const wsId = ctx.workspace.id;
  const isOwner = ctx.role === "owner";
  const jiraConnected = isConnected(await getJiraConnection(wsId));
  const db = await getDb();

  // The linked theme's name is shown live, so a rename or merge can never leave
  // the roadmap saying something different from the Themes page.
  const rows = await db
    .select({ e: schema.enhancements, themeTitle: schema.themes.title })
    .from(schema.enhancements)
    .leftJoin(schema.themes, eq(schema.enhancements.themeId, schema.themes.id))
    .where(eq(schema.enhancements.workspaceId, wsId))
    .orderBy(desc(schema.enhancements.createdAt));
  const enh = rows.map(({ e, themeTitle }) => ({
    id: e.id,
    benefitRaw: e.benefit,
    effortRaw: e.effort,
    title: themeTitle ?? e.title,
    benefit: e.benefit,
    effort: e.effort,
    demand: e.demand,
    status: e.status,
    jiraKey: e.jiraKey,
    jiraUrl: e.jiraUrl,
    jiraStatus: e.jiraStatus,
    score: computeScore(e.benefit, e.effort, e.demand),
  }));

  const ranked = [...enh].sort((a, b) => b.score - a.score);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">Roadmap</h1>
          <p className="mt-1 text-[13px] text-muted">
            Prioritised from approved feedback · score = demand + benefit − effort
          </p>
        </div>
        {isOwner && jiraConnected && enh.some((e) => e.jiraKey) && (
          <div className="ml-auto">
            <RefreshFromJiraButton />
          </div>
        )}
        <div className={`${isOwner && jiraConnected && enh.some((e) => e.jiraKey) ? "" : "ml-auto "}inline-flex gap-1 rounded-[10px] border border-border bg-surface p-1`}>
          {(["backlog", "board"] as const).map((v) => (
            <Link
              key={v}
              href={`/roadmap?view=${v}`}
              className={`rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold capitalize ${
                view === v ? "bg-indigo text-white" : "text-muted hover:text-fg"
              }`}
            >
              {v === "backlog" ? "Prioritised backlog" : "Board"}
            </Link>
          ))}
        </div>
      </div>

      {view === "board" ? (
        <RoadmapBoard enh={enh as EnhCard[]} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-bg text-left">
                  <Th>Enhancement</Th><Th>Score</Th><Th>Demand</Th><Th colSpan={2}>Benefit &amp; effort (1–10)</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {enh.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center">
                      <div className="text-[14px] font-semibold">No roadmap items yet</div>
                      <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-muted">
                        Go to{" "}
                        <Link href="/themes" className="font-semibold text-indigo">Themes</Link>{" "}
                        and choose “→ Add to roadmap” on a theme. It will appear here with a
                        score based on how many people raised it.
                      </p>
                    </td>
                  </tr>
                )}
                {ranked.map((e, idx) => {
                  const st = STATUS_LABEL[e.status];
                  return (
                    <tr key={e.id} className="border-t border-border hover:bg-hover">
                      <td className="px-3 py-2.5 font-semibold">
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo text-[10.5px] font-bold text-white">
                          {idx + 1}
                        </span>
                        {e.title}
                        <div className="pl-7 font-normal empty:hidden [&:not(:empty)]:mt-1.5">
                          <JiraCell
                            enhancementId={e.id}
                            jiraKey={e.jiraKey}
                            jiraUrl={e.jiraUrl}
                            jiraStatus={e.jiraStatus}
                            canSend={isOwner && jiraConnected}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-[7px] bg-[var(--indigo-soft)] px-2 py-0.5 font-extrabold text-indigo">
                          {e.score.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5"><b>{e.demand}</b></td>
                      <td colSpan={2} className="px-3 py-2.5">
                        <ScoreEditor id={e.id} benefit={e.benefitRaw} effort={e.effortRaw} />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="whitespace-nowrap rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: st.bg, color: st.fg }}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-3 py-2.5 text-[11.5px] text-muted">
              Score = benefit + demand − effort. Edit benefit or effort (1–10) and it re-ranks. “Re-estimate” recalculates from the feedback. Drag items across the Board to set status.
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
            <h3 className="text-[13px] font-bold">Benefit / effort matrix</h3>
            <p className="mb-1 text-[11.5px] text-muted">Quick wins surface top-left · bubble size = demand · numbers match the list</p>
            <Matrix enh={ranked} />
          </div>
        </div>
      )}
    </div>
  );
}

function Matrix({ enh }: { enh: { title: string; benefit: number; effort: number; demand: number }[] }) {
  const w = 330, h = 300, pad = 36;
  const X = (c: number) => pad + (c / 10) * (w - pad - 16);
  const Y = (b: number) => h - pad - (b / 10) * (h - pad - 20);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full">
      <rect x={pad} y={16} width={(w - pad - 16) / 2} height={(h - pad - 20) / 2} fill="var(--emerald-soft)" />
      <line x1={pad} y1={Y(5)} x2={w - 16} y2={Y(5)} stroke="var(--border)" />
      <line x1={X(5)} y1={16} x2={X(5)} y2={h - pad} stroke="var(--border)" />
      <text x={pad + 6} y={30} fontSize="9.5" fontWeight="700" fill="var(--emerald)">QUICK WINS</text>
      <text x={X(5) + 6} y={30} fontSize="9.5" fontWeight="700" fill="var(--muted)">BIG BETS</text>
      <text x={pad + 6} y={h - pad - 8} fontSize="9.5" fontWeight="700" fill="var(--muted)">FILL-INS</text>
      <text x={X(5) + 6} y={h - pad - 8} fontSize="9.5" fontWeight="700" fill="var(--amber)">TIME SINKS</text>
      {enh.map((e, i) => {
        const r = 8 + Math.min(e.demand, 14) / 3;
        return (
          <g key={i}>
            <title>{`${e.title} — benefit ${e.benefit}, effort ${e.effort}, demand ${e.demand}`}</title>
            <circle cx={X(e.effort)} cy={Y(e.benefit)} r={r} fill="var(--indigo)" opacity="0.8" />
            <text x={X(e.effort)} y={Y(e.benefit) + 3.5} fontSize="10" textAnchor="middle" fill="#fff" fontWeight="700">
              {i + 1}
            </text>
          </g>
        );
      })}
      <text x={(w + pad) / 2 - 24} y={h - 6} fontSize="9.5" fill="var(--muted)" fontWeight="700">EFFORT →</text>
      <text x={12} y={h / 2} fontSize="9.5" fill="var(--muted)" fontWeight="700" transform={`rotate(-90 12 ${h / 2})`}>BENEFIT →</text>
    </svg>
  );
}

function Th({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return <th colSpan={colSpan} className="border-b border-border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">{children}</th>;
}
