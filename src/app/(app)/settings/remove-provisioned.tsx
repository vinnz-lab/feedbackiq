"use client";

import { useActionState, useState } from "react";
import { removeProvisionedWorkspace, resetProvisionedOwnerPassword, setPlatformKeyAllowed, type RemoveProvisionedState } from "./platform-actions";
import { ResetPasswordButton } from "./reset-member-password";
import { useTransition } from "react";

export type ProvisionedRow = {
  workspaceId: string;
  name: string;
  owner: string;
  createdAt: string;
  memberCount: number;
  onlyHere: number;
  allowPlatformKey: boolean;
  hasOwnKey: boolean;
};

/** One row of "Workspaces you've set up", with an inline, guarded Remove. */
export function ProvisionedItem({
  p,
  onRemoved,
  canResetOwner = false,
}: {
  p: ProvisionedRow;
  onRemoved: (message: string) => void;
  canResetOwner?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [allowed, setAllowed] = useState(p.allowPlatformKey);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [toggling, startToggle] = useTransition();
  const [removeSignins, setRemoveSignins] = useState(true);
  // The success message is handed up the moment the server replies. The same
  // reply refreshes the list, which removes this row, so anything done later
  // (an effect, or rendering it here) never gets the chance to show.
  const [state, action, pending] = useActionState<RemoveProvisionedState, FormData>(async (prev, fd) => {
    const r = await removeProvisionedWorkspace(prev, fd);
    if (r.ok) onRemoved(r.ok);
    return r;
  }, {});

  if (state.ok) return null;

  return (
    <div className="border-b border-border py-2 text-[12.5px] last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{p.name}</span>
        <span className="text-muted">{p.owner}</span>
        {p.hasOwnKey && (
          <span className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}>
            OWN AI KEY
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-[11.5px] text-muted" title="Whether this workspace may use your AI key">
          <input
            type="checkbox"
            checked={allowed}
            disabled={toggling}
            aria-label={`${p.name} may use your AI key`}
            onChange={(e) => {
              const next = e.target.checked;
              setKeyError(null);
              setAllowed(next); // show it straight away; undo if the server refuses
              startToggle(async () => {
                const r = await setPlatformKeyAllowed(p.workspaceId, next);
                if (r.error) {
                  setAllowed(!next);
                  setKeyError(r.error);
                }
              });
            }}
            className="h-3.5 w-3.5 accent-[var(--indigo)]"
          />
          Uses your AI key
        </label>
        <span className="text-[11.5px] text-muted">{new Date(p.createdAt).toLocaleDateString("en-GB")}</span>
        {!open && canResetOwner && (
          <ResetPasswordButton action={resetProvisionedOwnerPassword} field="workspaceId" value={p.workspaceId} name={p.owner} />
        )}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Remove ${p.name}`}
            className="rounded-[var(--radius-btn)] px-2 py-1 text-[11.5px] font-semibold text-muted hover:bg-[var(--rose-soft)] hover:text-rose"
          >
            Remove
          </button>
        )}
      </div>

      {keyError && <div className="mt-1 text-[11.5px] text-rose">⚠ {keyError}</div>}
      {open && (
        <form action={action} className="mt-2 flex flex-col gap-2 rounded-[10px] border border-[var(--rose)] bg-bg p-3">
          <input type="hidden" name="workspaceId" value={p.workspaceId} />
          <div className="text-[12px]">
            Permanently deletes <b>{p.name}</b> and everything in it. You won&apos;t see what&apos;s inside. It has{" "}
            {p.memberCount} {p.memberCount === 1 ? "person" : "people"} in it.
          </div>
          {p.onlyHere > 0 && (
            <label className="flex items-start gap-2 text-[12px]">
              <input
                type="checkbox"
                name="removeSignins"
                checked={removeSignins}
                onChange={(e) => setRemoveSignins(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--rose)]"
              />
              <span>
                Also remove the sign-in of the {p.onlyHere} {p.onlyHere === 1 ? "person" : "people"} who would have
                no workspace left. Anyone in another workspace keeps their account either way.
              </span>
            </label>
          )}
          <label className="block text-[12px]">
            <span className="mb-1 block text-muted">
              Type <b className="text-fg">{p.name}</b> to confirm
            </span>
            <input
              name="confirmName"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              aria-label={`Type ${p.name} to confirm removal`}
              className="w-full max-w-xs rounded-[var(--radius-btn)] border border-border bg-surface px-2.5 py-1.5 text-[12.5px]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={typed.trim() !== p.name || pending}
              className="rounded-[var(--radius-btn)] bg-[var(--rose)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {pending ? "Removing…" : "Remove permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted"
            >
              Cancel
            </button>
          </div>
          {state.error && <div className="text-[12px] text-rose">⚠ {state.error}</div>}
        </form>
      )}
    </div>
  );
}
