"use client";

import { useActionState, useState } from "react";
import { deleteWorkspace, type DeleteWorkspaceState } from "@/app/(app)/workspace-actions";

/** Owner-only. Disabled when this is the person's only workspace. */
export function DeleteWorkspace({
  name,
  isLast,
  others,
  counts,
}: {
  name: string;
  isLast: boolean;
  /** Other people who will lose access to this workspace. */
  others: string[];
  counts: { items: number; themes: number; roadmap: number };
}) {
  const [state, action, pending] = useActionState<DeleteWorkspaceState, FormData>(deleteWorkspace, {});
  const [typed, setTyped] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  const ready = !isLast && typed.trim() === name && backedUp && !pending;

  return (
    <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--rose)] bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold text-rose">Delete this workspace</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted">
        Permanently deletes <b className="text-fg">{name}</b> and everything in it — {counts.items} feedback
        item{counts.items === 1 ? "" : "s"}, {counts.themes} theme{counts.themes === 1 ? "" : "s"} and{" "}
        {counts.roadmap} roadmap item{counts.roadmap === 1 ? "" : "s"}. This cannot be undone. Your other
        workspaces are not affected.
      </p>

      {isLast ? (
        <p className="rounded-[10px] bg-bg px-3.5 py-3 text-[12.5px] text-muted">
          This is your only workspace, so it can&apos;t be deleted. To start fresh, use “Clear the register” above instead.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          {others.length > 0 && (
            <div
              className="rounded-[10px] border px-3.5 py-3 text-[12.5px] font-medium"
              style={{ background: "var(--amber-soft)", borderColor: "var(--amber)", color: "var(--amber)" }}
            >
              ⚠ {others.length} other {others.length === 1 ? "person" : "people"} will lose access: {others.join(", ")}.
              Their accounts stay, but anyone without another workspace won&apos;t be able to see anything.
            </div>
          )}
          <a
            href="/api/export"
            className="w-fit rounded-[var(--radius-btn)] border border-border bg-surface px-4 py-2 text-[13px] font-semibold hover:bg-hover"
          >
            ⬇ Download a backup first
          </a>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="backupDone"
              checked={backedUp}
              onChange={(e) => setBackedUp(e.target.checked)}
              className="h-4 w-4 accent-[var(--rose)]"
            />
            I have downloaded a backup of this workspace
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block text-muted">
              Type <b className="text-fg">{name}</b> to confirm
            </span>
            <input
              name="confirmName"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              aria-label="Type the workspace name to confirm"
              className="w-full max-w-xs rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-1.5 text-[13px]"
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={!ready}
              className="rounded-[var(--radius-btn)] bg-[var(--rose)] px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-40"
            >
              {pending ? "Deleting…" : "Delete this workspace"}
            </button>
          </div>
          {state.error && <p className="text-[12.5px] text-rose">⚠ {state.error}</p>}
        </form>
      )}
    </section>
  );
}
