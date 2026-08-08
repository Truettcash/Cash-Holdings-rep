import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { q } from "@/lib/data";
import {
  Panel,
  StatusPill,
  EmptyState,
  dealStageTone,
  Segmented,
} from "@/components/ui-bits";
import { DEAL_STAGES, STAGE_LABEL, formatCurrency, formatDate, relativeTime, titleCase } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-context";
import { useAnalyticsSurface } from "@/lib/analytics/surfaces";
import { useAnalyticsScope } from "@/lib/analytics/scope";
import { SourceBadge } from "@/components/analytics/source-badge";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CrmPage,
});

type View = "pipeline" | "orgs" | "contacts";

const VIEW_ANCHOR: Record<View, string> = {
  pipeline: "deals",
  orgs: "organizations",
  contacts: "contacts",
};
const ANCHOR_VIEW: Record<string, View> = {
  deals: "pipeline",
  organizations: "orgs",
  contacts: "contacts",
};

function CrmPage() {
  const { brandFilter, openAdd } = useApp();
  const scope = useAnalyticsScope();
  // Headline pipeline numbers and stage distribution come from the modular RPCs
  // when they resolve; the raw-table board data below always powers the detail panes.
  const pipelineRpc = useAnalyticsSurface("crm-pipeline", scope);
  const qualificationRpc = useAnalyticsSurface("crm-qualification", scope);
  const pipeline = pipelineRpc.live ? pipelineRpc.model : null;
  const qualification = qualificationRpc.live ? qualificationRpc.model : null;
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: q.organizations });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: q.contacts });
  const deals = useQuery({ queryKey: ["deals"], queryFn: q.deals });
  const activities = useQuery({ queryKey: ["activities", 30], queryFn: () => q.activities(30) });
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });

  const [view, setView] = useState<View>("pipeline");
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && ANCHOR_VIEW[hash]) setView(ANCHOR_VIEW[hash]);
  }, []);

  const dealsFiltered = (deals.data ?? []).filter(
    (d) => brandFilter === "all" || d.brand_id === brandFilter
  );
  const actsFiltered = (activities.data ?? []).filter(
    (a) => brandFilter === "all" || a.brand_id === brandFilter
  );

  const totals = useMemo(() => {
    const open = dealsFiltered.filter((d) => d.stage !== "won" && d.stage !== "lost");
    const value = open.reduce((s, d) => s + Number(d.value ?? 0), 0);
    const won = dealsFiltered.filter((d) => d.stage === "won").reduce((s, d) => s + Number(d.value ?? 0), 0);
    return { count: open.length, value, won };
  }, [dealsFiltered]);

  const orgById = new Map((orgs.data ?? []).map((o) => [o.id, o]));
  const brandById = new Map((brands.data ?? []).map((b) => [b.id, b]));
  const contactById = new Map((contacts.data ?? []).map((c) => [c.id, c]));

  const liveStages = pipeline?.stages.filter((stage) => (stage.count ?? 0) > 0) ?? null;
  const stageDist =
    liveStages && liveStages.length > 0
      ? liveStages.map((stage) => ({ s: stage.key, n: stage.count ?? 0 }))
      : DEAL_STAGES.map((s) => ({
          s,
          n: dealsFiltered.filter((d) => d.stage === s).length,
        }));
  const stageTotal = stageDist.reduce((sum, x) => sum + x.n, 0) || 1;
  const hasCrm =
    (pipeline?.openDeals ?? 0) > 0 || dealsFiltered.length > 0 || (orgs.data ?? []).length > 0;
  const trackedDeals = pipeline
    ? (pipeline.openDeals ?? 0) + (pipeline.wonDeals ?? 0) + (pipeline.lostDeals ?? 0)
    : dealsFiltered.length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="mono-label !text-[9px]">GROW / CUSTOMER RELATIONS</div>
          <h1 className="text-title mt-1 flex items-center gap-2">
            CRM
            <SourceBadge source={pipelineRpc.source} malformed={pipelineRpc.malformed} />
            <SourceBadge source={qualificationRpc.source} malformed={qualificationRpc.malformed} />
          </h1>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Link
            to="/engagements"
            className="h-6 px-2.5 grid place-items-center rounded border border-edge text-[10.5px] font-sans uppercase tracking-[0.06em] hover:border-teal/40 hover:text-teal"
          >
            Engagements
          </Link>
          <button
            onClick={() => openAdd("org")}
            className="h-6 px-2.5 rounded border border-edge text-[10.5px] font-sans uppercase tracking-[0.06em] hover:border-teal/40 hover:text-teal"
          >
            + Org
          </button>
          <button
            onClick={() => openAdd("contact")}
            className="h-6 px-2.5 rounded border border-edge text-[10.5px] font-sans uppercase tracking-[0.06em] hover:border-teal/40 hover:text-teal"
          >
            + Contact
          </button>
          <button
            onClick={() => openAdd("deal", { brand_id: brandFilter === "all" ? undefined : brandFilter })}
            className="h-6 px-2.5 rounded border border-teal/40 bg-teal-soft text-teal text-[10.5px] font-sans uppercase tracking-[0.06em]"
          >
            + Deal
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Open Deals" value={pipeline ? pipeline.openDeals ?? "—" : totals.count} />
        <MiniStat
          label="Open Pipeline"
          value={
            pipeline
              ? pipeline.totalValue === null
                ? "—"
                : formatCurrency(pipeline.totalValue)
              : formatCurrency(totals.value)
          }
          accent
        />
        <MiniStat
          label={pipeline ? "Win Rate" : "Closed Won"}
          value={
            pipeline
              ? pipeline.winRate === null
                ? "—"
                : `${pipeline.winRate.toFixed(1)}%`
              : formatCurrency(totals.won)
          }
        />
        <MiniStat
          label="Avg Qualification"
          value={
            qualification
              ? qualification.average === null
                ? "—"
                : qualification.average.toFixed(1)
              : "—"
          }
        />
      </div>

      {/* Pipeline distribution visual */}
      <section className="surface rounded-[10px] px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <div className="mono-label !text-[9px]">PIPELINE DISTRIBUTION</div>
          <div className="mono-label !text-[9px] text-foreground/60">
            {hasCrm ? `${trackedDeals} DEALS TRACKED` : "BASELINE STATE"}
          </div>
        </div>
        {!hasCrm ? (
          <div className="py-4 text-center">
            <div className="text-[12.5px] text-muted-foreground">
              Commercial layer is ready. Add an organization to begin the pipeline.
            </div>
            <button
              onClick={() => openAdd("org")}
              className="mt-2 h-6 px-2.5 inline-flex items-center rounded border border-teal/40 bg-teal-soft text-teal text-[10.5px] font-sans uppercase tracking-[0.06em] hover:bg-teal/20"
            >
              Add Organization
            </button>
          </div>
        ) : (
          <>
            <div className="flex h-2 rounded overflow-hidden border border-edge">
              {stageDist.map(({ s, n }) => {
                if (n === 0) return null;
                const w = (n / stageTotal) * 100;
                const color =
                  s === "won"
                    ? "bg-success"
                    : s === "lost"
                    ? "bg-danger"
                    : s === "negotiation" || s === "proposal_sent"
                    ? "bg-teal"
                    : "bg-muted-foreground/50";
                return <div key={s} className={color} style={{ width: `${w}%` }} title={`${s}: ${n}`} />;
              })}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 mono-label !text-[9px]">
              {stageDist.filter((x) => x.n > 0).map(({ s, n }) => (
                <span key={s}>
                  {STAGE_LABEL[s as keyof typeof STAGE_LABEL] ?? titleCase(s)} · {n}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="overflow-x-auto scrollbar-thin">
        <Segmented
          value={view}
          onChange={(v) => {
            setView(v as View);
            window.history.replaceState(null, "", `#${VIEW_ANCHOR[v as View]}`);
          }}
          options={[
            { value: "pipeline", label: "Pipeline" },
            { value: "orgs", label: "Organizations" },
            { value: "contacts", label: "Contacts" },
          ]}
        />
      </div>

      {view === "pipeline" && (
        <div id="deals" className="scroll-mt-16">
          <PipelineBoard deals={dealsFiltered} orgById={orgById} brandById={brandById} />
        </div>
      )}

      {view === "orgs" && (
        <div id="organizations" className="scroll-mt-16 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          <section className="surface rounded-[10px] overflow-hidden">
            <header className="flex items-center justify-between gap-3 px-3.5 h-9 edge-b">
              <div className="mono-label !text-[9.5px] !text-foreground/80">
                ORGANIZATIONS · {orgs.data?.length ?? 0}
              </div>
            </header>
            {(orgs.data ?? []).length === 0 ? (
              <EmptyState title="No organizations" />
            ) : (
              <>
                {/* md+: dense table */}
                <table className="w-full text-[13px] hidden md:table">
                  <thead>
                    <tr className="text-left mono-label edge-b">
                      <th className="font-normal py-1.5 px-3">Name</th>
                      <th className="font-normal py-1.5">Industry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orgs.data ?? []).map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => setSelectedOrg(o.id)}
                        className={cn(
                          "cursor-pointer surface-interactive edge-b last:border-b-0 motion-micro",
                          selectedOrg === o.id && "surface-selected"
                        )}
                      >
                        <td className="py-3 px-3 pr-2">{o.name}</td>
                        <td className="py-3 text-muted-foreground">{o.industry ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* below md: stacked rows */}
                <ul className="md:hidden">
                  {(orgs.data ?? []).map((o) => (
                    <li
                      key={o.id}
                      onClick={() => setSelectedOrg(o.id)}
                      className={cn(
                        "px-3.5 py-3 edge-b last:border-b-0 surface-interactive motion-micro cursor-pointer",
                        selectedOrg === o.id && "surface-selected"
                      )}
                    >
                      <div className="text-[13px] truncate">{o.name}</div>
                      <div className="mono-label !text-[9px] mt-0.5">{o.industry ?? "—"}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <OrgDetail
            org={selectedOrg ? orgById.get(selectedOrg) ?? null : (orgs.data ?? [])[0] ?? null}
            contacts={(contacts.data ?? []).filter((c) => c.organization_id === (selectedOrg ?? (orgs.data ?? [])[0]?.id))}
            deals={(deals.data ?? []).filter((d) => d.organization_id === (selectedOrg ?? (orgs.data ?? [])[0]?.id))}
            activities={(activities.data ?? []).filter((a) => a.organization_id === (selectedOrg ?? (orgs.data ?? [])[0]?.id))}
            brandById={brandById}
          />
        </div>
      )}

      {view === "contacts" && (
        <section id="contacts" className="scroll-mt-16 surface rounded-[10px] overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-3.5 h-9 edge-b">
            <div className="mono-label !text-[9.5px] !text-foreground/80">
              CONTACTS · {contacts.data?.length ?? 0}
            </div>
          </header>
          {(contacts.data ?? []).length === 0 ? (
            <EmptyState title="No contacts" />
          ) : (
            <>
              <table className="w-full text-[13px] hidden md:table">
                <thead>
                  <tr className="text-left mono-label edge-b">
                    <th className="font-normal py-1.5 px-3">Name</th>
                    <th className="font-normal py-1.5">Title</th>
                    <th className="font-normal py-1.5">Organization</th>
                    <th className="font-normal py-1.5 pr-3">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {(contacts.data ?? []).map((c) => (
                    <tr key={c.id} className="surface-interactive edge-b last:border-b-0 motion-micro">
                      <td className="py-3 px-3 pr-2">{c.full_name}</td>
                      <td className="py-3 text-muted-foreground">{c.title ?? "—"}</td>
                      <td className="py-3 text-muted-foreground">
                        {c.organization_id ? orgById.get(c.organization_id)?.name ?? "—" : "—"}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground mono-label !text-[11px]">{c.email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="md:hidden">
                {(contacts.data ?? []).map((c) => (
                  <li key={c.id} className="px-3.5 py-3 edge-b last:border-b-0 surface-interactive motion-micro">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-[13px] truncate">{c.full_name}</div>
                      <div className="mono-label !text-[9px] shrink-0">{c.title ?? "—"}</div>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {c.organization_id ? orgById.get(c.organization_id)?.name ?? "—" : "—"}
                      </span>
                      <span className="mono-label !text-[9px] shrink-0">{c.email ?? "—"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function PipelineBoard({
  deals,
  orgById,
  brandById,
}: {
  deals: any[];
  orgById: Map<string, any>;
  brandById: Map<string, any>;
}) {
  if (deals.length === 0) {
    return (
      <Panel title="Pipeline">
        <EmptyState title="No deals yet" hint="Add a deal to start tracking pipeline." />
      </Panel>
    );
  }
  return (
    <div className="grid grid-flow-col auto-cols-[260px] gap-3 overflow-x-auto pb-2">
      {DEAL_STAGES.map((stage) => {
        const colDeals = deals.filter((d) => d.stage === stage);
        const colValue = colDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
        return (
          <div key={stage} className="surface rounded-[12px] flex flex-col min-h-[400px]">
            <header className="px-3 py-2.5 edge-b flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium">{STAGE_LABEL[stage]}</div>
                <div className="mono-label !text-[9px]">{colDeals.length} · {formatCurrency(colValue)}</div>
              </div>
              <StatusPill status={stage} tone={dealStageTone(stage)} />
            </header>
            <div className="p-2 space-y-2 flex-1 overflow-y-auto">
              {colDeals.length === 0 ? (
                <div className="mono-label !text-[9px] text-center py-6 opacity-50">empty</div>
              ) : (
                colDeals.map((d) => (
                  <div key={d.id} className="rounded-lg surface-raised p-3 lift-hover motion-micro">
                    <div className="text-[13px] font-medium truncate">{d.name}</div>
                    <div className="mono-label !text-[9px] mt-1 truncate">
                      {d.organization_id ? orgById.get(d.organization_id)?.name ?? "—" : "—"}
                      {d.brand_id && <span> · {brandById.get(d.brand_id)?.name ?? ""}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="tabular text-[13px] text-teal">
                        {formatCurrency(d.value, d.currency ?? "USD")}
                      </span>
                      {d.next_action_due && (
                        <span className="mono-label !text-[9px]">{formatDate(d.next_action_due)}</span>
                      )}
                    </div>
                    {d.next_action && (
                      <div className="mt-1.5 text-[11.5px] text-muted-foreground truncate">→ {d.next_action}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrgDetail({
  org,
  contacts,
  deals,
  activities,
  brandById,
}: {
  org: any | null;
  contacts: any[];
  deals: any[];
  activities: any[];
  brandById: Map<string, any>;
}) {
  if (!org) {
    return (
      <Panel title="Organization">
        <EmptyState title="No organization selected" />
      </Panel>
    );
  }
  return (
    <div className="space-y-4">
      <Panel
        title={<span className="text-[16px] font-semibold tracking-tight leading-none">{org.name}</span>}
        subtitle={[org.industry, org.location].filter(Boolean).join(" · ") || "—"}
      >
        {org.notes ? (
          <p className="text-[13px] text-muted-foreground">{org.notes}</p>
        ) : (
          <p className="text-[12px] text-muted-foreground/60 italic">No notes.</p>
        )}
        {org.website && (
          <div className="mt-3 mono-label !text-[10px]">
            <a href={org.website} target="_blank" rel="noreferrer" className="text-teal hover:underline">
              {org.website}
            </a>
          </div>
        )}
      </Panel>
      <Panel title={`Deals · ${deals.length}`}>
        {deals.length === 0 ? (
          <EmptyState title="No deals" />
        ) : (
          <ul className="-my-2 divide-y divide-edge">
            {deals.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] truncate">{d.name}</div>
                  <div className="mono-label !text-[9px]">
                    {brandById.get(d.brand_id)?.name ?? "—"} · {formatCurrency(d.value, d.currency ?? "USD")}
                  </div>
                </div>
                <StatusPill status={STAGE_LABEL[d.stage as keyof typeof STAGE_LABEL] ?? d.stage} tone={dealStageTone(d.stage)} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={`Contacts · ${contacts.length}`}>
        {contacts.length === 0 ? (
          <EmptyState title="No contacts" />
        ) : (
          <ul className="-my-2 divide-y divide-edge">
            {contacts.map((c) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px]">{c.full_name}</div>
                  <div className="mono-label !text-[9px]">{c.title ?? "—"}</div>
                </div>
                <div className="mono-label !text-[9px]">{c.email ?? "—"}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Activity">
        {activities.length === 0 ? (
          <EmptyState title="No activity" />
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-teal/70 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-[13px] truncate">{a.subject}</div>
                    <div className="mono-label !text-[9px] shrink-0">{relativeTime(a.activity_at)}</div>
                  </div>
                  <div className="mono-label !text-[9px]">{titleCase(a.activity_type)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className="surface rounded-[12px] px-5 py-4">
      <div className="mono-label !text-[9px]">{label}</div>
      <div className={cn("mt-2 tabular text-[24px] font-medium leading-none", accent && "text-teal")}>
        {value}
      </div>
    </div>
  );
}
