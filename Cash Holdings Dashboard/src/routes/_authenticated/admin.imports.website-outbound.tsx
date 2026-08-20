import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Copy, Download, Loader2, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cashHoldingsSupabase as supabase } from "@/integrations/cash-holdings/client";
import { Surface } from "@/components/ui-bits";

export const Route = createFileRoute("/_authenticated/admin/imports/website-outbound")({
  head: () => ({
    meta: [
      { title: "Website Outbound Import — Cash Holdings" },
      {
        name: "description",
        content:
          "Owner-only dry run for the website outbound CRM import: validation results, ambiguous matches and failed rows with zero database writes.",
      },
      { property: "og:title", content: "Website Outbound Import — Cash Holdings" },
      {
        property: "og:description",
        content: "Owner-only validation dry run for the website outbound CRM import.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebsiteOutboundImportPage,
});

const FUNCTION_NAME = "website-outbound-crm-dryrun";

type DryRunRow = Record<string, unknown>;

type DryRunResult = {
  ok?: boolean;
  dry_run?: boolean;
  summary?: Record<string, unknown> | null;
  valid?: DryRunRow[];
  ambiguous?: DryRunRow[];
  failed?: DryRunRow[];
  [key: string]: unknown;
};

/** The deployed function owns the contract; we read only fields it actually returns. */
function resultsOf(payload: DryRunResult | null): Record<string, unknown> {
  if (!payload) return {};
  const r = payload["results"];
  return (r && typeof r === "object" ? r : payload) as Record<string, unknown>;
}

/** Returns the array at `key`, or null when the payload has no such array at all. */
function readRows(payload: DryRunResult | null, key: string): DryRunRow[] | null {
  if (!payload) return null;
  const v = resultsOf(payload)[key] ?? (payload as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as DryRunRow[]) : null;
}

/** Reads `results.counts.<key>`; null when absent. */
function readCount(payload: DryRunResult | null, key: string): number | null {
  if (!payload) return null;
  const results = resultsOf(payload);
  const counts = (results["counts"] ?? (payload as Record<string, unknown>)["counts"] ?? {}) as Record<
    string,
    unknown
  >;
  const v = counts[key] ?? results[key];
  return typeof v === "number" ? v : null;
}

function readNumberMap(payload: DryRunResult | null, key: string): Record<string, number> | null {
  if (!payload) return null;
  const v = resultsOf(payload)[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "number") out[k] = val;
  }
  return out;
}

function WebsiteOutboundImportPage() {
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const owner = useQuery({
    queryKey: ["auth", "is-owner"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: uid,
        _role: "owner",
      } as never);
      if (error) throw error;
      return data === true;
    },
  });

  const dryRun = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("No active session.");
      const { data, error } = await supabase.functions.invoke<DryRunResult>(FUNCTION_NAME, {
        body: { mode: "dry_run", commit: false },
      });
      if (error) throw error;
      return (data ?? {}) as DryRunResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success("Dry run complete — no records were written.");
    },
    onError: (e: unknown) => {
      setResult(null);
      toast.error(e instanceof Error ? e.message : "Dry run failed.");
    },
  });

  // ── Real payload fields only ──────────────────────────────────────────────
  const preview = readRows(result, "preview");
  const valid = preview ?? [];
  const ambiguousRows = readRows(result, "ambiguous_matches") ?? readRows(result, "ambiguous");
  const failedRows = readRows(result, "failed_rows") ?? readRows(result, "failed");
  const skippedRows = readRows(result, "skipped_rows") ?? readRows(result, "skipped");

  const insertCount = readCount(result, "inserted");
  const updateCount = readCount(result, "updated");
  const skippedCount = readCount(result, "skipped");
  const ambiguousCount = readCount(result, "ambiguous") ?? ambiguousRows?.length ?? null;
  const failedCount = readCount(result, "failed") ?? failedRows?.length ?? null;

  // `preview` carries no per-row action flag, so only attribute rows when the
  // counts make the split unambiguous.
  const insertRows = preview
    ? updateCount === 0
      ? preview
      : insertCount === 0
        ? []
        : preview
    : null;
  const insertNote =
    preview && (insertCount ?? 0) > 0 && (updateCount ?? 0) > 0
      ? "The response does not label preview rows per action, so inserts and updates cannot be attributed row-by-row. All preview rows are listed."
      : undefined;
  const updateRows = preview
    ? insertCount === 0
      ? preview
      : updateCount === 0
        ? []
        : preview
    : null;
  const updateNote = insertNote;

  const tierTotals = readNumberMap(result, "tier_totals");
  const stageTotals = readNumberMap(result, "stage_totals");
  const expected = readNumberMap(result, "expected");

  const idempotencyKeys = (preview ?? [])
    .map((r) => r?.["deterministic_event_idempotency_key"])
    .filter((k): k is string => typeof k === "string");
  const keyCounts = idempotencyKeys.reduce<Record<string, number>>((acc, k) => {
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const duplicateRows = preview
    ? Object.entries(keyCounts)
        .filter(([, n]) => n > 1)
        .map(([key, n]) => ({ idempotency_key: key, occurrences: n }))
    : null;

  const processed = (() => {
    if (!result) return 0;
    const results = resultsOf(result);
    const s = (result.summary ?? results) as Record<string, unknown>;
    for (const k of ["processed", "processedRows", "rows", "rowCount", "total"]) {
      const v = s[k] ?? results[k];
      if (typeof v === "number") return v;
    }
    return valid.length;
  })();

  const raw = result ? JSON.stringify(result, null, 2) : "";

  function copyRaw() {
    navigator.clipboard.writeText(raw).then(
      () => toast.success("Raw JSON copied."),
      () => toast.error("Copy failed."),
    );
  }

  function downloadRaw() {
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `website-outbound-dryrun-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (owner.isLoading) {
    return (
      <div className="grid place-items-center py-24 text-muted-foreground text-[12px]">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (owner.data !== true) {
    return (
      <Surface className="max-w-xl" title="Restricted">
        <div className="flex gap-3 items-start pt-2">
          <ShieldAlert className="h-4 w-4 text-[color:var(--danger,#e5484d)] mt-0.5 shrink-0" />
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            This import console is owner-only. Your account does not hold the{" "}
            <span className="font-mono">owner</span> role
            {owner.isError ? " (role check failed)" : ""}.
          </p>
        </div>
      </Surface>
    );
  }

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mono-label !text-[9px] text-muted-foreground/70">
            SYSTEM / IMPORTS
          </div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">
            Website Outbound CRM Import
          </h1>
          <p className="text-[12px] text-muted-foreground mt-1">
            Validation dry run only. No rows are inserted, updated or deleted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconBtn onClick={copyRaw} label="Copy JSON" disabled={!result}>
            <Copy className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn onClick={downloadRaw} label="Download JSON" disabled={!result}>
            <Download className="h-3.5 w-3.5" />
          </IconBtn>
          <button
            onClick={() => dryRun.mutate()}
            disabled={dryRun.isPending}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-[var(--accent-solid,var(--surface-3))] text-[12.5px] font-medium hover:opacity-90 disabled:opacity-50 motion-micro"
          >
            {dryRun.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run Dry Run
          </button>
          <button
            disabled
            title="Production import stays disabled until the dry run is signed off."
            className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] border border-[var(--edge,rgba(255,255,255,0.08))] text-[12.5px] text-muted-foreground opacity-60 cursor-not-allowed"
          >
            Run Production Import
          </button>
        </div>
      </div>

      <Surface title="Status">
        <dl className="grid sm:grid-cols-3 gap-x-6 gap-y-2 pt-2">
          <StatusRow label="AUTHENTICATED" value="Yes — active session" ok />
          <StatusRow label="OWNER AUTHORIZATION" value="Granted (has_role owner)" ok />
          <StatusRow
            label="SOURCE WORKBOOK"
            value={
              dryRun.isPending
                ? "Reading…"
                : result
                  ? `Read by function — ${processed} rows processed`
                  : "Resolved server-side on run"
            }
            ok={Boolean(result)}
          />
        </dl>
        <p className="text-[11.5px] text-muted-foreground mt-3 leading-relaxed">
          Production import is disabled pending explicit approval. This console can only execute the
          zero-write validation dry run.
        </p>
      </Surface>

      {dryRun.isError && (
        <Surface title="Dry run failed">
          <div className="flex gap-3 items-start pt-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--warning,#f5a623)]" />
            <pre className="text-[11.5px] font-mono whitespace-pre-wrap text-muted-foreground">
              {dryRun.error instanceof Error ? dryRun.error.message : "Unknown error"}
            </pre>
          </div>
        </Surface>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="PROCESSED ROWS" value={processed} />
            <Stat label="PROPOSED INSERTS" value={insertCount} />
            <Stat label="PROPOSED UPDATES" value={updateCount} />
            <Stat label="SKIPPED" value={skippedCount} />
            <Stat label="VALID ROWS" value={valid.length} />
            <Stat label="AMBIGUOUS" value={ambiguousCount} />
            <Stat label="FAILED" value={failedCount} />
            <Stat label="DB WRITES" value={0} />
          </div>

          {(() => {
            const results = (result["results"] ?? {}) as Record<string, unknown>;
            const summary =
              (result.summary as Record<string, unknown> | null | undefined) ??
              (result["checks"] as Record<string, unknown> | undefined) ??
              (results["counts"] as Record<string, unknown> | undefined);
            if (!summary || typeof summary !== "object") return null;
            return (
            <Surface title="Summary">
              <dl className="grid sm:grid-cols-3 gap-x-6 gap-y-2 pt-2">
                {Object.entries(summary).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 min-w-0">
                    <dt className="mono-label !text-[9px] truncate">{k}</dt>
                    <dd className="text-[12.5px] font-medium tabular-nums truncate">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Surface>
            );
          })()}

          <RowTable
            title="Proposed inserts"
            rows={insertRows}
            count={insertCount}
            note={insertNote}
            empty="Zero proposed inserts."
          />
          <RowTable
            title="Proposed updates"
            rows={updateRows}
            count={updateCount}
            note={updateNote}
            empty="Zero proposed updates."
          />
          <RowTable
            title="Skipped rows"
            rows={skippedRows}
            count={skippedCount}
            empty="Zero skipped rows."
            absentNote="The response reports a skipped count only — it returns no skipped-row detail."
          />
          <RowTable
            title="Ambiguous matches"
            rows={ambiguousRows}
            count={ambiguousCount}
            empty="Zero ambiguous matches."
          />
          <RowTable
            title="Failed rows"
            rows={failedRows}
            count={failedCount}
            empty="Zero failed rows."
          />
          <TotalsTable
            title="Tier validation"
            actual={tierTotals}
            expected={expected}
            keys={["tier1", "tier2", "tier3"]}
          />
          <TotalsTable
            title="Status validation"
            actual={stageTotals}
            expected={expected}
            keys={["ready", "research_needed", "other"]}
          />
          <RowTable
            title="Duplicate / idempotency findings"
            rows={duplicateRows}
            count={duplicateRows?.length ?? null}
            note={
              duplicateRows
                ? `${idempotencyKeys.length} deterministic idempotency keys inspected across preview rows.`
                : undefined
            }
            empty="No repeated idempotency keys."
            absentNote="No preview rows returned, so idempotency keys could not be inspected."
          />
          <RowTable
            title="Valid rows (preview)"
            rows={preview}
            count={preview?.length ?? null}
            empty="No valid rows returned."
          />

          <Surface
            title="Raw response"
            action={
              <>
                <IconBtn onClick={copyRaw} label="Copy JSON">
                  <Copy className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn onClick={downloadRaw} label="Download JSON">
                  <Download className="h-3.5 w-3.5" />
                </IconBtn>
                <button
                  onClick={() => setRawOpen((v) => !v)}
                  className="mono-label !text-[9px] px-2 h-7 rounded hover:bg-[var(--surface-3)] motion-micro"
                >
                  {rawOpen ? "HIDE" : "SHOW"}
                </button>
              </>
            }
          >
            {rawOpen && (
              <pre className="mt-2 max-h-[420px] overflow-auto text-[11px] font-mono leading-relaxed rounded-[10px] bg-[var(--surface-2)] p-3">
                {raw}
              </pre>
            )}
          </Surface>
        </>
      )}

      {!result && !dryRun.isPending && !dryRun.isError && (
        <Surface>
          <p className="text-[12.5px] text-muted-foreground pt-2">
            Run the dry run to validate the staged outbound workbook. Results appear here.
          </p>
        </Surface>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="surface rounded-[12px] px-4 py-3">
      <div className="mono-label !text-[9px] text-muted-foreground/70">{label}</div>
      <div className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]">
        {value == null ? "—" : value}
      </div>
    </div>
  );
}

function TotalsTable({
  title,
  actual,
  expected,
  keys,
}: {
  title: string;
  actual: Record<string, number> | null;
  expected: Record<string, number> | null;
  keys: string[];
}) {
  if (!actual) {
    return (
      <Surface title={title}>
        <p className="text-[12px] text-muted-foreground pt-2">
          The response does not report totals for this check.
        </p>
      </Surface>
    );
  }
  const present = keys.filter((k) => typeof actual[k] === "number");
  const mismatches = present.filter(
    (k) => typeof expected?.[k] === "number" && expected[k] !== actual[k],
  );
  return (
    <Surface title={title} subtitle={mismatches.length ? `${mismatches.length} mismatch` : "OK"}>
      <dl className="grid sm:grid-cols-3 gap-x-6 gap-y-2 pt-2">
        {present.map((k) => {
          const exp = expected?.[k];
          const mismatch = typeof exp === "number" && exp !== actual[k];
          return (
            <div key={k} className="flex items-baseline justify-between gap-3 min-w-0">
              <dt className="mono-label !text-[9px] truncate">{k}</dt>
              <dd
                className={`text-[12.5px] font-medium tabular-nums truncate ${
                  mismatch ? "text-[color:var(--warning,#f5a623)]" : ""
                }`}
              >
                {actual[k]}
                {typeof exp === "number" ? ` / expected ${exp}` : ""}
              </dd>
            </div>
          );
        })}
      </dl>
    </Surface>
  );
}

function IconBtn({
  onClick,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] disabled:opacity-40 disabled:hover:bg-transparent motion-micro"
    >
      {children}
    </button>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 min-w-0">
      <dt className="mono-label !text-[9px] truncate">{label}</dt>
      <dd
        className={`text-[12px] font-medium truncate ${ok ? "" : "text-muted-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function RowTable({
  title,
  rows,
  empty,
  count,
  note,
  absentNote,
}: {
  title: string;
  rows: DryRunRow[] | null;
  empty: string;
  count?: number | null;
  note?: string;
  absentNote?: string;
}) {
  const list = rows ?? [];
  const columns = Array.from(
    list.slice(0, 25).reduce<Set<string>>((set, r) => {
      Object.keys(r ?? {}).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  ).slice(0, 8);

  return (
    <Surface
      title={title}
      subtitle={count == null ? `${list.length}` : `${count}`}
      flush
    >
      {note && <p className="px-5 pt-1 text-[11.5px] text-muted-foreground">{note}</p>}
      {rows === null ? (
        <p className="px-5 pb-4 pt-1 text-[12px] text-muted-foreground">
          {absentNote ?? "The response does not return row detail for this section."}
        </p>
      ) : list.length === 0 ? (
        <p className="px-5 pb-4 pt-1 text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-auto max-h-[380px]">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 chrome-blur">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="text-left mono-label !text-[8.5px] font-normal px-4 py-2 whitespace-nowrap"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} className="edge-t align-top">
                  {columns.map((c) => {
                    const v = r?.[c];
                    return (
                      <td key={c} className="px-4 py-2 max-w-[240px] truncate">
                        {v == null
                          ? "—"
                          : typeof v === "object"
                            ? JSON.stringify(v)
                            : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Surface>
  );
}