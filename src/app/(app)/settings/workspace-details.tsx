"use client";

import { useActionState } from "react";
import { updateWorkspace, type UpdateWorkspaceState } from "@/app/(app)/workspace-actions";

/** Name and description of the current workspace. Owner only. */
export function WorkspaceDetails({ name, description }: { name: string; description: string }) {
  const [state, action, pending] = useActionState<UpdateWorkspaceState, FormData>(updateWorkspace, {});
  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">Workspace</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted">
        The name shown in the sidebar and across the app. Only people in this workspace see it.
      </p>
      <form action={action} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">Name</span>
          <input
            name="name"
            defaultValue={name}
            required
            maxLength={80}
            aria-label="Workspace name"
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-2.5 py-1.5 text-[13px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">Description</span>
          <input
            name="description"
            defaultValue={description}
            maxLength={120}
            aria-label="Workspace description"
            className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-2.5 py-1.5 text-[13px]"
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[var(--radius-btn)] bg-indigo px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {state.error && <span className="text-[12px] text-rose">⚠ {state.error}</span>}
          {state.ok && <span className="text-[12px] text-emerald">✓ {state.ok}</span>}
        </div>
      </form>
    </section>
  );
}
