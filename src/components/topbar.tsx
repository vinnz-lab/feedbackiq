"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Moon, Sun } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { NAV } from "@/lib/nav";
import { signOut } from "@/app/login/actions";

function useThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme(
      (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "light",
    );
  }, []);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("fiq-theme", next);
    } catch {}
    setTheme(next);
  };
  return { theme, toggle };
}

export function Topbar({
  user,
  workspaceName = "Workspace",
  showSwitchProfile = false,
}: {
  user?: { name: string; role: string; initials: string };
  workspaceName?: string;
  /** Only with the passwordless test sign-in; real accounts sign out instead. */
  showSwitchProfile?: boolean;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useThemeToggle();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const crumb = pathname.startsWith("/ingest") ? "Ingest feedback" : (current?.label ?? "Dashboard");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-border bg-surface px-6">
      <div className="whitespace-nowrap text-[13px] text-muted">
        {workspaceName} · <b className="font-semibold text-fg">{crumb}</b>
      </div>

      <div className="relative max-w-[400px] flex-1">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          placeholder="Search feedback, themes, sources…"
          className="w-full rounded-lg border border-border bg-bg py-2 pl-8 pr-3 text-[13px] outline-none focus:border-indigo"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={toggle}
          aria-label="Toggle dark mode"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-hover hover:text-fg"
        >
          {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        </button>
        <NotificationBell />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo text-[12px] font-bold text-white"
          >
            {user?.initials ?? "?"}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-[12px] border border-border bg-surface shadow-[var(--shadow-lg)]">
              <div className="border-b border-border px-4 py-3">
                <div className="text-[13px] font-semibold">{user?.name}</div>
                <div className="text-[11.5px] text-muted">{user?.role}</div>
              </div>
              {showSwitchProfile && (
              <Link
                href="/login"
                className="block px-4 py-2.5 text-[13px] hover:bg-hover"
                onClick={() => setMenuOpen(false)}
              >
                Switch profile
              </Link>
              )}
              <form action={signOut}>
                <button
                  type="submit"
                  className="block w-full px-4 py-2.5 text-left text-[13px] text-rose hover:bg-hover"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
