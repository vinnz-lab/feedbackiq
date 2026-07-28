import Link from "next/link";
import {
  Card,
  TypePill,
  SentimentPill,
  PriorityPill,
  DeltaChip,
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
  deltaPct: number;
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

export function ThemeCard({ theme, agg }: { theme: ThemeRow; agg: ThemeAgg }) {
  return (
    <Link href={`/themes/${theme.id}`} className="block">
      <Card className="flex h-full cursor-pointer flex-col gap-2.5 p-6 transition hover:border-indigo hover:shadow-[0_6px_20px_-6px_rgba(0,0,0,0.14)]">
        <div className="flex items-start gap-2.5">
          <div className="flex-1 text-[16px] font-semibold leading-snug">
            {theme.title}
            {theme.isEmerging && (
              <span className="ml-2 rounded-[4px] bg-rose px-1.5 py-px align-middle text-[9.5px] font-extrabold tracking-wide text-white">
                EMERGING
              </span>
            )}
          </div>
          <DeltaChip value={theme.deltaPct} />
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
          <b className="font-semibold text-fg">{agg.total} mentions</b>
          {agg.total > 0 && <> · {mixString(agg.mix)}</>}
        </div>
        <SentimentBar positive={agg.pos} neutral={agg.neu} negative={agg.neg} showLegend />
      </Card>
    </Link>
  );
}
