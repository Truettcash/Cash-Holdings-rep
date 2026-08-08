import { Link, useRouterState } from "@tanstack/react-router";
import { Gauge, ListChecks, Users, LineChart, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile section anchors — one per navigation group, mirroring the rail's
 * hierarchy. Presentation only; every destination is an existing route.
 */
const ITEMS: { to: string; label: string; icon: any; exact?: boolean }[] = [
  { to: "/", label: "Overview", icon: Gauge, exact: true },
  { to: "/projects", label: "Operate", icon: ListChecks },
  { to: "/crm", label: "Pipeline", icon: Users },
  { to: "/analytics", label: "Insight", icon: LineChart },
  { to: "/settings", label: "System", icon: SettingsIcon },
];

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 chrome-blur border-t border-edge safe-bottom"
      aria-label="Sections"
    >
      <div className="grid grid-cols-5 pt-1.5">
        {ITEMS.map((item) => {
          const active = item.exact
            ? path === item.to
            : path === item.to || path.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-1 motion-micro",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", active && "text-teal")} />
              <span className="text-[9.5px] tracking-[0.06em]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
