"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { createWorkspace, switchWorkspace, type CreateWorkspaceState } from "@/app/(app)/workspace-actions";

export type SwitcherItem = { id: string; name: string; sub: string; role: string };

/** The workspace button at the top of the sidebar. */
export function WorkspaceSwitcher({
  current,
  items,
  canCreate,
}: {
  current: SwitcherItem;
  items: SwitcherItem[];
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [state, action, saving] = useActionState<CreateWorkspaceState, FormData>(createWorkspace, {});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // pointerdown, not click: by the time a click finishes, the button that was
    // pressed may already have been replaced (e.g. "New workspace" → the form),
    // so a click-based check thinks the press happened OUTSIDE and closes the menu.
    const onClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("pointerdown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative mx-1 mb-3.5">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch workspace"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left shadow-[var(--shadow)] hover:bg-hover"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--indigo)" }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{current.name}</span>
          {current.sub && <span className="block truncate text-[11.5px] text-muted">{current.sub}</span>}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-lg border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]"
        >
          <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">
            Your workspaces
          </div>
          <div className="max-h-64 overflow-y-auto">
            {items.map((w) => (
              <button
                key={w.id}
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => {
                  if (w.id === current.id) return setOpen(false);
                  setError(null);
                  start(async () => {
                    const r = await switchWorkspace(w.id);
                    if (r?.error) setError(r.error);
                  });
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                {w.id === current.id && <Check size={14} className="shrink-0 text-indigo" />}
              </button>
            ))}
          </div>
          {pending && <div className="px-2 py-1 text-[11.5px] text-muted">Opening…</div>}
          {error && <div className="px-2 py-1 text-[11.5px] text-rose">⚠ {error}</div>}

          {canCreate && (
            <div className="mt-1 border-t border-border pt-1">
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-semibold text-indigo hover:bg-hover"
                >
                  <Plus size={14} /> New workspace
                </button>
              ) : (
                <form action={action} className="flex flex-col gap-1.5 p-1.5">
                  <input
                    name="name"
                    autoFocus
                    required
                    maxLength={80}
                    placeholder="Name, e.g. Demo"
                    aria-label="New workspace name"
                    className="rounded-md border border-border bg-bg px-2 py-1.5 text-[12.5px]"
                  />
                  <input
                    name="description"
                    maxLength={120}
                    placeholder="Description (optional)"
                    aria-label="New workspace description"
                    className="rounded-md border border-border bg-bg px-2 py-1.5 text-[12.5px]"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-md bg-indigo px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      {saving ? "Creating…" : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-muted"
                    >
                      Cancel
                    </button>
                  </div>
                  {state.error && <div className="text-[11.5px] text-rose">⚠ {state.error}</div>}
                  <div className="text-[11px] text-muted">Starts empty. You&apos;ll be its owner.</div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
