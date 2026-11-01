"use client";

import { BrandIcon } from "@/components/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WorkspaceSwitcher, type SwitcherItem } from "@/components/workspace-switcher";
import {
  LayoutGrid,
  Tag,
  List,
  Kanban,
  BarChart3,
  Settings,
  Plug,
  Sparkles,
  Plus,
  type LucideIcon,
} from "lucide-react";
import {
  NAV,
  APP_NAME,
} from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  LayoutGrid,
  Tag,
  List,
  Kanban,
  BarChart3,
  Settings,
  Plug,
};

export function Sidebar({
  reviewCount = 0,
  currentWorkspaceId = "",
  workspaces = [],
  canCreateWorkspace = false,
  canEdit = true,
  tenantName = "",
  workspaceName = "Workspace",
  workspaceSub = "",
}: {
  reviewCount?: number;
  currentWorkspaceId?: string;
  workspaces?: SwitcherItem[];
  canCreateWorkspace?: boolean;
  canEdit?: boolean;
  tenantName?: string;
  workspaceName?: string;
  workspaceSub?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col gap-1 border-r border-border bg-surface p-3">
      {/* logo */}
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <BrandIcon size={30} />
        <span className="text-[18px] font-extrabold tracking-tight">{APP_NAME}</span>
      </div>
      <div className="pl-12 pb-3 text-[12px] text-muted">{tenantName}</div>

      <WorkspaceSwitcher
        current={{ id: currentWorkspaceId, name: workspaceName, sub: workspaceSub, role: "" }}
        items={workspaces}
        canCreate={canCreateWorkspace}
      />

      {/* nav */}
      <div className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-[var(--indigo-soft)] font-semibold text-indigo"
                  : "text-muted hover:bg-hover hover:text-fg"
              }`}
            >
              {Icon ? <Icon size={16} /> : null}
              <span>{item.label}</span>
              {item.href === "/register" && reviewCount > 0 && (
                <span className="ml-auto rounded-full bg-indigo px-1.5 py-px text-[10.5px] font-bold text-white">
                  {reviewCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* bottom */}
      <div className="mt-auto px-1">
        {canEdit ? (
        <Link
          href="/ingest"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo text-[13.5px] font-semibold text-white transition hover:brightness-110"
        >
          <Plus size={16} /> Ingest Feedback
        </Link>
        ) : (
          <div className="rounded-lg bg-[var(--slate-soft)] px-3 py-2.5 text-center text-[12px] font-semibold text-muted">👁 View only</div>
        )}
        <div className="pt-2.5 text-center text-[10.5px] text-muted">
          Preview build
        </div>
      </div>
    </nav>
  );
}
