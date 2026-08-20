import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/athrty")({
  component: AthrtyWorkspace,
});

const TABS = [
  { to: "/athrty", label: "Overview", exact: true },
  { to: "/athrty/accounts", label: "Accounts" },
  { to: "/athrty/pipeline", label: "Pipeline" },
  { to: "/athrty/next-actions", label: "Next Actions" },
  { to: "/athrty/sync", label: "Sync Status" },
];

function AthrtyWorkspace() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono-label !text-[8.5px] !text-muted-foreground/60">
            OUTBOUND OPERATING SURFACE
          </div>
          <h1 className="mt-1 text-[19px] font-medium tracking-tight">ATHRTY</h1>
        </div>
        <div className="mono-label !text-[8px] !text-muted-foreground/50">
          MICROSOFT 365 · SHAREPOINT · READ-ONLY
        </div>
      </div>

      <nav className="mt-4 flex items-center gap-1 edge-b pb-0">
        {TABS.map((t) => {
          const active = t.exact ? path === t.to : path.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "relative h-8 px-3 inline-flex items-center rounded-t-[7px] text-[12px] motion-micro",
                active
                  ? "text-foreground bg-[var(--surface-2)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {active && (
                <span className="absolute left-2.5 right-2.5 -bottom-px h-[2px] rounded-full bg-teal" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="pt-5">
        <Outlet />
      </div>
    </div>
  );
}