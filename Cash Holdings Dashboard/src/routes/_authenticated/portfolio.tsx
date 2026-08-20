import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { q } from "@/lib/data";
import { Stat, StatusPill } from "@/components/ui-bits";
import { formatCurrency } from "@/lib/domain";
import { ArrowRight } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/portfolio")({
  component: PortfolioPage,
});

function PortfolioPage() {
  const { brandFilter } = useApp();
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: q.tasks });
  const deals = useQuery({ queryKey: ["deals"], queryFn: q.deals });
  const channels = useQuery({ queryKey: ["channels"], queryFn: q.channels });

  const visibleBrands = (brands.data ?? []).filter(
    (b) => brandFilter === "all" || b.id === brandFilter
  );
  const totalBrands = visibleBrands.length;
  const totalProjects = (projects.data ?? []).filter((p) =>
    visibleBrands.some((b) => b.id === p.brand_id)
  ).length;
  const openTasks = (tasks.data ?? []).filter((t) => {
    if (t.status === "completed" || t.status === "archived") return false;
    const proj = (projects.data ?? []).find((p) => p.id === t.project_id);
    return proj && visibleBrands.some((b) => b.id === proj.brand_id);
  }).length;
  const pipeline = (deals.data ?? [])
    .filter(
      (d) =>
        d.stage !== "won" &&
        d.stage !== "lost" &&
        visibleBrands.some((b) => b.id === d.brand_id)
    )
    .reduce((s, d) => s + Number(d.value ?? 0), 0);

  return (
    <div className="space-y-4">
      <header>
        <div className="mono-label !text-[9px]">CONTROL / HOLDINGS</div>
        <h1 className="text-title mt-1">Portfolio</h1>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Brands" value={totalBrands} accent />
        <Stat label="Projects" value={totalProjects} />
        <Stat label="Open Tasks" value={openTasks} />
        <Stat label="Open Pipeline" value={formatCurrency(pipeline)} accent />
      </div>

      {/* Brand health distribution bar */}
      <section className="surface rounded-[10px] px-3 py-2.5">
        <div className="mono-label !text-[9px] mb-1.5">BRAND HEALTH · OPEN TASK LOAD</div>
        <div className="flex h-2 rounded overflow-hidden border border-hairline">
          {visibleBrands.map((b) => {
            const bProjects = (projects.data ?? []).filter((p) => p.brand_id === b.id);
            const bOpen = (tasks.data ?? []).filter(
              (t) =>
                bProjects.some((p) => p.id === t.project_id) &&
                t.status !== "completed" &&
                t.status !== "archived"
            ).length;
            const blocked = (tasks.data ?? []).some(
              (t) =>
                bProjects.some((p) => p.id === t.project_id) && t.status === "blocked"
            );
            const total = (tasks.data ?? []).filter((t) =>
              bProjects.some((p) => p.id === t.project_id) &&
              t.status !== "completed" &&
              t.status !== "archived"
            ).length;
            const w = total === 0 ? 4 : Math.max(8, (bOpen / Math.max(openTasks, 1)) * 100);
            return (
              <div
                key={b.id}
                className={cn(blocked ? "bg-warn" : bOpen > 0 ? "bg-teal" : "bg-muted-foreground/40")}
                style={{ width: `${w}%` }}
                title={`${b.name} · ${bOpen} open`}
              />
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleBrands.map((b) => {
          const bProjects = (projects.data ?? []).filter((p) => p.brand_id === b.id);
          const bTasks = (tasks.data ?? []).filter((t) => bProjects.some((p) => p.id === t.project_id));
          const open = bTasks.filter((t) => t.status !== "completed" && t.status !== "archived").length;
          const bDeals = (deals.data ?? []).filter((d) => d.brand_id === b.id && d.stage !== "won" && d.stage !== "lost");
          const bChannels = (channels.data ?? []).filter((c) => c.brand_id === b.id);
          const bPipe = bDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
          return (
            <Link
              key={b.id}
              to="/brand/$slug"
              params={{ slug: b.slug }}
              className="surface surface-interactive rounded-[12px] p-5 group block lift-hover motion-micro"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold tracking-tight leading-none">{b.name}</div>
                  {b.tagline && (
                    <div className="text-[12.5px] text-muted-foreground mt-1.5">{b.tagline}</div>
                  )}
                </div>
                <StatusPill status={b.status} tone={b.status === "active" ? "teal" : "muted"} />
              </div>
              <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-hairline">
                <Mini label="Projects" value={bProjects.length} />
                <Mini label="Open" value={open} />
                <Mini label="Channels" value={bChannels.length} />
                <Mini label="Pipeline" value={formatCurrency(bPipe)} compact />
              </div>
              <div className="mt-3 flex items-center justify-end mono-label text-teal opacity-0 group-hover:opacity-100 transition-opacity">
                Open detail <ArrowRight className="h-3 w-3 ml-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Mini({ label, value, compact }: { label: string; value: any; compact?: boolean }) {
  return (
    <div>
      <div className="mono-label !text-[9px]">{label}</div>
      <div className={`mt-1 tabular-nums font-medium ${compact ? "text-[13px]" : "text-[16px]"}`}>{value}</div>
    </div>
  );
}
