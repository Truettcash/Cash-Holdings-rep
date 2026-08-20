import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { q } from "@/lib/data";
import {
  Panel,
  Stat,
  StatusPill,
  EmptyState,
  dealStageTone,
  priorityTone,
  taskStatusTone,
} from "@/components/ui-bits";
import {
  STAGE_LABEL,
  STATUS_LABEL,
  formatCurrency,
  formatDate,
  formatNumber,
  relativeTime,
  titleCase,
} from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/brand/$slug")({
  component: BrandDetailPage,
});

function BrandDetailPage() {
  const { slug } = Route.useParams();
  const brand = useQuery({ queryKey: ["brand", slug], queryFn: () => q.brandBySlug(slug) });
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: q.tasks });
  const deals = useQuery({ queryKey: ["deals"], queryFn: q.deals });
  const activities = useQuery({ queryKey: ["activities", 30], queryFn: () => q.activities(30) });
  const channels = useQuery({ queryKey: ["channels"], queryFn: q.channels });
  const defs = useQuery({ queryKey: ["metricDefs"], queryFn: q.metricDefs });

  if (brand.isLoading) {
    return <div className="mono-label">Loading…</div>;
  }
  if (!brand.data) {
    return (
      <Panel>
        <EmptyState title="Brand not found" hint={`No brand with slug "${slug}".`} />
      </Panel>
    );
  }
  const b = brand.data;

  const bProjects = (projects.data ?? []).filter((p) => p.brand_id === b.id);
  const bTasks = (tasks.data ?? []).filter((t) =>
    bProjects.some((p) => p.id === t.project_id)
  );
  const openTasks = bTasks.filter((t) => t.status !== "completed" && t.status !== "archived");
  const bDeals = (deals.data ?? []).filter((d) => d.brand_id === b.id);
  const openDeals = bDeals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const pipeline = openDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
  const bActs = (activities.data ?? []).filter((a) => a.brand_id === b.id);
  const bChannels = (channels.data ?? []).filter((c) => c.brand_id === b.id);

  const channelIds = bChannels.map((c) => c.id);
  const obs = useQuery({
    queryKey: ["obs", channelIds.slice().sort().join(",")],
    queryFn: () => q.observationsForChannels(channelIds),
    enabled: channelIds.length > 0,
  });

  const defById = new Map((defs.data ?? []).map((d) => [d.id, d]));
  const channelById = new Map(bChannels.map((c) => [c.id, c]));

  const latest: { channelName: string; metric: string; value: number; observed_at: string }[] = [];
  const seen = new Set<string>();
  for (const o of obs.data ?? []) {
    const k = `${o.channel_id}:${o.metric_definition_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    latest.push({
      channelName: channelById.get(o.channel_id)?.name ?? "—",
      metric: defById.get(o.metric_definition_id)?.name ?? "—",
      value: Number(o.value),
      observed_at: o.observed_at,
    });
  }

  return (
    <div className="space-y-3">
      <header className="flex items-end justify-between">
        <div>
          <div className="mono-label !text-[9px]">CONTROL / BRAND DETAIL</div>
          <h1 className="text-[20px] font-semibold tracking-tight leading-none mt-1">{b.name}</h1>
          {(b.tagline || b.description) && (
            <p className="text-[12.5px] text-muted-foreground mt-1.5 max-w-prose">
              {b.tagline ?? b.description}
            </p>
          )}
        </div>
        <StatusPill status={b.status} tone={b.status === "active" ? "teal" : "muted"} />
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Active Projects" value={bProjects.filter((p) => p.status === "active").length} accent />
        <Stat label="Open Tasks" value={openTasks.length} />
        <Stat label="Open Deals" value={openDeals.length} />
        <Stat label="Open Pipeline" value={formatCurrency(pipeline)} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Channels" subtitle={`${bChannels.length} active surface${bChannels.length === 1 ? "" : "s"}`}>
          {bChannels.length === 0 ? (
            <EmptyState title="No channels recorded" />
          ) : (
            <ul className="-my-2 divide-y divide-hairline">
              {bChannels.map((c) => (
                <li key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px]">{c.name}</div>
                    <div className="mono-label">
                      {c.channel_type}
                      {c.handle && <span> · {c.handle}</span>}
                    </div>
                  </div>
                  <StatusPill status={c.status} tone={c.status === "active" ? "teal" : "muted"} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Current Projects" subtitle={`${bProjects.length} total`}>
          {bProjects.length === 0 ? (
            <EmptyState title="No projects yet" />
          ) : (
            <ul className="-my-2 divide-y divide-hairline">
              {bProjects.slice(0, 8).map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] truncate">{p.name}</div>
                    <div className="mono-label">
                      {STATUS_LABEL[p.status] ?? p.status}
                      {p.due_date && <span> · Due {formatDate(p.due_date)}</span>}
                    </div>
                  </div>
                  <StatusPill status={p.priority} tone={priorityTone(p.priority)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Open Tasks" subtitle={`${openTasks.length} in queue`}>
          {openTasks.length === 0 ? (
            <EmptyState title="No open tasks" />
          ) : (
            <ul className="-my-2 divide-y divide-hairline">
              {openTasks.slice(0, 10).map((t) => {
                const p = bProjects.find((pp) => pp.id === t.project_id);
                return (
                  <li key={t.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] truncate">{t.title}</div>
                      <div className="mono-label">{p?.name ?? "—"} {t.due_date && `· ${formatDate(t.due_date)}`}</div>
                    </div>
                    <StatusPill status={STATUS_LABEL[t.status] ?? t.status} tone={taskStatusTone(t.status)} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Deal Activity" subtitle={`${bDeals.length} deals tracked`}>
          {bDeals.length === 0 ? (
            <EmptyState title="No deals" />
          ) : (
            <ul className="-my-2 divide-y divide-hairline">
              {bDeals.slice(0, 10).map((d) => (
                <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] truncate">{d.name}</div>
                    <div className="mono-label">{formatCurrency(d.value, d.currency ?? "USD")} {d.next_action_due && `· Next ${formatDate(d.next_action_due)}`}</div>
                  </div>
                  <StatusPill status={STAGE_LABEL[d.stage as keyof typeof STAGE_LABEL] ?? d.stage} tone={dealStageTone(d.stage)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Latest Metrics">
          {latest.length === 0 ? (
            <EmptyState title="No metric observations recorded" />
          ) : (
            <ul className="-my-2 divide-y divide-hairline">
              {latest.slice(0, 10).map((m, i) => (
                <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] truncate">{m.channelName}</div>
                    <div className="mono-label">{m.metric}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] tabular-nums text-teal font-medium">{formatNumber(m.value)}</div>
                    <div className="mono-label">{relativeTime(m.observed_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent Activity">
          {bActs.length === 0 ? (
            <EmptyState title="No activity logged" />
          ) : (
            <ul className="space-y-3">
              {bActs.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-teal/70 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-[13px] truncate">{a.subject}</div>
                      <div className="mono-label shrink-0">{relativeTime(a.activity_at)}</div>
                    </div>
                    <div className="mono-label">{titleCase(a.activity_type)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
