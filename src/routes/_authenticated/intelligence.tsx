import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-context";
import { q } from "@/lib/data";
import { useCurrentTrace } from "@/lib/cash-intelligence/trace-session";

export const Route = createFileRoute("/_authenticated/intelligence")({
  component: IntelligenceWorkspace,
});

const TABS = [
  { to: "/intelligence/inputs", label: "Inputs" },
  { to: "/intelligence/findings", label: "Findings" },
  { to: "/intelligence/review", label: "Review" },
  { to: "/intelligence/memory", label: "Memory" },
];

function IntelligenceWorkspace() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { brandFilter } = useApp();
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: q.brands, staleTime: 60_000 });
  const trace = useCurrentTrace();
  const openReviews = trace
    ? trace.patternCandidates.length + trace.constraintCandidates.length
    : 0;
  const scopeLabel =
    brandFilter === "all"
      ? "ALL HOLDINGS"
      : (brands.find((b: any) => b.id === brandFilter)?.name ?? "SCOPED").toUpperCase();
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Link to="/intelligence" className="group">
          <h1 className="text-[19px] font-medium tracking-tight group-hover:text-teal motion-micro">
            Intelligence
          </h1>
        </Link>
        <div className="flex items-center gap-4 mono-label !text-[8.5px] !text-muted-foreground/60">
          <span>SCOPE · {scopeLabel}</span>
          <span>{openReviews} AWAITING REVIEW</span>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap items-center gap-5 edge-b">
        {TABS.map((t) => {
          const active = path.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "motion-micro relative inline-flex h-9 items-center text-[12.5px]",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-teal" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  );
}