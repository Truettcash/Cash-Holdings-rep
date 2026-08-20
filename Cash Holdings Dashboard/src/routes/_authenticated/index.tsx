import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/domain";
import { Surface, KpiBand, Kpi, CountUp, SkeletonRows, EmptyState } from "@/components/ui-bits";
import { InsightsPanel } from "@/components/insights-panel";
import { NotificationList } from "@/components/notifications-center";
import { useIntel, readLastVisit, touchLastVisit } from "@/lib/intelligence/use-intel";
import { buildMorningBrief, type BriefSection } from "@/lib/intelligence/brief";
import { useAnalyticsSurface } from "@/lib/analytics/surfaces";
import { useAnalyticsScope } from "@/lib/analytics/scope";
import { SourceBadge } from "@/components/analytics/source-badge";
import type { BriefLine as RpcBriefLine } from "@/lib/analytics/adapters";
import type { IntelLink } from "@/lib/intelligence/types";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Morning Brief — Cash Holdings" },
      {
        name: "description",
        content:
          "What changed since your last visit across Cash Holdings brands, engagements, projects and integrations.",
      },
      { property: "og:title", content: "Morning Brief — Cash Holdings" },
      {
        property: "og:description",
        content: "A single briefing of new activity, progress, attention items and wins.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BriefingPage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const toneClass: Record<BriefSection["tone"], string> = {
  neutral: "text-foreground/80",
  teal: "text-teal",
  warn: "text-warn",
  success: "text-success",
};

/** Render shape shared by both sources — no values are derived here. */
type ViewSection = {
  id: string;
  label: string;
  tone: BriefSection["tone"];
  lines: { key: string; text: string; ts?: string; link?: IntelLink }[];
};

/** Groups live brief lines by the grouping the backend already assigned. */
function groupBriefLines(lines: RpcBriefLine[]): ViewSection[] {
  const order: string[] = [];
  const groups = new Map<string, ViewSection>();
  for (const line of lines) {
    const id = line.group ?? line.label ?? "updates";
    if (!groups.has(id)) {
      order.push(id);
      groups.set(id, {
        id,
        label: (line.label ?? id).toUpperCase(),
        tone: line.tone,
        lines: [],
      });
    }
    groups.get(id)!.lines.push({
      key: line.key,
      text: line.text,
      ...(line.at ? { ts: line.at } : {}),
    });
  }
  return order.map((id) => groups.get(id)!).filter((section) => section.lines.length > 0);
}

function BriefingPage() {
  const scope = useAnalyticsScope();
  const briefRpc = useAnalyticsSurface("morning-brief", scope);
  const insightsRpc = useAnalyticsSurface("dashboard-insights", scope);

  // The raw-table aggregation only runs while the RPC has not cut over.
  const { input, loading: rawLoading } = useIntel({ enabled: !briefRpc.live });
  // Freeze the window on mount so the brief doesn't move while it is being read.
  const [since] = useState(() => readLastVisit());
  useEffect(() => {
    const t = setTimeout(() => touchLastVisit(), 4000);
    return () => clearTimeout(t);
  }, []);

  const fallbackBrief = useMemo(() => buildMorningBrief(input, since), [input, since]);
  const live = briefRpc.live && briefRpc.model !== null;
  const model = briefRpc.model;
  const loading = live ? briefRpc.isLoading : rawLoading || briefRpc.isLoading;

  // Values come from whichever source is active; nothing is recomputed here.
  const total = live ? model!.total : fallbackBrief.total;
  const attentionCount = live ? model!.attentionCount : fallbackBrief.attentionCount;
  const openWork = live ? model!.openWork : fallbackBrief.openWork;
  const brandCount = live ? model!.brands : input.brands.length;
  const projectCount = live ? model!.projects : input.projects.length;
  const windowLabel = (live ? model!.windowLabel : fallbackBrief.windowLabel) ?? "recent window";

  const liveSections = useMemo(() => groupBriefLines(model?.lines ?? []), [model?.lines]);
  const sections = live ? liveSections : fallbackBrief.sections.filter((s) => s.lines.length > 0);
  const headline = live ? model!.headline : null;

  return (
    <div className="flex flex-col gap-6 ch-page-in">
      <div className="space-y-1.5">
        <h1 className="text-display">{greeting()}</h1>
        <p className="text-body text-foreground/85">
          {loading
            ? "Reading the portfolio…"
            : (headline ??
              (total === 0
                ? "Nothing moved since your last visit. The portfolio is quiet."
                : total === null
                  ? "Recent movement across the portfolio."
                  : attentionCount === 0 || attentionCount === null
                    ? `${total} update${total === 1 ? "" : "s"} since your last visit — nothing needs your attention.`
                    : `${total} update${total === 1 ? "" : "s"} since your last visit, ${attentionCount} needing attention.`))}
        </p>
        <p className="text-supporting flex items-center gap-2">
          <span>
            {windowLabel}
            {openWork === null ? "" : ` · ${openWork} open work item${openWork === 1 ? "" : "s"}`}
          </span>
          <SourceBadge source={briefRpc.source} malformed={briefRpc.malformed} />
        </p>
      </div>

      <KpiBand className="shrink-0 ch-stagger">
        <Kpi
          label="Updates"
          value={loading || total === null ? "—" : <CountUp value={total} />}
          hint={windowLabel.toLowerCase()}
          tone="teal"
        />
        <Kpi
          label="Needs attention"
          value={loading || attentionCount === null ? "—" : <CountUp value={attentionCount} />}
          hint="blockers, overdue and stalled"
        />
        <Kpi
          label="Open work"
          value={loading || openWork === null ? "—" : <CountUp value={openWork} />}
          hint="tasks not yet done"
        />
        <Kpi
          label="Brands"
          value={loading || brandCount === null ? "—" : <CountUp value={brandCount} />}
          hint={projectCount === null ? "projects unsupported" : `${projectCount} projects tracked`}
        />
      </KpiBand>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Surface
            title="What changed"
            subtitle={windowLabel}
            action={
              <Link
                to="/command"
                className="inline-flex items-center gap-1 text-[11px] text-teal hover:underline"
              >
                Command Center <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            {loading ? (
              <SkeletonRows rows={6} />
            ) : sections.length === 0 ? (
              <EmptyState
                title="No movement"
                hint="New engagements, task progress and sync results will land here."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {sections.map((s) => (
                  <section key={s.id}>
                    <div className={cn("mono-label mb-1.5", toneClass[s.tone])}>{s.label}</div>
                    <ul className="flex flex-col">
                      {s.lines.map((line) => (
                        <li
                          key={line.key}
                          className="flex items-baseline gap-3 py-[5px] text-[13px] leading-snug"
                        >
                          <span
                            className={cn("h-1 w-1 rounded-full shrink-0 mt-[7px]", {
                              "bg-teal": s.tone === "teal",
                              "bg-warn": s.tone === "warn",
                              "bg-success": s.tone === "success",
                              "bg-muted-foreground/60": s.tone === "neutral",
                            })}
                            aria-hidden
                          />
                          {line.link ? (
                            <Link
                              to={line.link.to}
                              search={line.link.search as never}
                              className="min-w-0 flex-1 truncate hover:text-teal motion-micro"
                            >
                              {line.text}
                            </Link>
                          ) : (
                            <span className="min-w-0 flex-1 truncate">{line.text}</span>
                          )}
                          {line.ts && (
                            <span className="text-[10.5px] text-muted-foreground shrink-0">
                              {relativeTime(line.ts)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Surface>

          {insightsRpc.live && insightsRpc.model ? (
            <Surface
              title="Insights"
              subtitle={insightsRpc.model.narrative ?? "Evidence from the analytics layer"}
              action={<SourceBadge source={insightsRpc.source} />}
            >
              {insightsRpc.model.items.length === 0 ? (
                <EmptyState
                  title="Not enough activity yet"
                  hint="Insights appear once the period has comparable data."
                />
              ) : (
                <ul className="divide-y divide-edge/60">
                  {insightsRpc.model.items.slice(0, 4).map((item) => (
                    <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-[13px] font-medium truncate">{item.title}</div>
                        <div className="font-mono text-[13px] tabular-nums shrink-0">
                          {item.value === null ? "—" : item.value.toLocaleString()}
                        </div>
                      </div>
                      {item.evidence && (
                        <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">
                          {item.evidence}
                        </p>
                      )}
                      <div className="mono-label !text-[8.5px] mt-1.5 flex items-center gap-2">
                        {item.metric && <span className="truncate">{item.metric}</span>}
                        {item.delta !== null && (
                          <span className={item.delta >= 0 ? "text-success" : "text-warn"}>
                            {item.delta >= 0 ? "+" : ""}
                            {item.delta.toFixed(1)}%
                          </span>
                        )}
                        {item.delta === null && <span>no prior period</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          ) : (
            <InsightsPanel input={input} limit={4} title="Insights" />
          )}
        </div>

        <Surface title="Notifications" flush className="min-w-0">
          <div className="max-h-[520px] flex flex-col">
            <NotificationList compact limit={12} />
          </div>
        </Surface>
      </div>
    </div>
  );
}