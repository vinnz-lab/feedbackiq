"use client";

import { useActionState } from "react";
import { changeMemberRole, type RoleChangeState } from "./team-actions";

const OPTIONS = [
  ["owner", "Product Owner"],
  ["contributor", "Contributor"],
  ["executive", "Executive"],
  ["engineer", "Engineer"],
  ["viewer", "Viewer (view only)"],
] as const;

/** Owner-only: change someone's role in this workspace. Saves on change. */
export function RoleSelect({ id, name, role }: { id: string; name: string; role: string }) {
  const [state, action, pending] = useActionState<RoleChangeState, FormData>(changeMemberRole, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select
        name="role"
        defaultValue={role}
        disabled={pending}
        aria-label={`Role for ${name}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-[var(--radius-pill)] border border-border bg-[var(--indigo-soft)] px-2 py-0.5 text-[11.5px] font-semibold text-indigo disabled:opacity-50"
      >
        {OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      {state.error && <span className="text-[11px] text-rose">⚠ {state.error}</span>}
      {state.ok && !pending && <span className="text-[11px] text-emerald">✓</span>}
    </form>
  );
}
