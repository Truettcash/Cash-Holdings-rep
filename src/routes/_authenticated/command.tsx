import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { q } from "@/lib/data";
import { buildQueue } from "@/lib/queue";
import { PriorityQueue } from "@/components/priority-queue";
import { formatCurrency, formatDate, relativeTime, titleCase } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-context";
import { Surface, Kpi, KpiBand, CountUp, SkeletonRows, EmptyState } from "@/components/ui-bits";
import { Sparkline } from "@/components/charts";
import { engagementsQuery, scheduledEngagementsQuery } from "@/lib/engagements/queries";
import { useAnalyticsSurface } from "@/lib/analytics/surfaces";
import { useAnalyticsScope } from "@/lib/analytics/scope";
import { SourceBadge } from "@/components/analytics/source-badge";

export const Route = createFileRoute("/_authenticated/command")({
  component: HomePage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function HomePage() {
  const navigate = useNavigate();
  const { brandFilter } = useApp();
  const scope = useAnalyticsScope();
  // Command Center reads its headline numbers, feed and alert counts from the
  // modular RPCs; the raw-table aggregation below only runs where an RPC has
  // not cut over.
  const summaryRpc = useAnalyticsSurface("dashboard-summary", scope);
  const activityRpc = useAnalyticsSurface("dashboard-activity", scope);
  const notificationsRpc = useAnalyticsSurface("dashboard-notifications", scope);
  const summary = summaryRpc.live ? summaryRpc.model : null;
  const liveActivity = activityRpc.live ? activityRpc.model : null;

  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const projectsAll = useQuery({ queryKey: ["projects"], queryFn: q.projects });
  const tasksAll = useQuery({ queryKey: ["tasks"], queryFn: q.tasks });
  const dealsAll = useQuery({ queryKey: ["deals"], queryFn: q.deals });
  const activities = useQuery({
    queryKey: ["activities", 12],
    queryFn: () => q.activities(12),
    enabled: liveActivity === null,
  });
  const channelsAll = useQuery({ queryKey: ["channels"], queryFn: q.channels });
  const metricDefs = useQuery({ queryKey: ["metricDefs"], queryFn: q.metricDefs });
  const engagements = useQuery(engagementsQuery({}));
  const scheduled = useQuery(scheduledEngagementsQuery({}));

  const loading =
    brands.isLoading || projectsAll.isLoading || tasksAll.isLoading || dealsAll.isLoading;

  // Scope by global brand filter
  const visibleBrands = (brands.data ?? []).filter(
    (b) => brandFilter === "all" || b.id === brandFilter
  );
  const projects = {
    ...projectsAll,
    data: (projectsAll.data ?? []).filter(
      (p) => brandFilter === "all" || p.brand_id === brandFilter
    ),
  };
  const channels = {
    ...channelsAll,
    data: (channelsAll.data ?? []).filter(
      (c) => brandFilter === "all" || c.brand_id === brandFilter
    ),
  };
  const tasks = {
    ...tasksAll,
    data: (tasksAll.data ?? []).filter((t) =>
      (projects.data ?? []).some((p) => p.id === t.project_id)
    ),
  };
  const deals = {
    ...dealsAll,
    data: (dealsAll.data ?? []).filter(
      (d) => brandFilter === "all" || d.brand_id === brandFilter
    ),
  };

  const channelIds = (channels.data ?? []).map((c) => c.id);
  const obs = useQuery({
    queryKey: ["obs", channelIds.slice().sort().join(",")],
    queryFn: () => q.observationsForChannels(channelIds),
    enabled: channelIds.length > 0,
  });

  const queue = useMemo(
    () => buildQueue(tasks.data ?? [], projects.data ?? [], visibleBrands, deals.data ?? []),
    [tasks.data, projects.data, visibleBrands, deals.data]
  );

  // Operating Load
  const inProgressTasks = (tasks.data ?? []).filter((t) => t.status === "in_progress");
  const blockedTasks = (tasks.data ?? []).filter((t) => t.status === "blocked");
  const overdueTasks = (tasks.data ?? []).filter(
    (t) =>
      t.due_date &&
      new Date(t.due_date).getTime() < Date.now() &&
      t.status !== "completed" &&
      t.status !== "archived"
  );
  const criticalTasks = (tasks.data ?? []).filter(
    (t) => t.priority === "critical" && t.status !== "completed" && t.status !== "archived"
  );
  const activeWork = (tasks.data ?? []).filter(
    (t) => t.status !== "completed" && t.status !== "archived"
  );

  // Pipeline
  const openDeals = (deals.data ?? []).filter((d) => d.stage !== "won" && d.stage !== "lost");
  const openPipeline = openDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
  const dealsNeedingAction = [...openDeals.filter((d) => d.next_action_due)].sort(
    (a, b) => +new Date(a.next_action_due!) - +new Date(b.next_action_due!)
  );

  // Engagements
  const engagementRows = engagements.data ?? [];
  const newEngagements = engagementRows.filter((e) => {
    const created = new Date(e.created_at).getTime();
    return Date.now() - created < 7 * 24 * 60 * 60 * 1000;
  });
  const scheduledCount = (scheduled.data ?? []).length;

  const criticalExceptions = blockedTasks.length + criticalTasks.length + overdueTasks.length;

  // Brand rows with movement sparkline
  const channelById = new Map((channels.data ?? []).map((c) => [c.id, c]));
  const defById = new Map((metricDefs.data ?? []).map((d) => [d.id, d]));
  const brandRows = visibleBrands.map((b) => {
    const bProjects = (projects.data ?? []).filter((p) => p.brand_id === b.id);
    const bActive = bProjects.find((p) => p.status === "active") ?? bProjects[0] ?? null;
    const bTaskList = (tasks.data ?? []).filter((t) =>
      bProjects.some((p) => p.id === t.project_id)
    );
    const bOpen = bTaskList.filter((t) => t.status !== "completed" && t.status !== "archived");
    const bTop = [...bOpen].sort((a, b) => {
      const r: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (r[a.priority] ?? 9) - (r[b.priority] ?? 9);
    });
    const bDeals = (deals.data ?? []).filter(
      (d) => d.brand_id === b.id && d.stage !== "won" && d.stage !== "lost"
    );
    const bPipe = bDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
    const bChannels = (channels.data ?? []).filter((c) => c.brand_id === b.id);
    const bChannelIds = new Set(bChannels.map((c) => c.id));
    const bObs = (obs.data ?? [])
      .filter((o) => bChannelIds.has(o.channel_id))
      .sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    const bSpark = bObs.slice(-8).map((o) => Number(o.value));
    const bSignal = bObs[bObs.length - 1];
    const blocked = bOpen.some((t) => t.status === "blocked");
    const health = blocked ? "warn" : bOpen.length === 0 ? "muted" : "ok";
    return { b, bActive, bOpen, bTop, bPipe, bSignal, bSpark, health };
  });

  const [openBrand, setOpenBrand] = useState<string | null>(null);

  // Movement rail
  type MoveEvent = { ts: string; kind: string; label: string; sub?: string };
  const movementEvents = useMemo(() => {
    const events: MoveEvent[] = [];
    const brandName = (id: string | null | undefined) =>
      (brands.data ?? []).find((b) => b.id === id)?.name ?? undefined;
    for (const a of activities.data ?? []) {
      events.push({
        ts: a.activity_at,
        kind: titleCase(a.activity_type).toUpperCase(),
        label: a.subject,
        sub: brandName(a.brand_id),
      });
    }
    for (const o of (obs.data ?? []).slice(0, 20)) {
      const def = defById.get(o.metric_definition_id);
      const ch = channelById.get(o.channel_id);
      events.push({
        ts: o.observed_at,
        kind: "OBSERVATION",
        label: `${def?.name ?? "Metric"} · ${Number(o.value).toLocaleString()}`,
        sub: ch ? brandName((channels.data ?? []).find((c) => c.id === ch.id)?.brand_id) : undefined,
      });
    }
    events.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
    return events.slice(0, 8);
  }, [activities.data, obs.data, brands.data, channels.data, defById, channelById]);

  // Exceptions
  const exceptionItems = useMemo(() => {
    type Ex = { id: string; title: string; tone: "danger" | "warn"; tag: string; sub?: string };
    const list: Ex[] = [];
    for (const t of blockedTasks) {
      list.push({ id: `b:${t.id}`, title: t.title, tone: "danger", tag: "BLOCKED", sub: t.blocker_reason ?? undefined });
    }
    for (const t of overdueTasks) {
      if (blockedTasks.find((b) => b.id === t.id)) continue;
      list.push({ id: `o:${t.id}`, title: t.title, tone: "warn", tag: "OVERDUE", sub: t.due_date ? formatDate(t.due_date) : undefined });
    }
    for (const t of criticalTasks) {
      if (list.find((x) => x.id.endsWith(t.id))) continue;
      list.push({ id: `c:${t.id}`, title: t.title, tone: "danger", tag: "CRITICAL" });
    }
    return list;
  }, [blockedTasks, overdueTasks, criticalTasks]);

  // Portfolio health summary
  const healthyBrandCount = brandRows.filter((r) => r.health === "ok").length;
  const warnBrandCount = brandRows.filter((r) => r.health === "warn").length;
  const portfolioNote =
    warnBrandCount === 0
      ? `All ${brandRows.length || 0} brands are tracking clean — no blockers in scope.`
      : `${warnBrandCount} of ${brandRows.length} brands have active blockers to clear.`;

  const prioritySummary =
    criticalExceptions === 0
      ? "No blocked, critical, or overdue items — the queue is clear."
      : `${criticalExceptions} item${criticalExceptions === 1 ? "" : "s"} need attention: ${blockedTasks.length} blocked, ${criticalTasks.length} critical, ${overdueTasks.length} overdue.`;

  return (
    <div className="flex flex-col gap-6 ch-page-in">
      {/* BRIEFING HEADER */}
      <div className="space-y-1.5">
        <h1 className="text-display">{greeting()}</h1>
        <p className="text-body text-foreground/85">{prioritySummary}</p>
        <p className="text-supporting flex items-center gap-2">
          <span>{portfolioNote}</span>
          <SourceBadge source={summaryRpc.source} malformed={summaryRpc.malformed} />
          <SourceBadge source={activityRpc.source} malformed={activityRpc.malformed} />
          <SourceBadge source={notificationsRpc.source} malformed={notificationsRpc.malformed} />
        </p>
      </div>

      {/* EXECUTIVE KPI ROW */}
      <KpiBand className="shrink-0 ch-stagger">
        <Kpi
          label="Revenue (Pipeline)"
          value={
            summary
              ? summary.pipelineValue === null
                ? "—"
                : <CountUp value={summary.pipelineValue} format={(n) => formatCurrency(n)} />
              : loading
                ? "—"
                : <CountUp value={openPipeline} format={(n) => formatCurrency(n)} />
          }
          hint={`${summary ? (summary.openDeals ?? "—") : openDeals.length} open deals in play`}
          tone="teal"
        />
        <Kpi
          label="Projects"
          value={
            summary
              ? summary.projects === null
                ? "—"
                : <CountUp value={summary.projects} />
              : loading
                ? "—"
                : <CountUp value={activeWork.length} />
          }
          hint={
            summary
              ? `${summary.openTasks ?? "—"} open tasks`
              : `${inProgressTasks.length} tasks in progress`
          }
          onClick={() => navigate({ to: "/projects" })}
        />
        <Kpi
          label="Deals"
          value={
            summary
              ? summary.openDeals === null
                ? "—"
                : <CountUp value={summary.openDeals} />
              : loading
                ? "—"
                : <CountUp value={openDeals.length} />
          }
          hint={`${dealsNeedingAction.length} need next action`}
          onClick={() => navigate({ to: "/crm" })}
        />
        <Kpi
          label="Tasks"
          value={
            summary
              ? summary.openTasks === null
                ? "—"
                : <CountUp value={summary.openTasks} />
              : loading
                ? "—"
                : <CountUp value={activeWork.length} />
          }
          tone={criticalExceptions > 0 ? "danger" : "success"}
          hint={
            summary
              ? `${summary.overdueTasks ?? "—"} overdue`
              : `${blockedTasks.length} blocked · ${overdueTasks.length} overdue`
          }
        />
        <Kpi
          label="Pipeline Activity"
          value={
            summary
              ? summary.newEngagements === null && summary.engagements === null
                ? "—"
                : <CountUp value={summary.newEngagements ?? summary.engagements ?? 0} />
              : engagements.isLoading
                ? "—"
                : <CountUp value={newEngagements.length} />
          }
          hint={
            summary
              ? `${summary.bookings ?? "—"} bookings · ${
                  summary.bookingConversion === null
                    ? "—"
                    : `${summary.bookingConversion.toFixed(1)}% conversion`
                }`
              : `${scheduled.isLoading ? "—" : scheduledCount} scheduled reviews`
          }
          onClick={() => navigate({ to: "/engagements" })}
        />
      </KpiBand>

      {/* PRIORITY QUEUE + PORTFOLIO HEALTH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 ch-fade-in">
          <PriorityQueue items={queue} />
        </div>

        <Surface
          className="lg:col-span-5 ch-fade-in"
          title="Portfolio Health"
          subtitle={`${brandRows.length} brands`}
          flush
        >
          {loading ? (
            <div className="p-5">
              <SkeletonRows rows={5} />
            </div>
          ) : brandRows.length === 0 ? (
            <EmptyState title="No brands in scope" hint="Adjust the brand filter." />
          ) : (
            <ul className="divide-y divide-edge/60">
              {brandRows.map(({ b, bActive, bOpen, bTop, bPipe, bSpark, health }) => {
                const open = openBrand === b.id;
                return (
                  <li key={b.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => setOpenBrand((cur) => (cur === b.id ? null : b.id))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenBrand((cur) => (cur === b.id ? null : b.id));
                        }
                      }}
                      className={cn(
                        "motion-micro flex items-center gap-2.5 px-5 py-3 cursor-pointer surface-interactive focus:outline-none",
                        open && "surface-selected"
                      )}
                    >
                      <ChevronRight
                        className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", open && "rotate-90")}
                      />
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          health === "warn" ? "bg-warn" : health === "muted" ? "bg-muted-foreground/40" : "bg-teal"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{b.name}</div>
                        <div className="mono-label !text-[8.5px] mt-0.5 truncate">
                          {bOpen.length} OPEN · {bActive?.name ?? "no active project"}
                        </div>
                      </div>
                      <div className="hidden sm:block tabular text-[11px] text-muted-foreground shrink-0">
                        {bPipe ? formatCurrency(bPipe) : "—"}
                      </div>
                      <Sparkline values={bSpark} tone={health === "warn" ? "muted" : "teal"} />
                    </div>
                    <div className={cn(open ? "ch-expand" : "ch-collapse")} aria-hidden={!open}>
                      <div className="min-h-0 overflow-hidden">
                        <div className="px-5 pb-4 pt-0.5 bg-[var(--surface-2)]/40 space-y-2">
                          <div className="mono-label !text-[8.5px]">TOP TASKS</div>
                          {bTop.length === 0 ? (
                            <div className="text-[11.5px] text-muted-foreground">No open tasks.</div>
                          ) : (
                            <ul className="space-y-1">
                              {bTop.slice(0, 3).map((t) => (
                                <li key={t.id} className="text-[12px] truncate">
                                  · {t.title}
                                </li>
                              ))}
                            </ul>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({ to: "/brand/$slug", params: { slug: b.slug } });
                            }}
                            className="mono-label !text-[8.5px] text-teal hover:opacity-80 inline-flex items-center gap-1"
                          >
                            OPEN BRAND <ArrowUpRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      </div>

      {/* RECENT ACTIVITY + UPCOMING WORK */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Surface
          className="lg:col-span-6 ch-fade-in"
          title="Recent Activity"
          subtitle={
            liveActivity
              ? `${liveActivity.total ?? liveActivity.items.length} signals in window`
              : "Latest signals"
          }
          flush
        >
          <div className="p-5">
            {liveActivity ? (
              liveActivity.items.length === 0 ? (
                <EmptyState title="No recorded activity" />
              ) : (
                <ul className="space-y-3">
                  {liveActivity.items.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-teal/70 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] truncate">{e.label}</div>
                        <div className="mono-label !text-[8.5px] mt-0.5 flex items-center gap-1.5 truncate">
                          {e.kind && <span className="text-teal">{e.kind.toUpperCase()}</span>}
                          {e.brandKey && <span className="truncate">· {e.brandKey}</span>}
                          {e.at && (
                            <span className="opacity-70 shrink-0">· {relativeTime(e.at)}</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : activityRpc.isLoading || loading ? (
              <SkeletonRows rows={5} />
            ) : movementEvents.length === 0 ? (
              <EmptyState title="No recorded activity" />
            ) : (
              <ul className="space-y-3">
                {movementEvents.map((e, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-teal/70 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] truncate">{e.label}</div>
                      <div className="mono-label !text-[8.5px] mt-0.5 flex items-center gap-1.5 truncate">
                        <span className="text-teal">{e.kind}</span>
                        {e.sub && <span className="truncate">· {e.sub}</span>}
                        <span className="opacity-70 shrink-0">· {relativeTime(e.ts)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>

        <Surface
          className="lg:col-span-6 ch-fade-in"
          title="Upcoming Work"
          subtitle={`${dealsNeedingAction.length} deals · ${exceptionItems.length} exceptions`}
          flush
        >
          <div className="p-5 space-y-5">
            <div>
              <div className="mono-label !text-[8.5px] mb-2">COMMERCIAL NEXT ACTIONS</div>
              {loading ? (
                <SkeletonRows rows={3} />
              ) : dealsNeedingAction.length === 0 ? (
                <div className="text-[12px] text-muted-foreground">No commercial actions queued.</div>
              ) : (
                <ul className="divide-y divide-edge/60 -mx-1">
                  {dealsNeedingAction.slice(0, 4).map((d) => (
                    <li
                      key={d.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate({ to: "/crm" })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate({ to: "/crm" });
                      }}
                      className="motion-micro flex items-center justify-between gap-2 px-1 py-2 cursor-pointer surface-interactive rounded-md focus:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] truncate">{d.next_action ?? d.name}</div>
                        <div className="mono-label !text-[8.5px] mt-0.5 truncate">{d.name}</div>
                      </div>
                      <div className="tabular text-[11px] text-teal shrink-0">
                        {formatDate(d.next_action_due)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="mono-label !text-[8.5px] mb-2">TASK EXCEPTIONS</div>
              {loading ? (
                <SkeletonRows rows={3} />
              ) : exceptionItems.length === 0 ? (
                <div className="text-[12px] text-muted-foreground">Nothing blocked, overdue, or critical.</div>
              ) : (
                <ul className="divide-y divide-edge/60 -mx-1">
                  {exceptionItems.slice(0, 5).map((x) => (
                    <li
                      key={x.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate({ to: "/projects" })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate({ to: "/projects" });
                      }}
                      className="motion-micro flex items-center justify-between gap-2 px-1 py-2 cursor-pointer surface-interactive rounded-md focus:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] truncate">{x.title}</div>
                        {x.sub && <div className="mono-label !text-[8.5px] mt-0.5 truncate">{x.sub}</div>}
                      </div>
                      <span
                        className={cn(
                          "mono-label !text-[8.5px] px-1.5 py-0.5 rounded border shrink-0",
                          x.tone === "danger" ? "border-danger/40 text-danger" : "border-warn/40 text-warn"
                        )}
                      >
                        {x.tag}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}
