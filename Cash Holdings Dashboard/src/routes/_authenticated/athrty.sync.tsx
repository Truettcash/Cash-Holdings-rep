import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";
import { ATHRTY_ROOT, athrtySyncQuery } from "@/lib/athrty/queries";
import { previewChanges, runSync, type PreviewResult, type SyncResult } from "@/lib/athrty/sync";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/domain";
import { Chip, DataRow, ErrorNote, SectionLabel, Val } from "@/components/athrty/bits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/athrty/sync")({
  head: () => ({
    meta: [
      { title: "ATHRTY Sync Status — Cash Holdings" },
      {
        name: "description",
        content:
          "Connection health, record counts and sync history for the Microsoft 365 SharePoint ATHRTY Outbound pipeline.",
      },
      { property: "og:title", content: "ATHRTY Sync Status — Cash Holdings" },
      {
        property: "og:description",
        content: "Connection health, record counts and sync history for the ATHRTY pipeline.",
      },
    ],
  }),
  component: AthrtySync,
});

const statusTone = (status: string | null) => {
  const s = (status ?? "").toLowerCase();
  if (s.includes("success") || s.includes("connected") || s.includes("active")) return "success";
  if (s.includes("run") || s.includes("progress") || s.includes("pending")) return "teal";
  if (s.includes("error") || s.includes("fail") || s.includes("revoked")) return "danger";
  if (s.includes("warn") || s.includes("stale") || s.includes("partial")) return "warn";
  return "muted";
};

function AthrtySync() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery(athrtySyncQuery());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  const previewMutation = useMutation({
    mutationFn: previewChanges,
    onSuccess: (r) => {
      setPreview(r);
      setResult(null);
      toast.success("Preview complete — no data was written");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Preview failed"),
  });

  const syncMutation = useMutation({
    mutationFn: runSync,
    onSuccess: (r) => {
      setResult(r);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ATHRTY_ROOT });
      toast.success(r.ok ? "Sync complete" : "Sync finished with issues");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const busy = previewMutation.isPending || syncMutation.isPending;

  if (error) return <ErrorNote error={error} />;

  const conn = data?.connection ?? null;
  const runs = data?.runs ?? [];
  const lastRun = runs[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="rounded-[10px] border border-edge bg-[var(--surface-1)]">
          <header className="flex items-center justify-between px-4 h-9 edge-b">
            <div className="mono-label !text-[8px] !text-muted-foreground/60">CONNECTION</div>
            <button
              onClick={() => refetch()}
              className="text-muted-foreground hover:text-foreground motion-micro"
              aria-label="Refresh connection status"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            </button>
          </header>
          <div className="px-4 py-3">
            {isLoading ? (
              <div className="h-24 rounded bg-[var(--surface-2)] animate-pulse" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Chip tone={statusTone(conn?.status ?? null)}>
                    {conn?.status ?? "Unknown"}
                  </Chip>
                  <span className="text-[11.5px] text-muted-foreground truncate">
                    <Val>{conn?.displayName}</Val>
                  </span>
                </div>
                <div className="mt-2.5">
                  <DataRow label="Provider" value={conn?.provider ?? "Microsoft 365"} />
                  <DataRow label="Source list" value={conn?.sourceList ?? "ATHRTY Outbound"} />
                  <DataRow
                    label="Last synced"
                    value={conn?.lastSyncedAt ? relativeTime(conn.lastSyncedAt) : null}
                  />
                  <DataRow label="Last error" value={conn?.lastError} />
                  <DataRow
                    label="Mapped records"
                    value={formatNumber(data?.mappedRecords ?? 0)}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <section className="rounded-[10px] border border-edge bg-[var(--surface-1)]">
          <header className="px-4 h-9 edge-b flex items-center">
            <div className="mono-label !text-[8px] !text-muted-foreground/60">LAST RUN</div>
          </header>
          <div className="px-4 py-3">
            {lastRun ? (
              <>
                <Chip tone={statusTone(lastRun.status)}>{lastRun.status ?? "Unknown"}</Chip>
                <div className="mt-2.5">
                  <DataRow label="Type" value={lastRun.syncType} />
                  <DataRow
                    label="Started"
                    value={lastRun.startedAt ? formatDateTime(lastRun.startedAt) : null}
                  />
                  <DataRow
                    label="Completed"
                    value={lastRun.completedAt ? formatDateTime(lastRun.completedAt) : null}
                  />
                  <DataRow
                    label="Records read"
                    value={lastRun.recordsRead === null ? null : formatNumber(lastRun.recordsRead)}
                  />
                  <DataRow
                    label="Records mapped"
                    value={
                      lastRun.recordsMapped === null ? null : formatNumber(lastRun.recordsMapped)
                    }
                  />
                  <DataRow label="Error" value={lastRun.errorMessage} />
                </div>
              </>
            ) : (
              <div className="py-4 text-[12px] text-muted-foreground/70">
                No sync runs recorded yet
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[10px] border border-edge bg-[var(--surface-1)]">
          <header className="px-4 h-9 edge-b flex items-center">
            <div className="mono-label !text-[8px] !text-muted-foreground/60">MANUAL CONTROL</div>
          </header>
          <div className="px-4 py-3">
            <p className="text-[11.5px] text-muted-foreground leading-relaxed">
              Preview compares the SharePoint list against the database and writes nothing. Sync
              applies the mapping. All writes happen server-side under your session.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => previewMutation.mutate()}
                disabled={busy}
                className="h-8 px-3 rounded-[9px] border border-edge bg-[var(--surface-2)] text-[12px] inline-flex items-center justify-center gap-2 hover:border-edge-strong disabled:opacity-50 motion-micro"
              >
                {previewMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Preview Changes
              </button>
              <button
                onClick={() => syncMutation.mutate()}
                disabled={busy}
                className="h-8 px-3 rounded-[9px] border border-teal/40 bg-teal-soft text-teal text-[12px] inline-flex items-center justify-center gap-2 hover:border-teal/70 disabled:opacity-50 motion-micro"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Sync Now
              </button>
            </div>
          </div>
        </section>
      </div>

      {preview && (
        <section className="rounded-[10px] border border-edge bg-[var(--surface-1)] px-4 py-3">
          <SectionLabel>PREVIEW — NO DATA WRITTEN</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Metric label="RECORDS READ" value={preview.recordsRead} />
            <Metric label="NEW" value={preview.newCount} />
            <Metric label="CHANGED" value={preview.changed} />
            <Metric label="UNCHANGED" value={preview.unchanged} />
            <Metric label="INVALID" value={preview.invalid} tone="warn" />
            <Metric label="AMBIGUOUS" value={preview.ambiguous} tone="warn" />
            <Metric label="DUPLICATES" value={preview.duplicates} tone="warn" />
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Metric label="ORGANIZATIONS PROPOSED" value={preview.organizationsProposed} />
            <Metric label="CONTACTS PROPOSED" value={preview.contactsProposed} />
            <Metric label="ENGAGEMENTS PROPOSED" value={preview.engagementsProposed} />
          </div>
          {preview.errors.length > 0 && (
            <div className="mt-3 pt-3 edge-t space-y-1">
              {preview.errors.map((e, i) => (
                <div key={i} className="text-[11.5px] text-warn break-words">
                  {e}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {result && (
        <section className="rounded-[10px] border border-edge bg-[var(--surface-1)] px-4 py-3">
          <SectionLabel>SYNC RESULT</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Metric label="RECORDS READ" value={result.recordsRead} />
            <Metric label="SOURCE INSERTED" value={result.sourceInserted} />
            <Metric label="SOURCE UPDATED" value={result.sourceUpdated} />
            <Metric label="ORGS INSERTED" value={result.orgsInserted} />
            <Metric label="CONTACTS INSERTED" value={result.contactsInserted} />
            <Metric label="ENGAGEMENTS INSERTED" value={result.engagementsInserted} />
            <Metric label="ORGS UPDATED" value={result.orgsUpdated} />
            <Metric label="CONTACTS UPDATED" value={result.contactsUpdated} />
            <Metric label="ENGAGEMENTS UPDATED" value={result.engagementsUpdated} />
            <Metric label="CONTACTS SKIPPED" value={result.contactsSkipped} />
            <Metric label="SOURCE UNCHANGED" value={result.sourceUnchanged} />
            <Metric
              label="DURATION"
              value={result.durationMs}
              format={(n) => `${(n / 1000).toFixed(1)}s`}
            />
          </div>
        </section>
      )}

      <section className="rounded-[10px] border border-edge bg-[var(--surface-1)]">
        <header className="px-4 h-9 edge-b flex items-center">
          <div className="mono-label !text-[8px] !text-muted-foreground/60">RUN HISTORY</div>
        </header>
        <div>
          {runs.slice(0, 15).map((r) => (
            <div
              key={r.id}
              className="px-4 py-2 flex items-center gap-4 border-b border-edge/40 last:border-0 text-[11.5px]"
            >
              <Chip tone={statusTone(r.status)}>{r.status ?? "unknown"}</Chip>
              <span className="tabular text-muted-foreground w-[150px] shrink-0">
                <Val>{r.startedAt ? formatDateTime(r.startedAt) : null}</Val>
              </span>
              <span className="text-muted-foreground w-[80px] shrink-0">
                <Val>{r.syncType}</Val>
              </span>
              <span className="tabular w-[110px] shrink-0">
                {r.recordsRead === null ? "" : `${formatNumber(r.recordsRead)} read`}
              </span>
              <span className="tabular w-[120px] shrink-0">
                {r.recordsMapped === null ? "" : `${formatNumber(r.recordsMapped)} mapped`}
              </span>
              <span className="min-w-0 truncate text-danger">{r.errorMessage ?? ""}</span>
            </div>
          ))}
          {runs.length === 0 && !isLoading && (
            <div className="px-4 py-8 text-center text-[12px] text-muted-foreground/70">
              No sync history available
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  format,
}: {
  label: string;
  value: number | null;
  tone?: "warn";
  format?: (n: number) => string;
}) {
  return (
    <div className="rounded-[8px] border border-edge/70 bg-[var(--surface-2)] px-3 py-2">
      <div className="mono-label !text-[7.5px] !text-muted-foreground/60 truncate">{label}</div>
      <div
        className={cn(
          "mt-1 tabular text-[15px] leading-none",
          tone === "warn" && value !== null && value > 0 && "text-warn",
        )}
      >
        {value === null ? (
          <span className="text-muted-foreground/45 text-[13px]">—</span>
        ) : format ? (
          format(value)
        ) : (
          formatNumber(value)
        )}
      </div>
    </div>
  );
}