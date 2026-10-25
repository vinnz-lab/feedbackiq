import Link from "next/link";
import type { Trend } from "@/lib/trend";
import { PromoteChip } from "@/components/promote-chip";
import {
  Card,
  TypePill,
  SentimentPill,
  PriorityPill,
  TrendChip,
  SentimentBar,
  AiText,
  type FeedbackType,
  type Sentiment,
  type Priority,
} from "@/components/ui";

export type ThemeAgg = {
  total: number;
  pos: number;
  neu: number;
  neg: number;
  mix: Record<string, number>;
};

export type ThemeRow = {
  id: string;
  title: string;
  summary: string | null;
  type: string | null;
  sentiment: string | null;
  priority: string | null;
  trend?: Trend;
  isEmerging: boolean;
};

const KIND_ICON: Record<string, string> = {
  email: "📧",
  recording: "🎙",
  transcript: "🎙",
  spreadsheet: "📊",
  note: "📝",
  paste: "📋",
};

export function mixString(mix: Record<string, number>) {
  return Object.entries(mix)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${KIND_ICON[k] ?? "•"} ${n}`)
    .join(" · ");
}

export function ThemeCard({
  theme,
  agg,
  onRoadmap = false,
}: {
  theme: ThemeRow;
  agg: ThemeAgg;
  onRoadmap?: boolean;
}) {
  return (
    // The button sits beside the link, not inside it — a button nested in a
    // link is invalid HTML and would navigate away when clicked.
    <div className="relative h-full">
    <Link href={`/themes/${theme.id}`} className="block h-full">
      <Card className="flex h-full cursor-pointer flex-col gap-2.5 p-6 pb-14 transition hover:border-indigo hover:shadow-[0_6px_20px_-6px_rgba(0,0,0,0.14)]">
        <div className="flex items-start gap-2.5">
          <div className="flex-1 text-[16px] font-semibold leading-snug">
            {theme.title}
            {theme.isEmerging && (
              <span className="ml-2 rounded-[4px] bg-rose px-1.5 py-px align-middle text-[9.5px] font-extrabold tracking-wide text-white">
                EMERGING
              </span>
            )}
          </div>
          <TrendChip trend={theme.trend} />
        </div>
        {theme.summary && (
          <div className="line-clamp-2 min-h-10 text-[13px] text-muted">
            <AiText>{theme.summary}</AiText>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {theme.type && <TypePill type={theme.type as FeedbackType} />}
          {theme.sentiment && <SentimentPill sentiment={theme.sentiment as Sentiment} />}
          {theme.priority && <PriorityPill priority={theme.priority as Priority} />}
        </div>
        <div className="text-[12px] text-muted">
          <b className="font-semibold text-fg">{agg.total} {agg.total === 1 ? "mention" : "mentions"}</b>
          {agg.total > 0 && <> · {mixString(agg.mix)}</>}
        </div>
        <SentimentBar positive={agg.pos} neutral={agg.neu} negative={agg.neg} showLegend />
      </Card>
    </Link>
    <div className="absolute bottom-3.5 right-4">
      <PromoteChip themeId={theme.id} onRoadmap={onRoadmap} />
    </div>
    </div>
  );
}
