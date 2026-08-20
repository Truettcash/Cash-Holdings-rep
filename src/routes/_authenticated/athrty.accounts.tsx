import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { athrtyRecordsQuery } from "@/lib/athrty/queries";
import {
  applyFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  options,
  sortRecords,
  type AthrtyFilters,
  type SortKey,
} from "@/lib/athrty/filters";
import {
  brandLabel,
  interestTone,
  openValue,
  stageLabel,
  stageTone,
  type AthrtyRecord,
} from "@/lib/athrty/model";
import { formatCurrency, formatNumber } from "@/lib/domain";
import { Chip, DueDate, ErrorNote, TableSkeleton, Val } from "@/components/athrty/bits";
import { AccountInspector } from "@/components/athrty/inspector";
import { useJarvisSelection } from "@/lib/jarvis/context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/athrty/accounts")({
  head: () => ({
    meta: [
      { title: "ATHRTY Accounts — Cash Holdings" },
      {
        name: "description",
        content:
          "Search, filter and inspect every ATHRTY outbound account with full SharePoint source provenance.",
      },
      { property: "og:title", content: "ATHRTY Accounts — Cash Holdings" },
      {
        property: "og:description",
        content: "The ATHRTY outbound account book with filters, sorting and source trace.",
      },
    ],
  }),
  component: AthrtyAccounts,
});

const PAGE_SIZE = 50;

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "company", label: "Company" },
  { key: "brand", label: "Brand" },
  { key: "tier", label: "Tier" },
  { key: "market", label: "Market" },
  { key: "stage", label: "Stage" },
  { key: "callStatus", label: "Call status" },
  { key: "attempts", label: "Att", className: "text-right" },
  { key: "interest", label: "Interest" },
  { key: "nextActionDate", label: "Next action" },
  { key: "owner", label: "Owner" },
];

function AthrtyAccounts() {
  const { data: records, isLoading, error } = useQuery(athrtyRecordsQuery());
  const [filters, setFilters] = useState<AthrtyFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "company",
    dir: "asc",
  });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AthrtyRecord | null>(null);
  // Jarvis inherits the operator's current selection; nothing is invented.
  useJarvisSelection(
    selected
      ? {
          entityType: "athrty_account",
          entityId: selected.id,
          account: selected.company ?? undefined,
        }
      : null,
  );

  const all = records ?? [];
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  const sorted = useMemo(() => sortRecords(filtered, sort.key, sort.dir), [filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const rows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const filteredValue = useMemo(
    () => filtered.reduce((sum, r) => sum + openValue(r), 0),
    [filtered],
  );

  useEffect(() => {
    setPage(0);
  }, [filters, sort]);

  const set = <K extends keyof AthrtyFilters>(key: K, value: AthrtyFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  if (error) return <ErrorNote error={error} />;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
          <input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search company, account ID, contact, phone…"
            className="w-full h-8 pl-8 pr-8 rounded-[9px] bg-[var(--surface-2)] border border-transparent focus:border-edge-strong text-[12px] focus:outline-none motion-micro"
          />
          {filters.q && (
            <button
              onClick={() => set("q", "")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select
          label="Brand"
          value={filters.brand}
          onChange={(v) => set("brand", v)}
          values={options(all, (r) => r.canonicalBrand)}
          render={(v) => brandLabel(v)}
        />
        <Select
          label="Stage"
          value={filters.stage}
          onChange={(v) => set("stage", v)}
          values={options(all, (r) => r.stage)}
          render={(v) => stageLabel(v)}
        />
        <Select
          label="Tier"
          value={filters.tier}
          onChange={(v) => set("tier", v)}
          values={options(all, (r) => r.tier)}
        />
        <Select
          label="Market"
          value={filters.market}
          onChange={(v) => set("market", v)}
          values={options(all, (r) => r.market)}
        />
        <Select
          label="Call status"
          value={filters.callStatus}
          onChange={(v) => set("callStatus", v)}
          values={options(all, (r) => r.callStatus)}
        />
        <Select
          label="Interest"
          value={filters.interest}
          onChange={(v) => set("interest", v)}
          values={options(all, (r) => r.interest)}
        />
        <Select
          label="Owner"
          value={filters.owner}
          onChange={(v) => set("owner", v)}
          values={options(all, (r) => r.owner)}
        />
        <Select
          label="Contact"
          value={filters.contact}
          onChange={(v) => set("contact", v as AthrtyFilters["contact"])}
          values={["present", "missing"]}
          render={(v) => (v === "present" ? "Named contact" : "No contact")}
        />
        <Select
          label="Due"
          value={filters.due}
          onChange={(v) => set("due", v as AthrtyFilters["due"])}
          values={["overdue", "today", "upcoming", "none"]}
        />
        <Select
          label="Changed"
          value={filters.modified}
          onChange={(v) => set("modified", v as AthrtyFilters["modified"])}
          values={["7d", "30d"]}
          render={(v) => (v === "7d" ? "Last 7 days" : "Last 30 days")}
        />
        {hasActiveFilters(filters) && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="h-8 px-2.5 rounded-[9px] text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-[var(--surface-2)] motion-micro"
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="mono-label !text-[8px] !text-muted-foreground/60">
          {formatNumber(filtered.length)} OF {formatNumber(all.length)} ACCOUNTS · OPEN{" "}
          {formatCurrency(filteredValue)}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="h-7 px-2.5 rounded-[7px] text-[11.5px] border border-edge disabled:opacity-40 hover:bg-[var(--surface-2)] motion-micro"
          >
            Prev
          </button>
          <span className="mono-label !text-[8px] !text-muted-foreground/60 px-1">
            {page + 1} / {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="h-7 px-2.5 rounded-[7px] text-[11.5px] border border-edge disabled:opacity-40 hover:bg-[var(--surface-2)] motion-micro"
          >
            Next
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[10px] border border-edge bg-[var(--surface-1)] overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={12} cols={9} />
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-[13px]">No accounts match these filters</div>
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              Adjust the search or reset the filters.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="edge-b">
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        className={cn(
                          "px-3 h-8 text-left align-middle whitespace-nowrap",
                          c.className,
                        )}
                      >
                        <button
                          onClick={() => toggleSort(c.key)}
                          className={cn(
                            "mono-label !text-[8px] inline-flex items-center gap-1 motion-micro",
                            active ? "!text-foreground" : "!text-muted-foreground/60 hover:!text-foreground",
                          )}
                        >
                          {c.label}
                          {active &&
                            (sort.dir === "asc" ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            ))}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-b border-edge/40 last:border-0 hover:bg-[var(--surface-2)] cursor-pointer motion-micro"
                  >
                    <td className="px-3 py-[7px] max-w-[240px]">
                      <div className="text-[12.5px] truncate">
                        <Val>{r.company}</Val>
                      </div>
                      <div className="text-[10.5px] text-muted-foreground/70 truncate">
                        {r.contact?.name ?? "No named contact"}
                      </div>
                    </td>
                    <td className="px-3 py-[7px] text-[11.5px] whitespace-nowrap">
                      {r.canonicalBrand ? brandLabel(r.canonicalBrand) : <Val>{null}</Val>}
                    </td>
                    <td className="px-3 py-[7px] text-[11.5px] whitespace-nowrap">
                      <Val>{r.tier}</Val>
                    </td>
                    <td className="px-3 py-[7px] text-[11.5px] whitespace-nowrap max-w-[160px] truncate">
                      <Val>{r.market ?? r.city}</Val>
                    </td>
                    <td className="px-3 py-[7px] whitespace-nowrap">
                      <Chip tone={stageTone(r.stage)}>{stageLabel(r.stage)}</Chip>
                    </td>
                    <td className="px-3 py-[7px] text-[11.5px] whitespace-nowrap">
                      <Val>{r.callStatus}</Val>
                    </td>
                    <td className="px-3 py-[7px] text-right tabular text-[11.5px]">
                      <Val>{r.attempts === null ? null : r.attempts}</Val>
                    </td>
                    <td className="px-3 py-[7px] whitespace-nowrap">
                      {r.interest ? (
                        <Chip tone={interestTone(r.interest)}>{r.interest}</Chip>
                      ) : (
                        <Val>{null}</Val>
                      )}
                    </td>
                    <td className="px-3 py-[7px] text-[11.5px] whitespace-nowrap">
                      <DueDate iso={r.nextActionDate} />
                    </td>
                    <td className="px-3 py-[7px] text-[11.5px] whitespace-nowrap max-w-[140px] truncate">
                      <Val>{r.owner}</Val>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AccountInspector record={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  values,
  render,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  values: string[];
  render?: (v: string) => string;
}) {
  if (values.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn(
        "h-8 max-w-[168px] px-2 rounded-[9px] border text-[11.5px] focus:outline-none motion-micro truncate",
        value === "all"
          ? "bg-[var(--surface-2)] border-transparent text-muted-foreground"
          : "bg-teal-soft border-teal/30 text-foreground",
      )}
    >
      <option value="all">{label}: All</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {render ? render(v) : v}
        </option>
      ))}
    </select>
  );
}