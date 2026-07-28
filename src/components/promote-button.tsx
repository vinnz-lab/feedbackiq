"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { promoteThemeToEnhancement } from "@/app/(app)/roadmap/actions";

export function PromoteButton({ themeId }: { themeId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<null | boolean>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending || done !== null}
        onClick={() =>
          start(async () => {
            const r = await promoteThemeToEnhancement(themeId);
            setDone(r.created);
          })
        }
        className="rounded-[var(--radius-btn)] bg-indigo px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "…" : "→ Promote to enhancement"}
      </button>
      {done !== null && (
        <span className="text-[12px] text-muted">
          {done ? "✓ Added to roadmap" : "Already on roadmap"} ·{" "}
          <Link href="/roadmap" className="font-semibold text-indigo">view</Link>
        </span>
      )}
    </div>
  );
}
