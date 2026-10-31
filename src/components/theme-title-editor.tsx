"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { renameThemeAction } from "@/app/(app)/themes/[id]/actions";

const MAX = 100;

/** The theme heading, with an inline rename. */
export function ThemeTitleEditor({ themeId, title }: { themeId: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const trimmed = value.replace(/\s+/g, " ").trim();
  const tooLong = trimmed.length > MAX;
  const canSave = trimmed.length > 0 && !tooLong && !pending;

  const cancel = () => {
    setValue(title);
    setError(null);
    setEditing(false);
  };

  const save = () =>
    start(async () => {
      setError(null);
      if (trimmed === title) {
        setEditing(false);
        return;
      }
      const r = await renameThemeAction(themeId, trimmed);
      if (!r.ok) {
        setError(r.error ?? "Could not rename.");
        return;
      }
      setNote(r.message ?? null);
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
        <button
          type="button"
          onClick={() => {
            setValue(title);
            setNote(null);
            setEditing(true);
          }}
          aria-label="Rename theme"
          title="Rename theme"
          className="rounded-[var(--radius-btn)] p-1.5 text-muted transition hover:bg-hover hover:text-fg"
        >
          <Pencil size={15} />
        </button>
        {note && <span className="text-[12px] font-medium text-emerald">✓ {note}</span>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) save();
      }}
      className="flex flex-col gap-1"
    >
      <div className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={value}
        disabled={pending}
        maxLength={MAX + 20}
        aria-label="Theme name"
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
        className="min-w-[280px] rounded-[var(--radius-btn)] border border-indigo bg-surface px-2.5 py-1 text-[22px] font-bold tracking-tight"
      />
      <button
        type="submit"
        disabled={!canSave}
        className="rounded-[var(--radius-btn)] bg-indigo px-3 py-1.5 text-[12.5px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="rounded-[var(--radius-btn)] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-hover"
      >
        Cancel
      </button>
      </div>
      <span className={`text-[11.5px] ${error || tooLong ? "text-rose" : "text-muted"}`}>
        {error
          ? `⚠ ${error}`
          : tooLong
            ? `Keep it under ${MAX} characters (${trimmed.length}).`
            : !trimmed
              ? "A name is required."
              : "Feedback stays attached, and any roadmap item follows the new name."}
      </span>
    </form>
  );
}
