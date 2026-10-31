"use client";

import { useActionState } from "react";
import { removeAiKey, saveAiKey, type AiKeyState } from "./ai-key-actions";

export type AiStatusView = {
  using: "workspace" | "platform" | "none";
  last4: string | null;
  allowPlatformKey: boolean;
  updatedAt: string | null;
};

/** The workspace's AI key. Everyone sees which key is in use; only the owner can change it. */
export function AiConnection({ status, isOwner, canSave }: { status: AiStatusView; isOwner: boolean; canSave: boolean }) {
  const [saveState, save, saving] = useActionState<AiKeyState, FormData>(saveAiKey, {});
  const [removeState, remove, removing] = useActionState<AiKeyState, FormData>(removeAiKey, {});
  const banner =
    status.using === "workspace"
      ? { bg: "var(--emerald-soft)", fg: "var(--emerald)", text: `Using this workspace's own Gemini key (…${status.last4}).` }
      : status.using === "platform"
        ? { bg: "var(--slate-soft)", fg: "var(--slate)", text: "Using the platform's AI key." }
        : { bg: "var(--amber-soft)", fg: "var(--amber)", text: "No AI key — AI features are off until the owner adds this workspace's own key." };

  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">AI connection</h2>
      <p className="mt-1 mb-3 text-[13px] text-muted">
        The Gemini key that powers AI analysis, summaries and digests in this workspace.
      </p>
      <div className="mb-3.5 rounded-[10px] px-3.5 py-2.5 text-[12.5px] font-medium" style={{ background: banner.bg, color: banner.fg }}>
        {banner.text}
      </div>

      {!isOwner ? (
        <p className="text-[12.5px] text-muted">Only the workspace owner can change the AI key.</p>
      ) : (
        <>
          <form action={save} className="flex flex-col gap-2.5">
            <label className="block">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">
                {status.using === "workspace" ? "Replace with another key" : "Use your own Gemini key"}
              </span>
              <input
                name="apiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste a key from Google AI Studio → API keys"
                aria-label="Gemini API key"
                disabled={!canSave}
                className="w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 font-mono text-[13px] outline-none focus:border-indigo disabled:opacity-50"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving || !canSave}
                className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Checking with Google…" : "Check and save"}
              </button>
              {saveState.error && <span className="text-[12.5px] text-rose">⚠ {saveState.error}</span>}
              {saveState.ok && <span className="text-[12.5px] text-emerald">✓ {saveState.ok}</span>}
            </div>
            {!canSave && (
              <p className="text-[12px] text-muted">Saving keys isn&apos;t switched on for this app yet.</p>
            )}
          </form>

          {status.using === "workspace" && (
            <form action={remove} className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <button
                type="submit"
                disabled={removing}
                className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-hover disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove my key"}
              </button>
              <span className="text-[12px] text-muted">
                {status.allowPlatformKey
                  ? "AI will go back to using the platform's key."
                  : "AI features will stop until a key is added again."}
              </span>
              {removeState.error && <span className="text-[12.5px] text-rose">⚠ {removeState.error}</span>}
            </form>
          )}
          {removeState.ok && <p className="mt-2 text-[12.5px] text-emerald">✓ {removeState.ok}</p>}
          <p className="mt-3 text-[11.5px] text-muted">
            The key is checked with Google, then stored encrypted. It&apos;s never shown again — only its last 4
            characters — and isn&apos;t included in backups.
          </p>
        </>
      )}
    </section>
  );
}
