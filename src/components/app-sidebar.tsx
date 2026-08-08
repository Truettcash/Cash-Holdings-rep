import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sunrise,
  Gauge,
  Layers,
  ListChecks,
  CheckSquare,
  Inbox,
  LineChart,
  Activity,
  Plug,
  Users,
  Settings as SettingsIcon,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";
import { cashHoldingsSupabase as supabase } from "@/integrations/cash-holdings/client";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useApp } from "@/lib/app-context";

type Brand = { id: string; name: string; slug: string };

type NavItem = {
  to: string;
  hash?: string;
  label: string;
  icon: any;
  exact?: boolean;
};

/**
 * Grouped by workflow: Overview · Operate · Pipeline · Intelligence · System.
 * Information architecture only — every route path is unchanged.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Morning Brief", icon: Sunrise, exact: true },
      { to: "/command", label: "Command Center", icon: Gauge },
    ],
  },
  {
    label: "Operate",
    items: [
      { to: "/portfolio", label: "Brands", icon: Layers },
      { to: "/projects", label: "Projects", icon: ListChecks },
      { to: "/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { to: "/crm", label: "CRM", icon: Users },
      { to: "/engagements", label: "Engagements", icon: Inbox },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/analytics", label: "Analytics", icon: LineChart },
      { to: "/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/data-health", label: "Data Health", icon: Activity },
      {
        to: "/admin/imports/website-outbound",
        label: "Outbound Import",
        icon: Inbox,
      },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

const RAIL_KEY = "ch.rail.collapsed";

export function AppSidebar({
  brands: _brands,
  userEmail,
}: {
  brands: Brand[];
  userEmail?: string | null;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const { mobileNavOpen, setMobileNavOpen } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(RAIL_KEY) === "1");
    } catch {
      /* no-op */
    }
  }, []);

  function toggleRail() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      } catch {
        /* no-op */
      }
      return next;
    });
  }

  const isActive = (item: NavItem) => {
    const onRoute = item.exact
      ? path === item.to
      : path === item.to || path.startsWith(item.to + "/");
    if (!onRoute) return false;
    const siblings = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.to === item.to);
    if (siblings.length < 2) return true;
    const current = (hash ?? "").replace(/^#/, "");
    if (item.hash) return current === item.hash;
    // The hash-less entry owns the route when no sibling hash matches.
    return !siblings.some((s) => s.hash && s.hash === current);
  };

  // Auto-close mobile nav on route change
  useEffect(() => {
    if (mobileNavOpen) setMobileNavOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, hash]);

  const body = (mini: boolean) => (
    <>
      <div
        className={cn(
          "flex items-center gap-2.5 edge-b h-11 shrink-0",
          mini ? "justify-center px-0" : "px-3.5",
        )}
      >
        <div className="relative h-[22px] w-[22px] grid place-items-center border border-edge-strong rounded-[3px] bg-canvas shrink-0">
          <div className="absolute left-[3px] top-[3px] h-[5px] w-[5px] bg-teal" />
          <div className="absolute right-[3px] bottom-[3px] h-[4px] w-[4px] bg-foreground/60" />
        </div>
        {!mini && (
          <>
            <div className="font-sans text-[10.5px] tracking-[0.06em] leading-none">
              CASH HOLDINGS
            </div>
            <button
              onClick={toggleRail}
              className="ml-auto hidden md:grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] motion-micro"
              aria-label="Collapse navigation"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="md:hidden ml-auto h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {mini && (
        <button
          onClick={toggleRail}
          className="mx-auto mt-2 h-6 w-6 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] motion-micro"
          aria-label="Expand navigation"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
      )}

      <nav className={cn("flex-1 overflow-y-auto py-4", mini ? "px-2" : "px-3")}>
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mb-6 last:mb-2">
            {!mini && (
              <div className="mono-label !text-[8px] !text-muted-foreground/55 px-2.5 pb-2">
                {g.label}
              </div>
            )}
            {mini && <div className="mx-2.5 mb-3 h-px bg-edge" />}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    hash={item.hash}
                    title={mini ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center rounded-[7px] motion-micro",
                      mini ? "h-9 justify-center" : "h-8 gap-2.5 px-2.5",
                      active
                        ? "text-foreground bg-[var(--surface-2)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-[var(--surface-2)]/60",
                    )}
                  >
                    {active && (
                      <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-teal" />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active
                          ? "text-teal"
                          : "text-muted-foreground/80 group-hover:text-foreground",
                      )}
                    />
                    {!mini && <span className="text-[13px] truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn("py-3.5 shrink-0", mini ? "px-2" : "px-3.5")}>
        {!mini ? (
          <>
            <ThemeToggle className="mb-2.5" />
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="mono-label !text-[8.5px]">LIVE</span>
            </div>
            {userEmail && (
              <div className="mt-1 text-[10px] font-sans text-muted-foreground truncate">
                {userEmail}
              </div>
            )}
            <button
              onClick={() => supabase.auth.signOut()}
              className="mt-1.5 w-full flex items-center gap-2 px-1 h-6 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] motion-micro"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </>
        ) : (
          <button
            onClick={() => supabase.auth.signOut()}
            title="Sign out"
            className="w-full h-8 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] motion-micro"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop / tablet rail */}
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col h-screen sticky top-0 edge-r chrome-blur",
          "transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          collapsed ? "w-[58px]" : "w-[216px]",
        )}
      >
        {body(collapsed)}
      </aside>

      {/* Mobile slide-in drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <aside className="relative w-[240px] max-w-[82vw] h-full flex flex-col edge-r chrome-blur ch-drawer-in">
            {body(false)}
          </aside>
        </div>
      )}
    </>
  );
}
