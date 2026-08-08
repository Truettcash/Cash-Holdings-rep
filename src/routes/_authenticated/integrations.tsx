import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Instagram, Link2, AlertTriangle } from "lucide-react";
import { q } from "@/lib/data";
import { instagram } from "@/lib/integrations/instagram";
import { integrationAccountsQuery, integrationSyncRunsQuery } from "@/lib/integrations/queries";
import { integrationConnector, connectorHealth } from "@/lib/integrations/connector";
import type {
  IntegrationAccountSafe,
  IntegrationProvider,
  IntegrationStatus,
} from "@/lib/integrations/types";
import { Surface, SkeletonRows, EmptyState } from "@/components/ui-bits";
import { IntegrationCard, type IntegrationCardHealth } from "@/components/integrations/integration-card";
import { CONNECTED_CATALOG, AVAILABLE_CATALOG, FUTURE_CATALOG } from "@/components/integrations/catalog";
import { analyticsRefresh } from "@/lib/analytics/invalidate";

type Search = { integration?: string; status?: string; brand?: string; reason?: string };

export const Route = createFileRoute("/_authenticated/integrations")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    integration: typeof search.integration === "string" ? search.integration : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    brand: typeof search.brand === "string" ? search.brand : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Integrations — Cash Holdings Console" },
      {
        name: "description",
        content:
          "Connect and sync brand platform accounts into the Cash Holdings operating database.",
      },
      { property: "og:title", content: "Integrations — Cash Holdings Console" },
      {
        property: "og:description",
        content: "Operator control for Instagram and platform data syncs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegrationsPage,
});

const REASONS: Record<string, string> = {
  state: "Sign-in state expired or was invalid. Start the connection again.",
  origin: "The return origin is not on the approved list.",
  replay: "That connection link was already used.",
  denied: "The provider denied the permission request.",
  exchange: "The provider rejected the authorization exchange.",
};

const UNWIRED_NOTICE: Record<string, string> = {
  google: "Google Workspace isn't wired to the connector service yet.",
  microsoft: "Microsoft 365 isn't wired to the connector service yet.",
  calendly: "Calendly isn't wired to the connector service yet.",
};

function statusTone(status: string | null): IntegrationCardHealth {
  if (!status) return "unknown";
  if (status === "error" || status === "revoked") return "error";
  if (status === "connected") return "ok";
  return "unknown";
}

function IntegrationsPage() {
  const search = useSearch({ from: "/_authenticated/integrations" });
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<"instagram" | null>(null);

  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const runs = useQuery(integrationSyncRunsQuery(undefined, 12));
  const accounts = useQuery(integrationAccountsQuery());
  const health = useQuery({
    queryKey: ["connectorHealth"],
    queryFn: connectorHealth,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (search.integration !== "instagram" && search.integration !== "ebay") return;
    const label = search.integration === "ebay" ? "eBay" : "Instagram";
    if (search.status === "connected") toast.success(`${label} connected`);
    if (search.status === "error")
      toast.error(REASONS[search.reason ?? ""] ?? `${label} connection failed`);
  }, [search.integration, search.status, search.reason]);

  const instagramAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.provider === "instagram"),
    [accounts.data]
  );

  const summarize = (rows: typeof instagramAccounts) => {
    const connectedRows = rows.filter((r) => r.status === "connected");
    const lastSyncedAt = connectedRows.reduce<string | null>((max, r) => {
      if (!r.last_synced_at) return max;
      if (!max || r.last_synced_at > max) return r.last_synced_at;
      return max;
    }, null);
    const lastError = connectedRows.find((r) => r.last_error)?.last_error ?? null;
    return { connected: connectedRows.length > 0, count: connectedRows.length, lastSyncedAt, lastError };
  };

  const instagramSummary = summarize(instagramAccounts);

  const instagramByBrand = useMemo(() => {
    const map = new Map<string, IntegrationAccountSafe>();
    for (const row of instagramAccounts) {
      if (!row.brand_key) continue;
      const current = map.get(row.brand_key);
      if (!current) {
        map.set(row.brand_key, row);
        continue;
      }
      if (current.status !== "connected" && row.status === "connected") {
        map.set(row.brand_key, row);
      }
    }
    return map;
  }, [instagramAccounts]);

  return (
    <div className="space-y-6">
      <header>
        <div className="mono-label !text-[9px]">SYSTEM / INTEGRATIONS</div>
        <h1 className="text-display mt-1">Integrations</h1>
        <p className="text-supporting text-muted-foreground mt-1.5 max-w-prose">
          Connected platform accounts, sync health and available systems for the operating database.
        </p>
      </header>

      <Surface title="LINK STATUS" subtitle="SERVER-SIDE WIRING" flush>
        <div className="divide-y divide-edge">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2">
            <span className="text-[12.5px]">Connector service</span>
            <span
              className={
                health.isPending
                  ? "mono-label !text-[9px]"
                  : health.isError
                    ? "mono-label !text-[9px] !text-danger"
                    : "mono-label !text-[9px] !text-success"
              }
            >
              {health.isPending ? "CHECKING" : health.isError ? "UNREACHABLE" : "REACHABLE"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2">
            <span className="text-[12.5px]">Server configuration</span>
            <span className="mono-label !text-[9px]">
              {health.data
                ? health.data.ok
                  ? <span className="text-success">COMPLETE</span>
                  : <span className="text-warn">MISSING {health.data.missingEnv.join(" · ")}</span>
                : "—"}
            </span>
          </div>
          {health.isError && (
            <p className="px-3.5 py-2 text-[11.5px] text-muted-foreground">
              The connector isn't answering yet. Once its service is live, connection and sync
              controls below become active.
            </p>
          )}
        </div>
      </Surface>

      <section className="space-y-3">
        <div className="mono-label !text-[9px]">CONNECTED SYSTEMS</div>
        {accounts.isLoading ? (
          <SkeletonRows rows={4} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {CONNECTED_CATALOG.map((entry) => {
              if (entry.id === "instagram") {
                return (
                  <IntegrationCard
                    key={entry.id}
                    icon={entry.icon}
                    name={entry.name}
                    description={entry.description}
                    state={instagramSummary.connected ? "connected" : "available"}
                    accountLabel={
                      instagramSummary.connected
                        ? `${instagramSummary.count} brand${instagramSummary.count === 1 ? "" : "s"} connected`
                        : undefined
                    }
                    lastSyncedAt={instagramSummary.lastSyncedAt}
                    health={instagramSummary.lastError ? "error" : "ok"}
                    errorMessage={instagramSummary.lastError}
                    onConnect={() => setExpanded("instagram")}
                    onConfigure={() => setExpanded(expanded === "instagram" ? null : "instagram")}
                  />
                );
              }
              if (entry.id === "ebay") {
                return (
                  <IntegrationCard
                    key={entry.id}
                    icon={entry.icon}
                    name={entry.name}
                    description={`${entry.description} Currently unavailable in production.`}
                    state="coming-soon"
                  />
                );
              }
              return (
                <GenericProviderCard
                  key={entry.id}
                  provider={entry.id as IntegrationProvider}
                  entry={entry}
                  onChanged={() => analyticsRefresh.integrationSynced(qc)}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="mono-label !text-[9px]">AVAILABLE SYSTEMS</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {AVAILABLE_CATALOG.map((entry) => (
            <IntegrationCard
              key={entry.id}
              icon={entry.icon}
              name={entry.name}
              description={entry.description}
              state="available"
              onConnect={() =>
                toast.message(UNWIRED_NOTICE[entry.id] ?? `${entry.name} isn't wired to the connector service yet.`)
              }
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="mono-label !text-[9px]">FUTURE SYSTEMS</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {FUTURE_CATALOG.map((entry) => (
            <IntegrationCard
              key={entry.id}
              icon={entry.icon}
              name={entry.name}
              description={entry.description}
              state="coming-soon"
            />
          ))}
        </div>
      </section>

      {expanded === "instagram" && (
        <section className="glass-panel rounded-lg divide-y divide-hairline ch-fade-in">
          <div className="px-3 py-2 flex items-center gap-2">
            <Instagram className="h-3.5 w-3.5 text-teal" />
            <div className="mono-label !text-[9px]">INSTAGRAM · PER BRAND</div>
            <div className="ml-auto mono-label !text-[9px] text-foreground/50">
              {(brands.data ?? []).length} BRANDS
            </div>
          </div>
          {(brands.data ?? []).map((b) => (
            <InstagramBrandRow
              key={b.id}
              brandKey={b.slug}
              name={b.name}
              snapshot={instagramByBrand.get(b.slug) ?? null}
              onChanged={() => {
                analyticsRefresh.integrationSynced(qc);
              }}
            />
          ))}
          {brands.isLoading && <SkeletonRows rows={3} className="p-3" />}
        </section>
      )}

      <Surface title="SYNC RUNS" flush>
        <div className="divide-y divide-edge">
          {(runs.data ?? []).map((r) => (
            <div key={r.id} className="px-3.5 py-2 flex items-center gap-3 text-[12px]">
              <span
                className={
                  "h-1.5 w-1.5 rounded-full shrink-0 " +
                  (r.status === "succeeded"
                    ? "bg-teal"
                    : r.status === "failed"
                      ? "bg-danger"
                      : "bg-muted-foreground/40")
                }
              />
              <span className="mono-label !text-[9px] text-muted-foreground shrink-0">
                {r.provider ?? "—"} / {r.sync_type}
              </span>
              <span className="text-muted-foreground truncate">
                {new Date(r.started_at).toLocaleString()}
              </span>
              <span className="ml-auto tabular text-[10.5px] text-muted-foreground shrink-0">
                {r.records_received ?? 0} recv · {r.records_written ?? 0} written
              </span>
              {r.error_message && (
                <span className="text-danger truncate max-w-[240px]">{r.error_message}</span>
              )}
            </div>
          ))}
          {!runs.isLoading && (runs.data ?? []).length === 0 && (
            <EmptyState title="NO SYNC RUNS YET" />
          )}
          {runs.isError && (
            <EmptyState
              title="SYNC HISTORY UNAVAILABLE"
              hint="Integration tables not migrated yet."
            />
          )}
        </div>
      </Surface>
    </div>
  );
}

/** Card-level controller for single-account providers (youtube, google-analytics)
 * that use the shared connector at the workspace level (no per-brand key). */
function GenericProviderCard({
  provider,
  entry,
  onChanged,
}: {
  provider: IntegrationProvider;
  entry: (typeof CONNECTED_CATALOG)[number];
  onChanged: () => void;
}) {
  const statusQuery = useQuery({
    queryKey: ["integration-status", provider, "all"] as const,
    queryFn: () => integrationConnector.status(provider, null),
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<IntegrationStatus | null>(null);
  const qc = useQueryClient();

  const status = local ?? statusQuery.data ?? null;
  const connected = status?.connected ?? false;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err: any) {
      toast.error(err?.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const health: IntegrationCardHealth = status?.lastError ? "error" : connected ? "ok" : "unknown";

  return (
    <IntegrationCard
      icon={entry.icon}
      name={entry.name}
      description={entry.description}
      state={connected ? "connected" : "available"}
      accountLabel={status?.accountUsername ?? status?.accountName ?? undefined}
      lastSyncedAt={status?.lastSyncedAt}
      health={health}
      errorMessage={status?.lastError}
      busy={busy}
      onConnect={() =>
        run("connect", async () => {
          const { authorizationUrl } = await integrationConnector.connect(provider, null);
          window.location.href = authorizationUrl;
        })
      }
      onSync={
        connected
          ? () =>
              run("sync", async () => {
                const result = await integrationConnector.sync(provider, null);
                setLocal(result);
                onChanged();
                toast.success(`Sync complete · ${result.written ?? 0} metrics written`);
              })
          : undefined
      }
      onDisconnect={
        connected
          ? () =>
              run("disconnect", async () => {
                setLocal(await integrationConnector.disconnect(provider, null));
                onChanged();
                qc.invalidateQueries({ queryKey: ["integration-status", provider, "all"] });
                toast.success(`${entry.name} disconnected`);
              })
          : undefined
      }
    />
  );
}

function InstagramBrandRow({
  brandKey,
  name,
  snapshot,
  onChanged,
}: {
  brandKey: string;
  name: string;
  snapshot: IntegrationAccountSafe | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setLocalError(null);
    try {
      await fn();
    } catch (err: any) {
      const message = err?.message ?? "Action failed";
      setLocalError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const connected = snapshot?.status === "connected";
  const accountUsername = snapshot?.account_username ?? snapshot?.external_account_id ?? null;
  const lastSyncedAt = snapshot?.last_synced_at ?? null;
  const errorMessage = localError ?? snapshot?.last_error ?? null;
  const health = statusTone(snapshot?.status ?? null);
  const connectionLabel =
    snapshot?.status === "connected"
      ? ` · ${snapshot.account_username ? `@${snapshot.account_username}` : "connected"}`
      : " · not connected";

  return (
    <div className="px-3 py-2 flex items-center gap-3">
      <span className={"h-1.5 w-1.5 rounded-full " + (connected ? "bg-teal teal-glow" : "bg-foreground/25")} />
      <div className="min-w-0">
        <div className="text-[13px] leading-none">{name}</div>
        <div className="mono-label !text-[9px] text-foreground/50 mt-1">
          {brandKey}
          {connectionLabel}
          {lastSyncedAt ? ` · synced ${new Date(lastSyncedAt).toLocaleString()}` : ""}
          {accountUsername && !connected ? ` · ${accountUsername}` : ""}
        </div>
      </div>
      {errorMessage && (
        <span className="flex items-center gap-1 text-[11px] text-amber-400/80 truncate max-w-[280px]">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {errorMessage}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="mono-label !text-[9px] text-foreground/50 mr-1">
          {connected ? (health === "error" ? "ERROR" : "CONNECTED") : "READY"}
        </span>
        <button
          className="px-2 py-1 border border-hairline rounded text-[11px] font-sans tracking-wider hover:border-teal hover:text-teal transition-colors disabled:opacity-40"
          disabled={busy !== null}
          onClick={() =>
            run("connect", async () => {
              const { authorizationUrl } = await instagram.connect(brandKey);
              window.location.href = authorizationUrl;
              onChanged();
            })
          }
        >
          <Link2 className="h-3 w-3 inline mr-1" />
          {busy === "connect" ? "OPENING…" : connected ? "RECONNECT" : "CONNECT"}
        </button>
      </div>
    </div>
  );
}
