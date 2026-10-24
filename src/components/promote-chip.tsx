"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { promoteThemeToEnhancement } from "@/app/(app)/roadmap/actions";

/** One-click "add to roadmap" for a theme card. Sits outside the card's link. */
export function PromoteChip({ themeId, onRoadmap }: { themeId: string; onRoadmap: boolean }) {
  const [pending, start] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (onRoadmap || added) {
    return (
      <Link
        href="/roadmap"
        className="rounded-[var(--radius-pill)] px-2.5 py-1 text-[11.5px] font-semibold hover:underline"
        style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}
      >
        ✓ On roadmap
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-[11px] text-rose">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              await promoteThemeToEnhancement(themeId);
              setAdded(true);
            } catch (e) {
              setError((e as Error).message || "Could not add");
            }
          })
        }
        className="rounded-[var(--radius-btn)] border border-border bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-indigo transition hover:bg-hover disabled:opacity-50"
      >
        {pending ? "Adding…" : "→ Add to roadmap"}
      </button>
    </span>
  );
}
