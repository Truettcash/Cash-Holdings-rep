import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { athrtyRecordsQuery } from "@/lib/athrty/queries";
import { computeMetrics } from "@/lib/athrty/filters";
import {
  brandLabel,
  dueBucket,
  interestTone,
  isClosed,
  openValue,
  stageLabel,
  stageTone,
  type AthrtyRecord,
} from "@/lib/athrty/model";
import { formatCurrency, formatNumber, relativeTime } from "@/lib/domain";
import { Chip, DueDate, ErrorNote, TableSkeleton, Val } from "@/components/athrty/bits";
import { AccountInspector } from "@/components/athrty/inspector";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/athrty/")({
  head: () => ({
    meta: [
      { title: "ATHRTY Overview — Cash Holdings" },
      {
        name: "description",
        content:
          "Executive overview of the ATHRTY outbound book: accounts, pipeline value, follow-ups due and sync freshness.",
      },
      { property: "og:title", content: "ATHRTY Overview — Cash Holdings" },
      {
        property: "og:description",
        content: "Accounts, pipeline value, follow-ups due and sync freshness for ATHRTY outbound.",
      },
    ],
  }),
  component: AthrtyOverview,
});

function AthrtyOverview() {
  const { data: records, isLoading, error } = useQuery(athrtyRecordsQuery());
  const [selected, setSelected] = useState<AthrtyRecord | null>(null);

  const model = useMemo(() => {
    const list = records ?? [];
    const metrics = computeMetrics(list, openValue);

    const stageMap = new Map<string, { count: number; value: number }>();
    const brandMap = new Map<string, number>();
    const tierMap = new Map<string, number>();
    for (const r of list) {
      const stageKey = r.stage ?? "";
      const s = stageMap.get(stageKey) ?? { count: 0, value: 0 };
      s.count += 1;
      s.value += openValue(r);
      stageMap.set(stageKey, s);
      const brand = r.canonicalBrand ?? "";
      brandMap.set(brand, (brandMap.get(brand) ?? 0) + 1);
      const tier = r.tier ?? "";
      tierMap.set(tier, (tierMap.get(tier) ?? 0) + 1);
    }

    const dueSoon = list
      .filter((r) => !isClosed(r) && ["overdue", "today"].includes(dueBucket(r.nextActionDate)))
      .sort((a, b) => (a.nextActionDate ?? "").localeCompare(b.nextActionDate ?? ""))
      .slice(0, 8);

    const hot = list
      .filter((r) => !isClosed(r))
      .sort((a, b) => openValue(b) - openValue(a))
      .filter((r) => openValue(r) > 0)
      .slice(0, 6);

    const recent = list
      .filter((r) => r.externalModifiedAt ?? r.lastSyncedAt)
      .sort((a, b) =>
        String(b.externalModifiedAt ?? b.lastSyncedAt).localeCompare(
          String(a.externalModifiedAt ?? a.lastSyncedAt),
        ),
      )
      .slice(0, 6);

    const lastSync = list
      .map((r) => r.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;

    return {
      metrics,
      stages: [...stageMap.entries()].sort((a, b) => b[1].count - a[1].count),
      brands: [...brandMap.entries()].sort((a, b) => b[1] - a[1]),
      tiers: [...tierMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      dueSoon,
      hot,
      recent,
      lastSync: lastSync ?? null,
    };
  }, [records]);

  if (error) return <ErrorNote error={error} />;
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[74px] rounded-[10px] bg-[var(--surface-2)] animate-pulse" />
          ))}
        </div>
        <div className="rounded-[10px] border border-edge">
          <TableSkeleton rows={8} cols={5} />
        </div>
      </div>
    );
  }

  const m = model.metrics;
  const maxStage = Math.max(1, ...model.stages.map(([, v]) => v.count));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="TOTAL ACCOUNTS" value={formatNumber(m.accounts)} />
        <Kpi label="LEADS" value={formatNumber(m.leads)} hint="Mapped engagements" />
        <Kpi
          label="NAMED CONTACTS"
          value={formatNumber(m.namedContacts)}
          hint={`${m.accounts - m.namedContacts} without a person`}
        />
        <Kpi label="OPEN PIPELINE" value={formatCurrency(m.openPipeline)} accent />
        <Kpi
          label="FOLLOW-UPS DUE"
          value={formatNumber(m.followUpsDue)}
          tone={m.followUpsDue > 0 ? "warn" : undefined}
          hint="Overdue or today"
        />
        <Kpi
          label="CONTACTED"
          value={`${formatNumber(m.contacted)} / ${formatNumber(m.accounts)}`}
          hint={`${formatNumber(m.notContacted)} untouched`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          title="PIPELINE DISTRIBUTION"
          action={<Link to="/athrty/pipeline" className="text-[11px] text-teal hover:underline">Pipeline</Link>}
        >
          {model.stages.length === 0 ? (
            <Empty>No pipeline stages present</Empty>
          ) : (
            <div className="space-y-2.5">
              {model.stages.map(([stage, v]) => (
                <div key={stage || "unstaged"}>
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="truncate">{stageLabel(stage || null)}</span>
                    <span className="tabular text-muted-foreground shrink-0">
                      {v.count}
                      {v.value > 0 && (
                        <span className="ml-2 text-foreground/80">{formatCurrency(v.value)}</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-[3px] rounded-full bg-[var(--surface-3)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal/70"
                      style={{ width: `${(v.count / maxStage) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="FOLLOW-UPS DUE"
          action={
            <Link to="/athrty/next-actions" className="text-[11px] text-teal hover:underline">
              Queue
            </Link>
          }
        >
          {model.dueSoon.length === 0 ? (
            <Empty>Nothing overdue or due today</Empty>
          ) : (
            <div className="-mx-1">
              {model.dueSoon.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left px-1 py-[7px] rounded hover:bg-[var(--surface-2)] motion-micro border-b border-edge/40 last:border-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] truncate">
                      <Val>{r.company}</Val>
                    </span>
                    <span className="text-[11px] shrink-0">
                      <DueDate iso={r.nextActionDate} />
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    <Val>{r.nextAction}</Val>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="HIGHEST-VALUE OPEN">
          {model.hot.length === 0 ? (
            <Empty>No quoted open opportunities</Empty>
          ) : (
            <div className="-mx-1">
              {model.hot.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left px-1 py-[7px] rounded hover:bg-[var(--surface-2)] motion-micro border-b border-edge/40 last:border-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] truncate">
                      <Val>{r.company}</Val>
                    </span>
                    <span className="tabular text-[11.5px] text-teal shrink-0">
                      {formatCurrency(openValue(r))}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Chip tone={stageTone(r.stage)}>{stageLabel(r.stage)}</Chip>
                    {r.interest && <Chip tone={interestTone(r.interest)}>{r.interest}</Chip>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="BRAND ROUTING">
          <div className="space-y-1.5">
            {model.brands.map(([brand, count]) => (
              <div key={brand || "unrouted"} className="flex items-center justify-between text-[12px]">
                <span className="truncate">{brandLabel(brand || null)}</span>
                <span className="tabular text-muted-foreground">{count}</span>
              </div>
            ))}
            {model.brands.length === 0 && <Empty>No brand routing present</Empty>}
          </div>
        </Panel>

        <Panel title="TIER COVERAGE">
          <div className="space-y-1.5">
            {model.tiers.map(([tier, count]) => (
              <div key={tier || "untiered"} className="flex items-center justify-between text-[12px]">
                <span className="truncate">{tier || "Untiered"}</span>
                <span className="tabular text-muted-foreground">{count}</span>
              </div>
            ))}
            {model.tiers.length === 0 && <Empty>No tier values present</Empty>}
          </div>
          <div className="mt-3 pt-3 edge-t flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">High interest</span>
            <span className="tabular">{formatNumber(m.highInterest)}</span>
          </div>
        </Panel>

        <Panel
          title="SOURCE FRESHNESS"
          action={
            <Link to="/athrty/sync" className="text-[11px] text-teal hover:underline">
              Sync status
            </Link>
          }
        >
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">Last synced</span>
            <span className="tabular">
              <Val>{model.lastSync ? relativeTime(model.lastSync) : null}</Val>
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">Changed in 7 days</span>
            <span className="tabular">{formatNumber(m.recentChanges)}</span>
          </div>
          <div className="mt-3 pt-3 edge-t space-y-1">
            {model.recent.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="w-full text-left flex items-center justify-between gap-3 py-1 text-[11.5px] rounded hover:bg-[var(--surface-2)] motion-micro px-1 -mx-1"
              >
                <span className="truncate">
                  <Val>{r.company}</Val>
                </span>
                <span className="text-muted-foreground shrink-0">
                  {relativeTime(r.externalModifiedAt ?? r.lastSyncedAt)}
                </span>
              </button>
            ))}
            {model.recent.length === 0 && <Empty>No modification timestamps present</Empty>}
          </div>
        </Panel>
      </div>

      <AccountInspector record={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  tone?: "warn";
}) {
  return (
    <div className="rounded-[10px] border border-edge bg-[var(--surface-1)] px-3.5 py-3">
      <div className="mono-label !text-[8px] !text-muted-foreground/60">{label}</div>
      <div
        className={cn(
          "mt-1.5 tabular text-[19px] leading-none",
          accent && "text-teal",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[10.5px] text-muted-foreground/70 truncate">{hint}</div>}
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-edge bg-[var(--surface-1)]">
      <header className="flex items-center justify-between gap-3 px-4 h-9 edge-b">
        <div className="mono-label !text-[8px] !text-muted-foreground/60">{title}</div>
        {action}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-4 text-[12px] text-muted-foreground/70">{children}</div>;
}