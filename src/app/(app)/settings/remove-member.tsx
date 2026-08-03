"use client";

import { useActionState } from "react";
import { removeTeamMember, type RemoveUserState } from "./team-actions";

const initial: RemoveUserState = {};

/** Revokes a tester's access — both their sign-in and their workspace record. */
export function RemoveMember({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(removeTeamMember, initial);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name}? Their sign-in will stop working immediately.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        title={state.error ?? `Remove ${name}`}
        className="rounded-[var(--radius-btn)] px-2.5 py-1 text-[11.5px] font-semibold text-muted transition hover:bg-[var(--rose-soft)] hover:text-rose disabled:opacity-50"
      >
        {pending ? "…" : "Remove"}
      </button>
      {state.error && <span className="ml-2 text-[11.5px] text-rose">{state.error}</span>}
    </form>
  );
}
