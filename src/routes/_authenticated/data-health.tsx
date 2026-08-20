import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "@/lib/data";
import { useSession } from "@/lib/use-session";
import { defaultProbeScope, probeAllAnalytics, type ProbeRow } from "@/lib/analytics/probe";
import { ANALYTICS_ROOT } from "@/lib/analytics/keys";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/data-health")({
  component: DataHealthPage,
});

function DataHealthPage() {
  const { session } = useSession();
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const channels = useQuery({ queryKey: ["channels"], queryFn: q.channels });
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: q.tasks });
  const defs = useQuery({ queryKey: ["metricDefs"], queryFn: q.metricDefs });
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: q.organizations });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: q.contacts });
  const deals = useQuery({ queryKey: ["deals"], queryFn: q.deals });
  const activities = useQuery({ queryKey: ["activities", 1], queryFn: () => q.activities(1) });
  const channelIds = (channels.data ?? []).map((c) => c.id);
  const obs = useQuery({
    queryKey: ["obs-health", channelIds.slice().sort().join(",")],
    queryFn: () => q.observationsForChannels(channelIds),
    enabled: channelIds.length > 0,
  });

  const blocked = (tasks.data ?? []).filter((t) => t.status === "blocked").length;
  const projectsWithoutTasks = (projects.data ?? []).filter(
    (p) => !(tasks.data ?? []).some((t) => t.project_id === p.id)
  );
  const dealsMissingAction = (deals.data ?? []).filter((d) => !d.next_action);
  const channelsWithoutObs = (channels.data ?? []).filter(
    (c) => !(obs.data ?? []).some((o) => o.channel_id === c.id)
  );
  const latestObs = (obs.data ?? [])
    .slice()
    .sort((a, b) => +new Date(b.observed_at) - +new Date(a.observed_at))[0];

  const rows = [
    ["brands", brands.data?.length],
    ["channels", channels.data?.length],
    ["projects", projects.data?.length],
    ["project_tasks", tasks.data?.length],
    ["metric_definitions", defs.data?.length],
    ["metric_observations", obs.data?.length],
    ["activities", activities.data?.length],
    ["organizations", orgs.data?.length],
    ["contacts", contacts.data?.length],
    ["deals", deals.data?.length],
  ] as const;

  return (
    <div className="space-y-3">
      <header>
        <div className="mono-label !text-[9px]">SYSTEM / DIAGNOSTICS</div>
        <h1 className="text-[20px] font-semibold tracking-tight leading-none mt-1">Data Health</h1>
      </header>

      {/* Record coverage visual */}
      <section className="surface rounded-[10px] px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="mono-label !text-[9px]">RECORD COVERAGE</div>
          <div className="mono-label !text-[9px] text-foreground/60">
            {rows.filter(([, n]) => (n ?? 0) > 0).length}/{rows.length} TABLES POPULATED
          </div>
        </div>
        <div className="grid grid-cols-10 gap-1">
          {rows.map(([t, n]) => (
            <div key={t} className="text-center">
              <div
                className={
                  (n ?? 0) > 0
                    ? "h-1.5 rounded bg-teal teal-glow"
                    : "h-1.5 rounded bg-muted-foreground/30"
                }
                title={`${t}: ${n ?? 0}`}
              />
              <div className="mono-label !text-[8px] mt-1 truncate">{t.replace(/_/g, " ")}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-12 gap-3">
        <section className="col-span-12 lg:col-span-6 surface rounded-[10px]">
          <Head title="Connection" />
          <div className="px-3 py-2.5 text-[12px] space-y-1.5">
            <Row k="Status" v={<span className="text-teal">LIVE</span>} />
            <Row k="Source" v="EXTERNAL SUPABASE" />
            <Row k="Project Ref" v="ldijllskwwmyhhbzspmb" />
            <Row k="Auth User" v={session?.user.email ?? "—"} />
          </div>
        </section>

        <section className="col-span-12 lg:col-span-6 surface rounded-[10px]">
          <Head title="Operational Signals" />
          <div className="px-3 py-2.5 text-[12px] space-y-1.5">
            <Row k="Last Observation" v={latestObs?.observed_at ?? "—"} />
            <Row k="Blocked Tasks" v={String(blocked)} />
            <Row k="Projects w/o Tasks" v={String(projectsWithoutTasks.length)} />
            <Row k="Deals w/o Next Action" v={String(dealsMissingAction.length)} />
            <Row k="Channels w/o Observations" v={String(channelsWithoutObs.length)} />
          </div>
        </section>

        <section className="col-span-12 surface rounded-[10px] overflow-hidden">
          <Head title="Table Inventory" />
          <table className="w-full text-[12px] hidden md:table">
            <thead>
              <tr className="mono-label text-left edge-b">
                <th className="font-normal px-3 py-2">Table</th>
                <th className="font-normal py-2 text-right pr-3">Rows</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([t, n]) => (
                <tr key={t} className="surface-interactive edge-b last:border-b-0 motion-micro">
                  <td className="px-3 py-1.5 mono">{t}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-teal">{n ?? "…"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="md:hidden">
            {rows.map(([t, n]) => (
              <li key={t} className="px-3 py-2 flex items-center justify-between edge-b last:border-b-0 surface-interactive motion-micro">
                <span className="mono text-[11.5px]">{t}</span>
                <span className="tabular text-[12px] text-teal">{n ?? "…"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {import.meta.env.DEV && (
        <div className="mono-label !text-[9px] opacity-60 pt-2">
          DATA SOURCE: CASH HOLDINGS EXTERNAL SUPABASE · PROJECT REF: ldijllskwwmyhhbzspmb
        </div>
      )}

      <AnalyticsRpcMatrix />
    </div>
  );
}

/** Live modular-analytics verification from the signed-in owner session. */
function AnalyticsRpcMatrix() {
  const qc = useQueryClient();
  const probe = useQuery({
    queryKey: ["analytics-probe"] as const,
    queryFn: () => probeAllAnalytics(defaultProbeScope()),
    staleTime: 30_000,
  });
  const rows: ProbeRow[] = probe.data ?? [];
  const passing = rows.filter((r) => r.ok).length;

  return (
    <section className="surface rounded-[10px] overflow-hidden">
      <header className="px-3 py-2 edge-b flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium tracking-tight">Analytics API</div>
          <div className="mono-label !text-[9px] mt-0.5">
            {probe.isPending
              ? "TESTING MODULAR FUNCTIONS…"
              : `${passing}/${rows.length} MODULES RESPONDING · LAST 30 DAYS · ALL HOLDINGS`}
          </div>
        </div>
        <button
          onClick={() => {
            qc.removeQueries({ queryKey: ANALYTICS_ROOT });
            qc.invalidateQueries({ queryKey: ANALYTICS_ROOT });
            probe.refetch();
          }}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[8px] bg-[var(--surface-2)] text-[11.5px] text-muted-foreground hover:text-foreground motion-micro"
        >
          <RefreshCw className={probe.isFetching ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
          Re-test
        </button>
      </header>
      <ul>
        {rows.map((r) => (
          <li key={r.fn} className="px-3 py-2 edge-b last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-[11.5px] truncate">analytics.{r.fn}</span>
              <span
                className={
                  r.ok
                    ? "mono-label !text-[9px] text-teal"
                    : "mono-label !text-[9px] text-danger"
                }
              >
                {r.ok ? `PASS · ${r.count ?? 0} ${Array.isArray(r.rootKeys) && r.rootKeys[0] === "<array>" ? "ROWS" : "KEYS"} · ${r.ms}MS` : `FAIL · ${r.code ?? r.kind}`}
              </span>
            </div>
            {r.ok ? (
              <div className="mono-label !text-[9px] !text-muted-foreground/70 mt-1 truncate">
                {r.rootKeys.join(" · ") || "—"}
              </div>
            ) : (
              import.meta.env.DEV && (
                <div className="text-[11px] text-muted-foreground mt-1 break-words">
                  {r.detail ?? r.message}
                  {r.hint ? ` · hint: ${r.hint}` : ""}
                </div>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Head({ title }: { title: string }) {
  return (
    <header className="px-3 py-2 edge-b">
      <div className="text-[12px] font-medium tracking-tight">{title}</div>
    </header>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="mono-label !text-[10px]">{k}</span>
      <span className="font-sans text-[11.5px] truncate">{v}</span>
    </div>
  );
}