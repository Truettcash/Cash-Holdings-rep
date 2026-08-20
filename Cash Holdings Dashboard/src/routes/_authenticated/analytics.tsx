import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { q, type Channel, type MetricDefinition, type MetricObservation } from "@/lib/data";
import { formatDate, formatNumber, formatCurrency, relativeTime } from "@/lib/domain";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";
import { Segmented, Kpi, KpiBand } from "@/components/ui-bits";
import { useAnalyticsSurface } from "@/lib/analytics/surfaces";
import { useAnalyticsScope } from "@/lib/analytics/scope";
import { SourceBadge } from "@/components/analytics/source-badge";
import { engagementsQuery, bookingEventsQuery } from "@/lib/engagements/queries";
import { isQualified, brandLabel } from "@/lib/engagements/domain";
import {
  GraphPanel,
  TrendChart,
  VolumeChart,
  Sparkline,
  RangeControl,
  rangeStart,
  ChartEmpty,
  ChartSkeleton,
  fmtNumber,
  type RangeKey,
  type Point,
} from "@/components/charts";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
  head: () => ({
    meta: [
      { title: "Intelligence · Cash Holdings Console" },
      {
        name: "description",
        content:
          "Executive intelligence for Cash Holdings: engagement demand, qualification quality, discovery bookings, delivery throughput and revenue.",
      },
      { property: "og:title", content: "Intelligence · Cash Holdings Console" },
      {
        property: "og:description",
        content:
          "Executive view of demand, qualification, delivery and revenue across the portfolio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function dayKey(d: string) {
  return (d ?? "").slice(0, 10);
}

/** Daily buckets across the selected range, with optional prior-period series. */
function bucketDaily(
  dated: { date: string; value: number }[],
  range: RangeKey,
  compare: boolean,
  agg: "sum" | "last" = "sum",
): Point[] {
  const start = rangeStart(range) ?? (dated.length ? new Date(dated[0].date) : null) ?? new Date();
  const days: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date();
  endDay.setHours(0, 0, 0, 0);
  while (cursor <= endDay) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  const byDay = new Map<string, number[]>();
  for (const d of dated) {
    const k = dayKey(d.date);
    const arr = byDay.get(k) ?? [];
    arr.push(d.value);
    byDay.set(k, arr);
  }
  const spanMs = endDay.getTime() - new Date(start).setHours(0, 0, 0, 0);
  const reducer = (arr: number[] | undefined) =>
    !arr || arr.length === 0
      ? agg === "sum"
        ? 0
        : null
      : agg === "sum"
        ? arr.reduce((a, b) => a + b, 0)
        : arr[arr.length - 1];

  return days.map((day) => {
    let yPrev: number | null | undefined = undefined;
    if (compare) {
      const priorDate = new Date(new Date(day).getTime() - spanMs - 86400000);
      yPrev = reducer(byDay.get(priorDate.toISOString().slice(0, 10)));
    }
    return { x: day.slice(5), y: reducer(byDay.get(day)), yPrev };
  });
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function AnalyticsPage() {
  const { brandFilter, setBrandFilter } = useApp();
  const scope = useAnalyticsScope();
  // Headline KPIs prefer the modular RPCs; every panel below keeps its existing
  // raw-table computation so charts and channel detail are unchanged.
  const performanceRpc = useAnalyticsSurface("brands-performance", scope);
  const engagementsRpc = useAnalyticsSurface("crm-engagements", scope);
  const qualificationRpc = useAnalyticsSurface("crm-qualification", scope);
  const overviewRpc = useAnalyticsSurface("projects-overview", scope);
  const pipelineRpc = useAnalyticsSurface("crm-pipeline", scope);
  const liveEngagements = engagementsRpc.live ? engagementsRpc.model : null;
  const liveQualification = qualificationRpc.live ? qualificationRpc.model : null;
  const liveOverview = overviewRpc.live ? overviewRpc.model : null;
  const livePipeline = pipelineRpc.live ? pipelineRpc.model : null;

  /* ---- live production reads (external Cash Holdings project) ---- */
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const channels = useQuery({ queryKey: ["channels"], queryFn: q.channels });
  const defs = useQuery({ queryKey: ["metricDefs"], queryFn: q.metricDefs });
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: q.tasks });
  const deals = useQuery({ queryKey: ["deals"], queryFn: q.deals });
  const activities = useQuery({ queryKey: ["activities", 500], queryFn: () => q.activities(500) });
  const engagements = useQuery(engagementsQuery());
  const bookings = useQuery(bookingEventsQuery());

  const channelIds = (channels.data ?? []).map((c) => c.id);
  const obs = useQuery({
    queryKey: ["obs", channelIds.slice().sort().join(",")],
    queryFn: () => q.observationsForChannels(channelIds),
    enabled: channelIds.length > 0,
  });

  const [range, setRange] = useState<RangeKey>("30d");
  const [compare, setCompare] = useState(false);

  const brandOptions = useMemo(
    () => [
      { value: "all", label: "All holdings" },
      ...(brands.data ?? []).map((b) => ({ value: b.id, label: b.name })),
    ],
    [brands.data],
  );

  const tab = brandFilter;
  const scopedBrand = (brands.data ?? []).find((b) => b.id === tab) ?? null;
  const brandIdsInScope =
    tab === "all" ? new Set((brands.data ?? []).map((b) => b.id)) : new Set([tab]);

  const start = rangeStart(range);
  const inRange = (iso: string | null | undefined) => !iso || !start || new Date(iso) >= start;

  const tabChannels = (channels.data ?? []).filter((c) => brandIdsInScope.has(c.brand_id));
  const channelById = new Map((channels.data ?? []).map((c) => [c.id, c]));
  const defById = new Map((defs.data ?? []).map((d) => [d.id, d]));

  const obsInScope = (obs.data ?? []).filter((o) => tabChannels.some((c) => c.id === o.channel_id));
  const obsRanged = obsInScope.filter((o) => inRange(o.observed_at));

  const projectsInScope = (projects.data ?? []).filter((p) => brandIdsInScope.has(p.brand_id));
  const projectIdsInScope = new Set(projectsInScope.map((p) => p.id));
  const tasksInScope = (tasks.data ?? []).filter((t) => projectIdsInScope.has(t.project_id));
  const dealsInScope = (deals.data ?? []).filter(
    (d) => d.brand_id && brandIdsInScope.has(d.brand_id),
  );
  const activitiesInScope = (activities.data ?? []).filter(
    (a) => !a.brand_id || brandIdsInScope.has(a.brand_id),
  );

  /* ---- engagement scope: intake rows are keyed by brand slug, not brand id ---- */
  const engagementBrandKey = scopedBrand?.slug ?? null;
  const engagementScopeAvailable =
    tab === "all" ||
    (engagementBrandKey !== null &&
      (engagements.data ?? []).some((e) => e.brand_key === engagementBrandKey));
  const engagementsInScope = (engagements.data ?? []).filter(
    (e) => tab === "all" || e.brand_key === engagementBrandKey,
  );
  const engagementsRanged = engagementsInScope.filter((e) => inRange(e.created_at));
  const scopedIds = new Set(engagementsInScope.map((e) => e.id));
  const bookingsInScope = (bookings.data ?? []).filter((b) => scopedIds.has(b.engagement_id));
  const bookingsRanged = bookingsInScope.filter((b) => inRange(b.created_at));

  const loadingOps =
    brands.isLoading ||
    channels.isLoading ||
    projects.isLoading ||
    tasks.isLoading ||
    deals.isLoading;
  const loadingIntake = engagements.isLoading || bookings.isLoading;

  /* ---------------- Demand: engagements created per day ---------------- */
  const demandPoints = useMemo(
    () =>
      bucketDaily(
        engagementsRanged.map((e) => ({ date: e.created_at, value: 1 })),
        range,
        compare,
        "sum",
      ),
    [engagementsRanged, range, compare],
  );

  /* ---------------- Qualification quality: qualified share per day ---------------- */
  const qualificationPoints = useMemo(() => {
    if (engagementsRanged.length === 0) return [];
    const byDay = new Map<string, { total: number; good: number }>();
    for (const e of engagementsRanged) {
      const k = dayKey(e.created_at);
      const cur = byDay.get(k) ?? { total: 0, good: 0 };
      cur.total += 1;
      if (isQualified(e)) cur.good += 1;
      byDay.set(k, cur);
    }
    const dated = [...byDay.entries()].map(([date, v]) => ({
      date,
      value: v.total ? Math.round((v.good / v.total) * 100) : 0,
    }));
    return bucketDaily(dated, range, compare, "last");
  }, [engagementsRanged, range, compare]);

  const qualifiedCount = engagementsInScope.filter(isQualified).length;
  const qualificationRate =
    engagementsInScope.length > 0 ? qualifiedCount / engagementsInScope.length : null;

  /* ---------------- Discovery bookings per day ---------------- */
  const bookingPoints = useMemo(
    () =>
      bucketDaily(
        bookingsRanged.map((b) => ({ date: b.created_at, value: 1 })),
        range,
        compare,
        "sum",
      ),
    [bookingsRanged, range, compare],
  );
  const bookingRate =
    engagementsInScope.length > 0 ? bookingsInScope.length / engagementsInScope.length : null;

  /* ---------------- Delivery: projects completed per day ---------------- */
  const completedProjects = projectsInScope.filter((p) => p.status === "completed");
  const throughputPoints = useMemo(() => {
    // Prefer an explicit completion date; fall back to the start date so a
    // completed project is never invisible just because due_date is empty.
    const dated = completedProjects
      .map((p) => ({ date: (p.due_date ?? p.start_date ?? p.created_at) as string, value: 1 }))
      .filter((d) => d.date && inRange(d.date));
    return bucketDaily(dated, range, compare, "sum");
  }, [projectsInScope, range, compare, start]);

  /* ---------------- Execution: tasks completed per day ---------------- */
  const taskPoints = useMemo(() => {
    const completed = tasksInScope.filter((t) => t.completed_at && inRange(t.completed_at));
    return bucketDaily(
      completed.map((t) => ({ date: t.completed_at as string, value: 1 })),
      range,
      compare,
      "sum",
    );
  }, [tasksInScope, range, compare, start]);
  const taskCompletionRate =
    tasksInScope.length > 0
      ? tasksInScope.filter((t) => t.status === "completed").length / tasksInScope.length
      : null;

  /* ---------------- Brand activity: where the work actually happened ---------------- */
  const brandActivity = useMemo(() => {
    return (brands.data ?? [])
      .filter((b) => brandIdsInScope.has(b.id))
      .map((b) => {
        const projectIds = new Set(
          (projects.data ?? []).filter((p) => p.brand_id === b.id).map((p) => p.id),
        );
        const taskCount = (tasks.data ?? []).filter(
          (t) => projectIds.has(t.project_id) && inRange(t.created_at),
        ).length;
        const activityCount = (activities.data ?? []).filter(
          (a) => a.brand_id === b.id && inRange(a.created_at),
        ).length;
        const intakeCount = (engagements.data ?? []).filter(
          (e) => e.brand_key === b.slug && inRange(e.created_at),
        ).length;
        return { x: b.name, y: taskCount + activityCount + intakeCount };
      })
      .filter((p) => p.y > 0);
  }, [brands.data, projects.data, tasks.data, activities.data, engagements.data, tab, range]);

  /* ---------------- Revenue: won deal value per day ---------------- */
  const wonDeals = dealsInScope.filter((d) => d.stage === "won");
  const revenueRecorded = wonDeals.some((d) => Number(d.value ?? 0) > 0);
  const revenuePoints = useMemo(() => {
    const dated = wonDeals
      .filter((d) => inRange(d.created_at))
      .map((d) => ({ date: d.created_at, value: Number(d.value ?? 0) }));
    return bucketDaily(dated, range, compare, "sum");
  }, [dealsInScope, range, compare, start]);
  const pipelineValue = dealsInScope
    .filter((d) => d.stage !== "lost")
    .reduce((s, d) => s + Number(d.value ?? 0), 0);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono-label !text-[9px]">Intelligence</div>
          <h1 className="text-display mt-1.5 flex items-center gap-2">
            Executive overview
            <SourceBadge source={performanceRpc.source} malformed={performanceRpc.malformed} />
            <SourceBadge source={engagementsRpc.source} malformed={engagementsRpc.malformed} />
            <SourceBadge source={overviewRpc.source} malformed={overviewRpc.malformed} />
          </h1>
          <p className="text-supporting mt-1.5 max-w-xl">
            Demand, qualification quality, delivery throughput and revenue across
            {tab === "all" ? " the portfolio" : ` ${scopedBrand?.name ?? "this holding"}`}.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <RangeControl value={range} onChange={setRange} />
          <button
            onClick={() => setCompare((v) => !v)}
            className={cn(
              "h-8 px-3 rounded-[9px] text-[12px] motion-micro",
              compare
                ? "bg-teal-soft text-teal"
                : "bg-[var(--surface-2)] text-muted-foreground hover:text-foreground",
            )}
          >
            Compare prior period
          </button>
        </div>
      </header>

      <div className="overflow-x-auto scrollbar-thin">
        <Segmented value={tab} onChange={setBrandFilter} options={brandOptions} size="sm" />
      </div>

      <KpiBand>
        <Kpi
          label="Engagements"
          value={
            liveEngagements
              ? liveEngagements.total === null
                ? "—"
                : formatNumber(liveEngagements.total)
              : loadingIntake
                ? "…"
                : formatNumber(engagementsRanged.length)
          }
        />
        <Kpi
          label="Qualified"
          value={
            liveQualification
              ? liveQualification.rate === null
                ? "—"
                : pct(liveQualification.rate > 1 ? liveQualification.rate / 100 : liveQualification.rate)
              : qualificationRate === null
                ? "—"
                : pct(qualificationRate)
          }
          tone="teal"
        />
        <Kpi
          label="Discovery calls"
          value={
            liveEngagements
              ? liveEngagements.bookings === null
                ? "—"
                : formatNumber(liveEngagements.bookings)
              : loadingIntake
                ? "…"
                : formatNumber(bookingsInScope.length)
          }
        />
        <Kpi
          label="Active projects"
          value={formatNumber(liveOverview?.active ?? projectsInScope.length)}
        />
        <Kpi
          label="Work completed"
          value={
            liveOverview && liveOverview.completionRate !== null
              ? pct(
                  liveOverview.completionRate > 1
                    ? liveOverview.completionRate / 100
                    : liveOverview.completionRate,
                )
              : taskCompletionRate === null
                ? "—"
                : pct(taskCompletionRate)
          }
        />
        <Kpi
          label="Pipeline value"
          value={formatCurrency(livePipeline?.totalValue ?? pipelineValue)}
        />
      </KpiBand>

      {!engagementScopeAvailable && (
        <div className="surface rounded-[14px] px-5 py-4 text-[13px] text-muted-foreground">
          {scopedBrand?.name ?? "This holding"} does not receive intake through the shared
          engagement pipeline, so demand, qualification and discovery panels are showing the full
          portfolio instead. Switch to <span className="text-foreground">All holdings</span> for the
          complete picture.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <GraphPanel
          title="Demand"
          question="New engagements arriving each day."
          className="xl:col-span-2"
        >
          {loadingIntake ? (
            <ChartSkeleton height={200} />
          ) : (
            <VolumeChart
              data={demandPoints}
              height={200}
              compare={compare}
              compareLabel="Prior"
              emptyHint="No engagements arrived in this period. New intake submissions appear here automatically."
            />
          )}
        </GraphPanel>

        <GraphPanel title="Qualification quality" question="Share of new engagements that qualify.">
          {loadingIntake ? (
            <ChartSkeleton />
          ) : (
            <TrendChart
              data={qualificationPoints}
              unit="%"
              baseline={0}
              compare={compare}
              compareLabel="Prior"
              emptyHint="No scored engagements in this period yet."
            />
          )}
        </GraphPanel>

        <GraphPanel
          title="Discovery bookings"
          question={
            bookingRate === null
              ? "Confirmed discovery calls per day."
              : `Confirmed discovery calls per day — ${pct(bookingRate)} of all engagements booked.`
          }
        >
          {loadingIntake ? (
            <ChartSkeleton />
          ) : (
            <VolumeChart
              data={bookingPoints}
              compare={compare}
              compareLabel="Prior"
              emptyHint="No discovery calls confirmed in this period."
            />
          )}
        </GraphPanel>

        <GraphPanel title="Delivery throughput" question="Projects reaching completion.">
          {loadingOps ? (
            <ChartSkeleton />
          ) : completedProjects.length === 0 ? (
            <ChartEmpty
              label="Nothing completed yet"
              hint={`${projectsInScope.length} project${projectsInScope.length === 1 ? "" : "s"} in flight. Mark a project complete to start the throughput record.`}
            />
          ) : (
            <VolumeChart
              data={throughputPoints}
              compare={compare}
              compareLabel="Prior"
              emptyHint="No projects completed inside this period."
            />
          )}
        </GraphPanel>

        <GraphPanel title="Execution pace" question="Tasks closed out each day.">
          {loadingOps ? (
            <ChartSkeleton />
          ) : (
            <VolumeChart
              data={taskPoints}
              compare={compare}
              compareLabel="Prior"
              emptyHint="No tasks were completed in this period."
            />
          )}
        </GraphPanel>

        <GraphPanel title="Brand activity" question="Where operating attention went.">
          {loadingOps ? (
            <ChartSkeleton />
          ) : brandActivity.length === 0 ? (
            <ChartEmpty
              label="No recorded activity"
              hint="Tasks, notes and intake in this period will show which holdings are moving."
            />
          ) : (
            <VolumeChart data={brandActivity} emptyHint="No recorded activity in this period." />
          )}
        </GraphPanel>

        <GraphPanel
          title="Revenue"
          question="Value from deals marked won."
          className={revenueRecorded ? undefined : undefined}
        >
          {loadingOps ? (
            <ChartSkeleton />
          ) : !revenueRecorded ? (
            <ChartEmpty
              label="No revenue recorded"
              hint="Add a value to a won deal and the revenue trend builds itself from there."
            />
          ) : (
            <VolumeChart
              data={revenuePoints}
              unit="usd"
              compare={compare}
              compareLabel="Prior"
              emptyHint="No revenue recognised inside this period."
            />
          )}
        </GraphPanel>
      </div>

      <MetricsSection
        defs={defs.data ?? []}
        channels={tabChannels}
        obs={obsInScope}
        channelById={channelById}
        isLoading={channels.isLoading || defs.isLoading || obs.isLoading}
        rangedCount={obsRanged.length}
        defById={defById}
      />
    </div>
  );
}

function MetricsSection({
  defs,
  channels,
  obs,
  channelById,
  isLoading,
}: {
  defs: MetricDefinition[];
  channels: Channel[];
  obs: MetricObservation[];
  channelById: Map<string, Channel>;
  isLoading: boolean;
  rangedCount?: number;
  defById?: Map<string, MetricDefinition>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  type Row = {
    key: string;
    defId: string;
    defName: string;
    channelId: string;
    channelName: string;
    unit: string | null;
    history: MetricObservation[];
  };

  const rows: Row[] = useMemo(() => {
    const byKey = new Map<string, MetricObservation[]>();
    for (const o of obs) {
      if (!channels.some((c) => c.id === o.channel_id)) continue;
      const k = `${o.channel_id}:${o.metric_definition_id}`;
      const arr = byKey.get(k) ?? [];
      arr.push(o);
      byKey.set(k, arr);
    }
    const defsById = new Map(defs.map((d) => [d.id, d]));
    const out: Row[] = [];
    for (const [key, arr] of byKey) {
      const [channelId, defId] = key.split(":");
      const sorted = arr
        .slice()
        .sort((a, b) => +new Date(a.observed_at) - +new Date(b.observed_at));
      out.push({
        key,
        defId,
        defName: defsById.get(defId)?.name ?? "—",
        channelId,
        channelName: channelById.get(channelId)?.name ?? "—",
        unit: defsById.get(defId)?.unit ?? null,
        history: sorted,
      });
    }
    return out.sort((a, b) => a.defName.localeCompare(b.defName));
  }, [obs, channels, defs, channelById]);

  return (
    <section id="metrics" className="scroll-mt-16 surface rounded-[14px] overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 h-12">
        <div>
          <div className="text-heading">Tracked measures</div>
          <div className="text-supporting !text-[11.5px]">
            Channel-level series recorded against this portfolio.
          </div>
        </div>
        <div className="text-supporting !text-[11.5px] shrink-0">
          {rows.length} {rows.length === 1 ? "series" : "series"}
        </div>
      </header>
      {isLoading ? (
        <div className="p-5">
          <ChartSkeleton height={120} />
        </div>
      ) : rows.length === 0 ? (
        <ChartEmpty
          label="No measures yet"
          hint="Connect a channel or record an observation and its history appears here."
        />
      ) : (
        <ul className="px-2 pb-2">
          {rows.map((r) => {
            const latest = r.history[r.history.length - 1];
            const isOpen = expanded === r.key;
            return (
              <li key={r.key} className="rounded-[10px] overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.key)}
                  className="w-full flex items-center gap-4 px-3.5 py-3.5 surface-interactive rounded-[10px] text-left motion-micro"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-body truncate">{r.defName}</div>
                    <div className="text-supporting !text-[11.5px] mt-0.5 truncate">
                      {r.channelName} · updated {latest ? relativeTime(latest.observed_at) : "—"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular text-[15px] text-teal leading-none">
                      {latest ? fmtNumber(Number(latest.value), r.unit ?? undefined) : "—"}
                    </div>
                    <div className="text-supporting !text-[10.5px] mt-1">
                      {latest ? formatDate(latest.observed_at) : "—"}
                    </div>
                  </div>
                  <Sparkline values={r.history.map((h) => Number(h.value))} />
                </button>
                {isOpen && (
                  <div className="px-3.5 pb-4 ch-fade-in">
                    <TrendChart
                      data={r.history.map((h) => ({
                        x: h.observed_at.slice(0, 10),
                        y: Number(h.value),
                      }))}
                      unit={r.unit ?? undefined}
                      height={200}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
