"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { sendAppFeedback, type AppFeedbackState } from "@/app/(app)/app-feedback-actions";
import { FEEDBACK_KINDS, MAX_FEEDBACK_CHARS } from "@/lib/app-feedback";

/** "Send feedback": anyone using the app can tell the Insight Hub team what they think. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("Idea");
  const [text, setText] = useState("");
  const [state, send, sending] = useActionState<AppFeedbackState, FormData>(sendAppFeedback, {});
  const pathname = usePathname();
  const box = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.ok) setText("");
  }, [state]);
  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-[34px] items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] font-semibold text-muted hover:bg-hover hover:text-fg"
      >
        <MessageSquare size={14} /> Feedback
      </button>
      {open && (
        <div role="dialog" aria-label="Send feedback" className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] rounded-[12px] border border-border bg-surface p-4 shadow-[var(--shadow-lg)]">
          <div className="text-[14px] font-semibold">Tell us what you think</div>
          <p className="mt-0.5 text-[12px] text-muted">Ideas, problems, anything confusing — it goes straight to the Insight Hub team.</p>
          {state.ok ? (
            <div className="mt-3 rounded-[10px] p-3 text-[12.5px] font-medium" style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}>
              ✓ {state.ok}
              <button type="button" onClick={() => setOpen(false)} className="mt-2 block text-[12px] font-semibold underline">
                Close
              </button>
            </div>
          ) : (
            <form action={send} className="mt-3 flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of feedback">
                {FEEDBACK_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={`rounded-[var(--radius-pill)] border px-2.5 py-1 text-[12px] font-semibold ${kind === k ? "border-indigo bg-[var(--indigo-soft)] text-indigo" : "border-border text-muted hover:bg-hover"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="page" value={pathname} />
              <textarea
                ref={box}
                name="feedback"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                maxLength={MAX_FEEDBACK_CHARS}
                aria-label="Your feedback"
                placeholder="What's working, what isn't, what you'd love to see…"
                className="w-full resize-y rounded-[var(--radius-btn)] border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-indigo"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={sending || text.trim().length < 3}
                  className="rounded-[var(--radius-btn)] bg-indigo px-3.5 py-1.5 text-[12.5px] font-semibold text-white enabled:hover:brightness-110 disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
                <span className="text-[11px] text-muted">Your name, email and workspace are included so we can reply.</span>
              </div>
              {state.error && <p className="text-[12px] text-rose">⚠ {state.error}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
