"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { Notice, NoticeFeed } from "@/lib/notifications";

type Feed = NoticeFeed & { workspaceId: string };
const POLL_MS = 90_000;
const seenKey = (ws: string) => `ih-notif-seen:${ws}`;

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** The bell: what's new in this workspace. Unread is remembered per browser and workspace. */
export function NotificationBell() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const f = (await r.json()) as Feed;
      setFeed(f);
      try {
        setSeen(localStorage.getItem(seenKey(f.workspaceId)));
      } catch {}
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isUnread = (n: Notice) => !n.mine && (!seen || n.at > seen);
  const unread = feed?.notices.filter(isUnread).length ?? 0;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };
  // Mark read when the panel closes, so the highlights stay visible while it's open.
  const markSeen = () => {
    if (!feed) return;
    const now = new Date().toISOString();
    try {
      localStorage.setItem(seenKey(feed.workspaceId), now);
    } catch {}
    setSeen(now);
  };
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) markSeen();
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-hover hover:text-fg"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span
            data-testid="bell-dot"
            className="absolute -right-1 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-[1.5px] px-1 text-[9.5px] font-bold text-white"
            style={{ background: "var(--rose)", borderColor: "var(--surface)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+8px)] w-[380px] overflow-hidden rounded-[12px] border border-border bg-surface shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[13.5px] font-semibold">Notifications</span>
            <span className="text-[11px] text-muted">Last 14 days</span>
          </div>

          {feed && feed.waitingForReview > 0 && (
            <Link
              href="/register?tab=review"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-b border-border px-4 py-2.5 text-[12.5px] font-semibold hover:bg-hover"
              style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}
            >
              <span>
                {feed.waitingForReview} item{feed.waitingForReview === 1 ? "" : "s"} waiting for review
              </span>
              <span>Review →</span>
            </Link>
          )}

          <div className="max-h-[420px] overflow-y-auto">
            {!feed ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted">Loading…</p>
            ) : feed.notices.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted">Nothing new in the last 14 days.</p>
            ) : (
              feed.notices.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  data-testid="notice"
                  data-unread={isUnread(n) ? "true" : "false"}
                  className="flex gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-hover"
                >
                  <span className="text-[15px] leading-5">{n.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[12.5px] leading-5 ${isUnread(n) ? "font-semibold" : ""}`}>{n.title}</span>
                    {n.detail && <span className="block truncate text-[11.5px] text-muted">{n.detail}</span>}
                    <span className="block text-[11px] text-muted">{ago(n.at)}</span>
                  </span>
                  {isUnread(n) && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo" aria-label="new" />}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
