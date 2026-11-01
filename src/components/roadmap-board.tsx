"use client";

import { useState, useTransition } from "react";
import { updateEnhancementStatus } from "@/app/(app)/roadmap/actions";
import type { EnhancementStatusT } from "@/db/schema";

export type EnhCard = {
  id: string;
  title: string;
  score: number;
  demand: number;
  status: EnhancementStatusT;
  jiraKey: string | null;
  jiraUrl?: string | null;
  jiraStatus?: string | null;
};

const COLS: [EnhancementStatusT, string][] = [
  ["review", "Under review"],
  ["planned", "Planned"],
  ["progress", "In progress"],
  ["shipped", "Shipped"],
];

export function RoadmapBoard({ enh }: { enh: EnhCard[] }) {
  const [items, setItems] = useState(enh);
  const [, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (status: EnhancementStatusT) => {
    const id = dragId;
    setOver(null);
    setDragId(null);
    if (!id) return;
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e))); // optimistic
    start(() => {
      void updateEnhancementStatus(id, status);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {COLS.map(([key, label]) => {
        const cards = items.filter((e) => e.status === key);
        return (
          <div
            key={key}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(key);
            }}
            onDragLeave={() => setOver((o) => (o === key ? null : o))}
            onDrop={() => drop(key)}
            className={`min-h-[320px] rounded-[12px] border p-3 transition ${
              over === key ? "border-indigo bg-[var(--indigo-soft)]" : "border-border bg-surface"
            }`}
          >
            <div className="mb-2.5 flex items-center gap-2 px-1 text-[11.5px] font-bold uppercase tracking-wide text-muted">
              {label}
              <span className="rounded-full border border-border bg-bg px-1.5 text-[10.5px]">
                {cards.length}
              </span>
            </div>
            {cards.map((e) => (
              <div
                key={e.id}
                draggable
                onDragStart={() => setDragId(e.id)}
                className="mb-2 cursor-grab rounded-[9px] border border-border bg-bg p-3 shadow-[var(--shadow)] active:cursor-grabbing"
              >
                <div className="text-[12.5px] font-semibold leading-snug">{e.title}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-[6px] bg-[var(--indigo-soft)] px-1.5 py-0.5 font-bold text-indigo">
                    {e.score.toFixed(1)}
                  </span>
                  <span>◆ {e.demand} evidence</span>
                  {e.jiraKey && e.jiraKey !== "__sending__" && (
                    e.jiraUrl ? (
                      <a
                        href={e.jiraUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        draggable={false}
                        title={e.jiraStatus ? `Jira: ${e.jiraStatus}` : undefined}
                        className="rounded-[5px] bg-[var(--indigo-soft)] px-1.5 py-0.5 font-semibold text-indigo hover:underline"
                      >
                        🔗 {e.jiraKey}
                      </a>
                    ) : (
                      <span className="rounded-[5px] bg-[var(--indigo-soft)] px-1.5 py-0.5 font-semibold text-indigo">🔗 {e.jiraKey}</span>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
