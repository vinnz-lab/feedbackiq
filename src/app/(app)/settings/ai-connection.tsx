"use client";

import { useActionState, useState } from "react";
import { removeAiKey, saveAiKey, type AiKeyState } from "./ai-key-actions";
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from "@/lib/ai/providers";

export type AiStatusView = {
  using: "workspace" | "platform" | "none";
  hasOwnKey?: boolean;
  provider?: ProviderId;
  model?: string;
  last4: string | null;
  allowPlatformKey: boolean;
  updatedAt: string | null;
};

/** The workspace's AI provider and key. Everyone sees what's in use; only the owner can change it. */
export function AiConnection({ status, isOwner, canSave }: { status: AiStatusView; isOwner: boolean; canSave: boolean }) {
  const [saveState, save, saving] = useActionState<AiKeyState, FormData>(saveAiKey, {});
  const [removeState, remove, removing] = useActionState<AiKeyState, FormData>(removeAiKey, {});
  const savedProvider: ProviderId = status.using === "workspace" ? (status.provider ?? "gemini") : "gemini";
  const [provider, setProvider] = useState<ProviderId>(savedProvider);
  const p = PROVIDERS[provider];
  const savedModel = status.using === "workspace" && provider === savedProvider ? status.model : undefined;
  const knownModel = (m?: string) => Boolean(m && p.models.some((x) => x.id === m));
  const [modelChoice, setModelChoice] = useState<string>(knownModel(savedModel) ? savedModel! : savedModel ? "__other" : p.defaultModel);
  const [customModel, setCustomModel] = useState<string>(savedModel && !knownModel(savedModel) ? savedModel : "");
  const canKeepKey = status.using === "workspace" && provider === savedProvider;

  const pick = (id: ProviderId) => {
    setProvider(id);
    const keep = status.using === "workspace" && id === savedProvider ? status.model : undefined;
    const known = keep && PROVIDERS[id].models.some((x) => x.id === keep);
    setModelChoice(known ? keep! : keep ? "__other" : PROVIDERS[id].defaultModel);
    setCustomModel(keep && !known ? keep : "");
  };

  const sp = PROVIDERS[status.provider ?? "gemini"];
  const banner =
    status.using === "workspace"
      ? { bg: "var(--emerald-soft)", fg: "var(--emerald)", text: `Using this workspace's own ${sp.name} key (…${status.last4}) · model ${status.model}.` }
      : status.using === "platform"
        ? { bg: "var(--slate-soft)", fg: "var(--slate)", text: "Using the platform's AI key (Google Gemini)." }
        : { bg: "var(--amber-soft)", fg: "var(--amber)", text: "No AI key — AI features are off until the owner adds this workspace's own key." };

  const label = "mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted";
  const field = "w-full rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo disabled:opacity-50";

  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h2 className="text-[15px] font-semibold">AI connection</h2>
      <p className="mt-1 mb-3 text-[13px] text-muted">
        The AI that powers analysis, themes, summaries and digests in this workspace. Bring your own key from Google, OpenAI or
        Anthropic — usage is then billed to your account, not the platform&apos;s.
      </p>
      <div data-testid="ai-status" className="mb-3.5 rounded-[10px] px-3.5 py-2.5 text-[12.5px] font-medium" style={{ background: banner.bg, color: banner.fg }}>
        {banner.text}
      </div>

      {!isOwner ? (
        <p className="text-[12.5px] text-muted">Only the workspace owner can change the AI key.</p>
      ) : (
        <>
          <form action={save} className="flex flex-col gap-3">
            <fieldset>
              <legend className={label}>AI provider</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PROVIDER_IDS.map((id) => (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 text-[13px] font-semibold ${provider === id ? "border-indigo bg-[var(--indigo-soft)] text-indigo" : "border-border hover:bg-hover"}`}
                  >
                    <input type="radio" name="provider" value={id} checked={provider === id} onChange={() => pick(id)} className="accent-[var(--indigo)]" disabled={!canSave} />
                    {PROVIDERS[id].name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Model</span>
                <select name="model" value={modelChoice} onChange={(e) => setModelChoice(e.target.value)} aria-label="AI model" className="fiq-select w-full" disabled={!canSave}>
                  {p.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value="__other">Another model — type its name…</option>
                </select>
              </label>
              {modelChoice === "__other" && (
                <label className="block">
                  <span className={label}>Model name</span>
                  <input
                    name="customModel"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder={`e.g. ${p.defaultModel}`}
                    aria-label="Model name"
                    spellCheck={false}
                    className={`${field} font-mono`}
                  />
                </label>
              )}
            </div>

            <label className="block">
              <span className={label}>{canKeepKey ? `${p.name} API key — leave blank to keep the saved one` : `${p.name} API key`}</span>
              <input
                name="apiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={canKeepKey ? `Saved key …${status.last4}` : `Paste a key from ${p.keyWhere}`}
                aria-label="AI API key"
                disabled={!canSave}
                className={`${field} font-mono`}
              />
            </label>
            <p className="-mt-1 text-[11.5px] text-muted">
              Get a key at{" "}
              <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo hover:underline">
                {p.keyWhere}
              </a>
              . {p.billingNote}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving || !canSave}
                className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
              >
                {saving ? `Checking with ${p.company}…` : "Check and save"}
              </button>
              {saveState.error && <span className="text-[12.5px] text-rose">⚠ {saveState.error}</span>}
              {saveState.ok && <span className="text-[12.5px] text-emerald">✓ {saveState.ok}</span>}
            </div>
            {!canSave && <p className="text-[12px] text-muted">Saving keys isn&apos;t switched on for this app yet.</p>}
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
                {status.allowPlatformKey ? "AI will go back to using the platform's key." : "AI features will stop until a key is added again."}
              </span>
              {removeState.error && <span className="text-[12.5px] text-rose">⚠ {removeState.error}</span>}
            </form>
          )}
          {removeState.ok && <p className="mt-2 text-[12.5px] text-emerald">✓ {removeState.ok}</p>}
          <p className="mt-3 text-[11.5px] text-muted">
            Saving checks the key with a tiny test request (a fraction of a penny), then stores it encrypted. It&apos;s never shown
            again — only its last 4 characters — and isn&apos;t included in backups.
          </p>
        </>
      )}
    </section>
  );
}
