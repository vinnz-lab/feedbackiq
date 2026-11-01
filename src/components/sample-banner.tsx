"use client";

import { useActionState } from "react";
import { clearSampleData, type SampleState } from "@/app/(app)/dashboard/sample-actions";

/** Shown on every page while a workspace contains sample data. */
export function SampleBanner({ canEdit }: { canEdit: boolean }) {
  const [state, clear, clearing] = useActionState<SampleState, FormData>(clearSampleData, {});
  if (state.ok === "Sample data removed.") return null;
  return (
    <div
      data-testid="sample-banner"
      className="flex flex-wrap items-center gap-3 border-b px-6 py-2 text-[12.5px]"
      style={{ background: "var(--amber-soft)", borderColor: "var(--amber)", color: "var(--amber)" }}
    >
      <span>
        <b>This workspace contains sample data</b> — a made-up product&apos;s feedback, for exploring. It&apos;s labelled “Sample —” wherever it appears.
      </span>
      {canEdit && (
        <form
          action={clear}
          className="ml-auto"
          onSubmit={(e) => {
            if (!confirm("Remove all sample data? Its feedback, themes and roadmap items, and any digests written since it was added, will be deleted. Feedback you added yourself is kept.")) e.preventDefault();
          }}
        >
          <button type="submit" disabled={clearing} className="rounded-[var(--radius-btn)] border px-3 py-1 font-semibold disabled:opacity-50" style={{ borderColor: "var(--amber)" }}>
            {clearing ? "Removing…" : "Remove sample data"}
          </button>
        </form>
      )}
      {state.error && <span className="text-rose">⚠ {state.error}</span>}
    </div>
  );
}
