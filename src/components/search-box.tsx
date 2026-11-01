"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { SearchHit, SearchResults } from "@/lib/search";

const MIN = 2;
const GROUPS: { key: "themes" | "feedback" | "roadmap" | "sources"; label: string; icon: string }[] = [
  { key: "themes", label: "Themes", icon: "🏷️" },
  { key: "feedback", label: "Feedback", icon: "💬" },
  { key: "roadmap", label: "Roadmap", icon: "🗺️" },
  { key: "sources", label: "Sources", icon: "📄" },
];

/** Bold the matching part, so it's obvious why something came up. */
function Mark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-[var(--amber-soft)] px-0.5 font-semibold text-fg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** The search box in the top bar: instant results from the current workspace. */
export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const latest = useRef(0);

  const term = q.replace(/\s+/g, " ").trim();
  const seeAll = `/register?q=${encodeURIComponent(term)}`;

  // Debounced fetch; only the newest answer is shown.
  useEffect(() => {
    if (term.length < MIN) {
      setRes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++latest.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = (await r.json()) as SearchResults;
        if (id === latest.current) {
          setRes(r.ok ? j : null);
          setActive(0);
        }
      } catch {
        /* offline */
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [term]);

  // Ctrl/Cmd+K or "/" jumps to the box from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    const onClick = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const flat = useMemo(() => {
    const list: { hit: SearchHit; group: string }[] = [];
    if (res) for (const g of GROUPS) for (const hit of res[g.key]) list.push({ hit, group: g.key });
    return list;
  }, [res]);
  const total = res ? res.themes.length + res.feedbackTotal + res.roadmap.length + res.sources.length : 0;

  const go = (href: string) => {
    setOpen(false);
    input.current?.blur();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (q) setQ("");
      else input.current?.blur();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, flat.length)); // the last slot is "See all"
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && term.length >= MIN) {
      e.preventDefault();
      go(active < flat.length && flat[active] ? flat[active].hit.href : seeAll);
    }
  };

  let idx = -1;
  const show = open && term.length >= MIN;

  return (
    <div className="relative max-w-[440px] flex-1" ref={wrap}>
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search feedback, themes, sources…"
        aria-label="Search"
        role="combobox"
        aria-expanded={show}
        aria-controls="search-results"
        maxLength={100}
        className="w-full rounded-lg border border-border bg-bg py-2 pl-8 pr-14 text-[13px] outline-none focus:border-indigo"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 font-mono text-[10.5px] text-muted">
        Ctrl K
      </kbd>

      {show && (
        <div
          id="search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto rounded-[12px] border border-border bg-surface shadow-[var(--shadow-lg)]"
        >
          {!res ? (
            <p className="px-4 py-4 text-[12.5px] text-muted">{loading ? "Searching…" : "Couldn't search just now."}</p>
          ) : total === 0 ? (
            <p className="px-4 py-4 text-[12.5px] text-muted">
              Nothing matches <b className="text-fg">“{res.query}”</b> in this workspace.
            </p>
          ) : (
            <>
              {GROUPS.map((g) =>
                res[g.key].length ? (
                  <div key={g.key} className="border-b border-border py-1.5 last:border-b-0">
                    <div className="px-4 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-wide text-muted">
                      {g.label}
                      {g.key === "feedback" && res.feedbackTotal > res.feedback.length && ` · ${res.feedbackTotal}`}
                    </div>
                    {res[g.key].map((h) => {
                      idx++;
                      const me = idx;
                      return (
                        <button
                          key={h.id}
                          type="button"
                          role="option"
                          aria-selected={active === me}
                          data-testid="search-hit"
                          onMouseMove={() => active !== me && setActive(me)}
                          onClick={() => go(h.href)}
                          className={`flex w-full gap-2.5 px-4 py-1.5 text-left ${active === me ? "bg-hover" : ""}`}
                        >
                          <span className="text-[13px] leading-5">{g.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] leading-5">
                              <Mark text={h.title} q={res.query} />
                            </span>
                            {h.detail && (
                              <span className="block truncate text-[11.5px] text-muted">
                                <Mark text={h.detail} q={res.query} />
                              </span>
                            )}
                          </span>
                          {h.badge && (
                            <span className="self-center whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--amber-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-amber">
                              {h.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null,
              )}
              <button
                type="button"
                role="option"
                aria-selected={active === flat.length}
                onMouseMove={() => active !== flat.length && setActive(flat.length)}
                onClick={() => go(seeAll)}
                className={`block w-full px-4 py-2.5 text-left text-[12.5px] font-semibold text-indigo ${active === flat.length ? "bg-hover" : ""}`}
              >
                See all feedback matching “{res.query}” in Register →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
