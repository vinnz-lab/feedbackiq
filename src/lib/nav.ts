export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide-react icon name
};

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutGrid" },
  { href: "/themes", label: "Themes", icon: "Tag" },
  { href: "/register", label: "Register", icon: "List" },
  { href: "/roadmap", label: "Roadmap", icon: "Kanban" },
  { href: "/trends", label: "Trends", icon: "BarChart3" },
  { href: "/integrations", label: "Integrations", icon: "Plug" },
  { href: "/settings", label: "Settings", icon: "Settings" },
];

export const APP_NAME = "Insight Hub";
