import { Link, useRouterState } from "@tanstack/react-router";
import { Gauge, ListChecks, Brain, Sparkle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJarvis } from "@/lib/jarvis/context";

/**
 * Mobile operating shell: four primary destinations. Everything else reaches
 * the operator through sheets, drawers and contextual menus.
 */
const ITEMS: { to: string; label: string; icon: any; exact?: boolean }[] = [
  { to: "/", label: "Home", icon: Gauge, exact: true },
  { to: "/projects", label: "Work", icon: ListChecks },
  { to: "/intelligence", label: "Intelligence", icon: Brain },
];

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { open: jarvisOpen, setOpen: setJarvisOpen } = useJarvis();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 chrome-blur border-t border-edge safe-bottom"
      aria-label="Sections"
    >
      <div className="grid grid-cols-4 pt-1.5">
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
        <button
          onClick={() => setJarvisOpen(true)}
          aria-label="Open Jarvis"
          className={cn(
            "flex flex-col items-center gap-1 py-1 motion-micro",
            jarvisOpen ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Sparkle className={cn("h-[18px] w-[18px]", jarvisOpen && "text-teal")} />
          <span className="text-[9.5px] tracking-[0.06em]">Jarvis</span>
        </button>
      </div>
    </nav>
  );
}
