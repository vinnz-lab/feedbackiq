"use client";

import { useActionState, useState } from "react";
import { clearRegister, type ClearRegisterState } from "./clear-register-actions";

const initial: ClearRegisterState = {};

/** Owner-only reset. Two deliberate steps: backup acknowledged, then typed CLEAR. */
export function ClearRegister() {
  const [state, action, pending] = useActionState(clearRegister, initial);
  const [word, setWord] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  const ready = word.trim() === "CLEAR" && backedUp && !pending;

  return (
    <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--rose)] bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">Clear the register</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted">
        Removes every feedback item, source, theme, roadmap item and digest so you can start
        fresh, for example before a demo. Team members, logins and settings are kept. This
        cannot be undone, so download a backup first.
      </p>

      <form action={action} className="flex flex-col gap-3">
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
          I have downloaded a backup
        </label>

        <label className="block text-[13px]">
          <span className="mb-1 block text-muted">
            Type <strong>CLEAR</strong> to confirm
          </span>
          <input
            name="confirm"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            autoComplete="off"
            className="w-full max-w-xs rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-1.5 text-[13px]"
          />
        </label>

        <div>
          <button
            type="submit"
            disabled={!ready}
            className="rounded-[var(--radius-btn)] bg-[var(--rose)] px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-40"
          >
            {pending ? "Clearing…" : "Clear the register"}
          </button>
        </div>

        {state.error && <p className="text-[12.5px] text-rose">⚠ {state.error}</p>}
        {state.ok && <p className="text-[12.5px] text-emerald">✓ {state.ok}</p>}
      </form>
    </section>
  );
}
