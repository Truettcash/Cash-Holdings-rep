import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Kpi, KpiBand, Segmented, SkeletonRows, StatusPill } from "@/components/ui-bits";
import { formatDate, relativeTime, titleCase } from "@/lib/domain";
import { cn } from "@/lib/utils";
import {
  EngagementActivityRail,
  EngagementCenterPane,
  EngagementDetail,
  useEngagementDetail,
} from "@/components/engagements/engagement-detail";
import {
  ENGAGEMENT_BRANDS,
  brandLabel,
  qualificationTier,
} from "@/lib/engagements/domain";
import { bookingEventsQuery, engagementsQuery } from "@/lib/engagements/queries";
import { bookedIdSet, computeEngagementMetrics } from "@/lib/engagements/metrics";
import type { BrandFilterValue, EngagementListRow, QualificationTier } from "@/lib/engagements/types";

type Search = { brand?: BrandFilterValue; from?: string; to?: string; id?: string };

export const Route = createFileRoute("/_authenticated/engagements")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    brand:
      search.brand === "authority-systems" || search.brand === "truett-cash"
        ? search.brand
        : "all",
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: EngagementsPage,
  head: () => ({
    meta: [
      { title: "Engagements · Cash Holdings Console" },
      {
        name: "description",
        content:
          "Shared intake pipeline for Authority Systems and Truett Cash engagements: qualification, pipeline stage, booking and full event history.",
      },
      { property: "og:title", content: "Engagements · Cash Holdings Console" },
      {
        property: "og:description",
        content: "Operator view of the shared engagement intake pipeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const BRAND_TABS: { value: BrandFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "authority-systems", label: ENGAGEMENT_BRANDS["authority-systems"].label },
  { value: "truett-cash", label: ENGAGEMENT_BRANDS["truett-cash"].label },
];

const TIER_TABS: { value: "all" | QualificationTier; label: string }[] = [
  { value: "all", label: "All" },
  { value: "priority", label: "Priority" },
  { value: "qualified", label: "Qualified" },
  { value: "nurture", label: "Nurture" },
  { value: "unscored", label: "Unscored" },
];

const BOOKING_TABS: { value: "all" | "confirmed" | "unbooked"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Booked" },
  { value: "unbooked", label: "Unbooked" },
];

function EngagementsPage() {
  const { brand = "all", from, to, id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<"all" | QualificationTier>("all");
  const [bookingFilter, setBookingFilter] = useState<"all" | "confirmed" | "unbooked">("all");
  const centerRef = useRef<HTMLDivElement>(null);

  const filters = { brand, from: from ?? null, to: to ?? null };
  const engagements = useQuery(engagementsQuery(filters));
  const bookings = useQuery(bookingEventsQuery());

  const rows: EngagementListRow[] = engagements.data ?? [];
  const booked = useMemo(() => bookedIdSet(bookings.data ?? []), [bookings.data]);
  const metrics = useMemo(
    () => computeEngagementMetrics(rows, booked, brandLabel),
    [rows, booked]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tier !== "all" && qualificationTier(r.qualification_score) !== tier) return false;
      const isBooked = booked.has(r.id);
      if (bookingFilter === "confirmed" && !isBooked) return false;
      if (bookingFilter === "unbooked" && isBooked) return false;
      if (!q) return true;
      return [r.company_name, r.contact_name, r.email, r.project_type, r.status, r.pipeline_stage]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, tier, bookingFilter, booked]);

  const current: Search = { brand, from, to, id };
  const setSearch = (patch: Partial<Search>) =>
    navigate({ to: "/engagements", search: { ...current, ...patch } });

  const select = (rowId: string) => setSearch({ id: rowId });
  const close = () => setSearch({ id: undefined });

  // Keyboard navigation: ArrowUp/Down move selection, Enter focuses detail pane.
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (!visible.length) return;
    const idx = visible.findIndex((r) => r.id === id);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = visible[Math.min(idx + 1, visible.length - 1)] ?? visible[0];
      select(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = visible[Math.max(idx - 1, 0)] ?? visible[0];
      select(prev.id);
    } else if (e.key === "Enter") {
      if (idx === -1 && visible[0]) select(visible[0].id);
      centerRef.current?.focus();
    }
  };

  const detailState = useEngagementDetail(id ?? "");

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mono-label !text-[9px]">GROW / INTAKE PIPELINE</div>
          <h1 className="text-[20px] font-semibold tracking-tight leading-none mt-1">Engagements</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from ?? ""}
            onChange={(e) => setSearch({ from: e.target.value || undefined })}
            className="h-6 bg-[var(--surface-2)] border border-edge rounded px-1.5 text-[11px] font-sans"
            aria-label="From date"
          />
          <input
            type="date"
            value={to ?? ""}
            onChange={(e) => setSearch({ to: e.target.value || undefined })}
            className="h-6 bg-[var(--surface-2)] border border-edge rounded px-1.5 text-[11px] font-sans"
            aria-label="To date"
          />
        </div>
      </header>

      {/* METRICS — decision-relevant only */}
      <KpiBand>
        <Kpi label="NEW" value={metrics.newEngagements} />
        <Kpi label="SCHEDULED REVIEWS" value={metrics.scheduledReviews} />
        <Kpi label="QUALIFIED" value={metrics.qualified} tone="teal" />
        <Kpi label="INTAKE → BOOKING" value={`${Math.round(metrics.conversion * 100)}%`} />
        <Kpi
          label="AVG QUAL SCORE"
          value={metrics.avgScore === null ? "—" : metrics.avgScore.toFixed(1)}
        />
        <Kpi label="TOTAL" value={metrics.total} />
      </KpiBand>

      {/* THREE-PANE WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px] gap-3 items-start">
        {/* LEFT — filters + index list */}
        <section className="surface rounded-[10px] overflow-hidden flex flex-col lg:h-[calc(100vh-190px)]">
          <div className="p-2.5 space-y-2 edge-b shrink-0">
            <Segmented value={brand} onChange={(v) => setSearch({ brand: v })} options={BRAND_TABS} size="xs" className="w-full flex" />
            <Segmented value={tier} onChange={setTier} options={TIER_TABS} size="xs" className="w-full flex flex-wrap" />
            <Segmented value={bookingFilter} onChange={setBookingFilter} options={BOOKING_TABS} size="xs" className="w-full flex" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full h-7 bg-[var(--surface-2)] border border-edge rounded px-2 text-[11.5px] motion-micro"
            />
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 edge-b shrink-0">
            <span className="mono-label !text-[8.5px]">ENGAGEMENTS</span>
            <span className="mono-label !text-[8.5px] text-foreground/60">{visible.length}</span>
          </div>
          <div
            role="listbox"
            tabIndex={0}
            onKeyDown={onListKeyDown}
            aria-label="Engagement list"
            className="flex-1 min-h-0 overflow-y-auto outline-none"
          >
            {engagements.isLoading ? (
              <SkeletonRows rows={8} className="p-2.5" />
            ) : engagements.isError ? (
              <EmptyState title="UNABLE TO READ ENGAGEMENTS" hint={(engagements.error as Error).message} />
            ) : visible.length === 0 ? (
              <EmptyState title="NO ENGAGEMENTS" hint="No intake records match the current filters." />
            ) : (
              <ul>
                {visible.map((r) => {
                  const isBooked = booked.has(r.id);
                  const active = id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        role="option"
                        aria-selected={active}
                        onClick={() => select(r.id)}
                        className={cn(
                          "w-full text-left px-2.5 py-2 edge-b motion-micro surface-interactive",
                          active && "surface-selected"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12.5px] font-medium truncate">
                            {r.company_name ?? r.contact_name ?? r.email ?? "Untitled"}
                          </span>
                          <span className="mono-label !text-[8px] shrink-0">{brandLabel(r.brand_key).slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <StatusPill status={r.status ?? "unset"} tone="neutral" />
                          <StatusPill status={r.pipeline_stage ?? "unset"} tone="teal" />
                          {isBooked && <StatusPill status="booked" tone="success" />}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
                          <span className="tabular">
                            score {r.qualification_score ?? "—"} · {qualificationTier(r.qualification_score).slice(0, 4)}
                          </span>
                          <span className="tabular">{relativeTime(r.created_at)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* CENTER + RIGHT — desktop inline panes */}
        {id ? (
          <>
            <div
              ref={centerRef}
              tabIndex={-1}
              className="hidden lg:block surface rounded-[10px] overflow-y-auto lg:h-[calc(100vh-190px)] outline-none motion-panel"
            >
              <EngagementCenterPane state={detailState} />
            </div>
            <div className="hidden lg:block surface rounded-[10px] overflow-y-auto lg:h-[calc(100vh-190px)] motion-panel">
              <EngagementActivityRail state={detailState} />
            </div>
          </>
        ) : (
          <>
            <div className="hidden lg:grid surface rounded-[10px] place-items-center lg:h-[calc(100vh-190px)]">
              <EmptyState title="SELECT AN ENGAGEMENT" hint="Choose a record from the list to view its brief." />
            </div>
            <div className="hidden lg:grid surface rounded-[10px] place-items-center lg:h-[calc(100vh-190px)]">
              <EmptyState title="NO ACTIVITY" hint="Timeline appears once an engagement is selected." />
            </div>
          </>
        )}
      </div>

      {/* MOBILE — full-height detail sheet */}
      {id && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col">
          <div
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm ch-fade-in"
            onClick={close}
            aria-hidden
          />
          <div className="relative mt-auto h-[92vh] w-full chrome-blur ch-sheet-in rounded-t-2xl overflow-hidden flex flex-col">
            <EngagementDetail id={id} onClose={close} />
          </div>
        </div>
      )}
    </div>
  );
}
