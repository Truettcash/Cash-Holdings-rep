import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, X } from "lucide-react";
import { EmptyState, Field, StatusPill } from "@/components/ui-bits";
import { formatDate, formatDateTime, relativeTime, titleCase } from "@/lib/domain";
import { cn } from "@/lib/utils";
import {
  bookingStatusFromEvents,
  brandLabel,
  briefLabel,
  eventLabel,
  jsonList,
  jsonText,
  qualificationTier,
  secondaryPriority,
} from "@/lib/engagements/domain";
import { engagementEventsQuery, engagementQuery } from "@/lib/engagements/queries";
import {
  addEngagementNote,
  latestEventMetadata,
  setEngagementFollowUp,
  setEngagementNextAction,
  updateEngagementPipelineStage,
  updateEngagementStatus,
} from "@/lib/engagements/mutations";
import { timelineEvents } from "@/lib/engagements/domain";
import type { EngagementEventRow } from "@/lib/engagements/types";
import { analyticsRefresh } from "@/lib/analytics/invalidate";

const STATUS_OPTIONS = ["new", "in_review", "qualified", "scheduled", "won", "lost", "archived"];
const STAGE_OPTIONS = ["intake", "qualification", "scheduled", "proposal", "negotiation", "closed"];

/** Brand-aware field-group labels. Same structural shell, different emphasis. */
const BRAND_COPY: Record<
  string,
  { systemLabel: string; systemEmpty: string; briefTag: string; commercialLabel: string }
> = {
  "authority-systems": {
    systemLabel: "OPERATIONAL FRICTION & PROCESS",
    systemEmpty: "No process or systems scope captured.",
    briefTag: "BUSINESS OUTCOMES",
    commercialLabel: "BUSINESS CONTEXT",
  },
  "truett-cash": {
    systemLabel: "DELIVERABLES & FORMAT",
    systemEmpty: "No deliverables captured.",
    briefTag: "CREATIVE DIRECTION",
    commercialLabel: "PRODUCTION & TIMING",
  },
};
const DEFAULT_COPY = BRAND_COPY["authority-systems"];

export function useEngagementDetail(id: string) {
  const qc = useQueryClient();
  const detail = useQuery(engagementQuery(id));
  const events = useQuery(engagementEventsQuery(id));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["engagements"] });
    qc.invalidateQueries({ queryKey: ["engagement-events"] });
    analyticsRefresh.engagementCreated(qc);
    analyticsRefresh.bookingConfirmed(qc);
  };

  const statusMut = useMutation({
    mutationFn: (status: string) =>
      updateEngagementStatus({ id, status, previousStatus: detail.data?.status ?? null }),
    onSuccess: invalidate,
  });
  const stageMut = useMutation({
    mutationFn: (stage: string) =>
      updateEngagementPipelineStage({
        id,
        pipelineStage: stage,
        previousStage: detail.data?.pipeline_stage ?? null,
      }),
    onSuccess: invalidate,
  });
  const noteMut = useMutation({
    mutationFn: (value: string) => addEngagementNote({ id, note: value }),
    onSuccess: invalidate,
  });
  const actionMut = useMutation({
    mutationFn: (value: { nextAction: string; followUpDate: string | null }) =>
      setEngagementNextAction({
        id,
        nextAction: value.nextAction,
        followUpDate: value.followUpDate,
      }),
    onSuccess: invalidate,
  });
  const followUpMut = useMutation({
    mutationFn: (value: string) => setEngagementFollowUp({ id, followUpDate: value }),
    onSuccess: invalidate,
  });

  const row = detail.data;
  const evts: EngagementEventRow[] = events.data ?? [];
  const timeline = useMemo(() => timelineEvents(evts), [evts]);
  const booking = bookingStatusFromEvents(evts);
  const lastNote = latestEventMetadata(evts, "note_added");
  const lastAction = latestEventMetadata(evts, "next_action_set");
  const lastFollowUp = latestEventMetadata(evts, "follow_up_scheduled");

  return {
    isLoading: detail.isLoading,
    row,
    timeline,
    booking,
    lastNote,
    lastAction,
    lastFollowUp,
    statusMut,
    stageMut,
    noteMut,
    actionMut,
    followUpMut,
  };
}

export type EngagementDetailState = ReturnType<typeof useEngagementDetail>;

/** CENTER PANE — brief + current state. Same shell for both brands, different field emphasis. */
export function EngagementCenterPane({ state }: { state: EngagementDetailState }) {
  const { row, statusMut, stageMut } = state;
  const [rawOpen, setRawOpen] = useState(false);

  if (state.isLoading) {
    return (
      <div className="p-4 space-y-2" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-6 rounded bg-[var(--surface-2)] animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }
  if (!row) {
    return <EmptyState title="ENGAGEMENT NOT FOUND" hint="It may have been removed upstream." />;
  }

  const copy = BRAND_COPY[row.brand_key] ?? DEFAULT_COPY;
  const brief = row.operational_brief_json;
  const qual = row.qualification_details;
  const raw = row.raw_submission;
  const highlights = [
    ...jsonList(brief?.highlights),
    ...jsonList(brief?.objectives),
    ...jsonList(brief?.priorities),
  ].slice(0, 8);
  const commercial = [
    ...jsonList(brief?.commercial ?? brief?.commercial_context),
    jsonText(raw?.budget ?? raw?.budget_range ?? null) &&
      `budget: ${jsonText(raw?.budget ?? raw?.budget_range ?? null)}`,
    jsonText(raw?.timeline ?? null) && `timeline: ${jsonText(raw?.timeline ?? null)}`,
  ].filter((x): x is string => Boolean(x));
  const systemLines = [
    ...jsonList(brief?.scope),
    ...jsonList(brief?.system ?? brief?.project),
  ].slice(0, 8);

  return (
    <div className="p-3.5 space-y-3 ch-fade-in">
      {/* OVERVIEW / STATE */}
      <SectionPanel label="CURRENT STATE">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <label className="block min-w-0">
            <span className="mono-label !text-[8.5px]">STATUS</span>
            <select
              value={row.status ?? ""}
              onChange={(e) => statusMut.mutate(e.target.value)}
              className="mt-1 w-full h-7 bg-[var(--surface-2)] border border-edge rounded px-2 text-[12px] motion-micro"
            >
              <option value="">unset</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mono-label !text-[8.5px]">PIPELINE STAGE</span>
            <select
              value={row.pipeline_stage ?? ""}
              onChange={(e) => stageMut.mutate(e.target.value)}
              className="mt-1 w-full h-7 bg-[var(--surface-2)] border border-edge rounded px-2 text-[12px] motion-micro"
            >
              <option value="">unset</option>
              {STAGE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <Field label="Project type" value={titleCase(row.project_type ?? "—")} />
          <Field label="Secondary priority" value={secondaryPriority(raw) ?? "—"} />
        </div>
      </SectionPanel>

      {/* CONTACT + COMPANY */}
      <div className="grid sm:grid-cols-2 gap-3">
        <SectionPanel label="CONTACT">
          <div className="space-y-2">
            <Field label="Name" value={row.contact_name ?? "—"} />
            <Field label="Email" value={row.email ?? "—"} mono />
            <Field label="Phone" value={row.phone ?? "—"} mono />
            <Field label="Role" value={jsonText(raw?.role ?? null) ?? "—"} />
          </div>
        </SectionPanel>
        <SectionPanel label="COMPANY">
          <div className="space-y-2">
            <Field label="Company" value={row.company_name ?? "—"} />
            <Field label="Website" value={jsonText(raw?.website ?? null) ?? "—"} mono />
            <Field label="Brand" value={brandLabel(row.brand_key)} />
            <Field label="Created" value={formatDate(row.created_at)} mono />
          </div>
        </SectionPanel>
      </div>

      {/* BRAND-SPECIFIC EMPHASIS: process/systems vs deliverables/format */}
      <SectionPanel label={copy.systemLabel}>
        {systemLines.length ? (
          <ul className="space-y-1">
            {systemLines.map((l, i) => (
              <li key={i} className="text-[12.5px] text-foreground/90 leading-snug">
                · {l}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            {jsonText(raw?.message ?? raw?.notes ?? null) ?? copy.systemEmpty}
          </p>
        )}
      </SectionPanel>

      {/* BRIEF HIGHLIGHTS — business outcomes vs creative direction */}
      <SectionPanel label={`${briefLabel(row.brand_key).toUpperCase()} — ${copy.briefTag}`}>
        {jsonText(brief?.summary ?? brief?.overview ?? null) && (
          <p className="text-[12.5px] text-foreground/90 leading-snug mb-2">
            {jsonText(brief?.summary ?? brief?.overview ?? null)}
          </p>
        )}
        {highlights.length ? (
          <ul className="space-y-1">
            {highlights.map((h, i) => (
              <li key={i} className="text-[12.5px] text-foreground/90 leading-snug">
                · {h}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">No brief generated yet.</p>
        )}
      </SectionPanel>

      {/* COMMERCIAL / PRODUCTION CONTEXT */}
      <SectionPanel label={copy.commercialLabel}>
        {commercial.length ? (
          <ul className="space-y-1">
            {commercial.map((c, i) => (
              <li key={i} className="text-[12.5px] text-foreground/90 leading-snug">
                · {c}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">No commercial context captured.</p>
        )}
      </SectionPanel>

      {jsonList(qual?.reasons ?? qual?.signals).length > 0 && (
        <SectionPanel label="QUALIFICATION SIGNALS">
          <ul className="space-y-1">
            {jsonList(qual?.reasons ?? qual?.signals).map((r, i) => (
              <li key={i} className="text-[12px] text-muted-foreground leading-snug">
                · {r}
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      {/* RAW SUBMISSION */}
      <section className="border border-edge rounded-md">
        <button
          onClick={() => setRawOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left motion-micro"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", !rawOpen && "-rotate-90")}
          />
          <span className="mono-label !text-[9px]">RAW SUBMISSION · TECHNICAL</span>
        </button>
        {rawOpen && (
          <pre className="px-2.5 pb-2.5 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(raw ?? {}, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

/** RIGHT RAIL — activity timeline, next action, qualification, booking. */
export function EngagementActivityRail({ state }: { state: EngagementDetailState }) {
  const {
    row,
    timeline,
    booking,
    lastNote,
    lastAction,
    lastFollowUp,
    noteMut,
    actionMut,
    followUpMut,
  } = state;
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUp, setFollowUp] = useState("");

  if (state.isLoading) {
    return (
      <div className="p-3.5 space-y-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-6 rounded bg-[var(--surface-2)] animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }
  if (!row) return null;

  return (
    <div className="p-3.5 space-y-3 ch-fade-in">
      {/* QUALIFICATION */}
      <SectionPanel label="QUALIFICATION">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Field
            label="Score"
            value={
              row.qualification_score === null || row.qualification_score === undefined
                ? "—"
                : String(row.qualification_score)
            }
            mono
          />
          <Field
            label="Tier"
            value={<StatusPill status={qualificationTier(row.qualification_score)} tone="teal" />}
          />
        </div>
      </SectionPanel>

      {/* BOOKING */}
      <SectionPanel label="BOOKING">
        <Field
          label="Status"
          value={
            <StatusPill status={booking} tone={booking === "confirmed" ? "success" : "muted"} />
          }
        />
      </SectionPanel>

      {/* NEXT ACTION */}
      <SectionPanel label="NEXT ACTION">
        {jsonText(lastAction?.next_action ?? null) && (
          <p className="text-[11.5px] text-muted-foreground mb-1.5">
            Last: {lastAction?.next_action}
            {jsonText(lastAction?.follow_up_date ?? null)
              ? ` · due ${formatDate(String(lastAction?.follow_up_date))}`
              : ""}
          </p>
        )}
        <div className="space-y-1.5">
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Set next action…"
            className="w-full h-7 bg-[var(--surface-2)] border border-edge rounded px-2 text-[12px]"
          />
          <div className="flex gap-1.5">
            <input
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              className="flex-1 h-7 bg-[var(--surface-2)] border border-edge rounded px-2 text-[12px] tabular"
            />
            <ActionBtn
              disabled={
                (!nextAction.trim() && !followUp) || actionMut.isPending || followUpMut.isPending
              }
              onClick={() => {
                if (nextAction.trim()) {
                  actionMut.mutate({
                    nextAction: nextAction.trim(),
                    followUpDate: followUp || null,
                  });
                  setNextAction("");
                  setFollowUp("");
                } else if (followUp) {
                  followUpMut.mutate(followUp);
                  setFollowUp("");
                }
              }}
            >
              Save
            </ActionBtn>
          </div>
        </div>
        {jsonText(lastFollowUp?.follow_up_date ?? null) && (
          <p className="text-[11px] text-muted-foreground mt-1.5 tabular">
            Follow-up on record: {formatDate(String(lastFollowUp?.follow_up_date))}
          </p>
        )}
      </SectionPanel>

      {/* INTERNAL NOTE */}
      <SectionPanel label="INTERNAL NOTE">
        {jsonText(lastNote?.note ?? null) && (
          <p className="text-[11.5px] text-muted-foreground mb-1.5">Last: {lastNote?.note}</p>
        )}
        <div className="flex gap-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Append a note…"
            className="flex-1 h-7 bg-[var(--surface-2)] border border-edge rounded px-2 text-[12px]"
          />
          <ActionBtn
            disabled={!note.trim() || noteMut.isPending}
            onClick={() => {
              noteMut.mutate(note.trim());
              setNote("");
            }}
          >
            Append
          </ActionBtn>
        </div>
      </SectionPanel>

      {/* ACTIVITY — chronological feed, newest first, grouped by day */}
      <ActivityFeed events={timeline} />
    </div>
  );
}

/** Human-readable, day-grouped history of everything that happened. */
function ActivityFeed({ events }: { events: EngagementEventRow[] }) {
  const groups = useMemo(() => groupByDay(events), [events]);

  return (
    <SectionPanel label="ACTIVITY">
      {groups.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nothing has happened yet. Status changes, notes and bookings appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mono-label !text-[8.5px] mb-2">{g.label}</div>
              <ol className="space-y-3">
                {g.items.map((e) => (
                  <li key={e.id} className="flex gap-2.5">
                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-teal shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-foreground/90 leading-snug">
                        {eventSentence(e)}
                      </div>
                      <div className="text-[10.5px] font-sans text-muted-foreground mt-0.5">
                        {timeOfDay(e.created_at)} · {relativeTime(e.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

function timeOfDay(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function groupByDay(events: EngagementEventRow[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const label = (iso: string) => {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diff <= 0) return "Today";
    if (diff === 1) return "Yesterday";
    return formatDate(iso);
  };
  const ordered = events.slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const out: { label: string; items: EngagementEventRow[] }[] = [];
  for (const e of ordered) {
    const l = label(e.created_at);
    const last = out[out.length - 1];
    if (last && last.label === l) last.items.push(e);
    else out.push({ label: l, items: [e] });
  }
  return out;
}

/** Turns an event row into a plain sentence an operator can scan. */
function eventSentence(event: EngagementEventRow): string {
  const m = event.metadata ?? null;
  const from = m ? jsonText(m.from) : null;
  const to = m ? jsonText(m.to) : null;
  const note = m ? jsonText(m.note ?? null) : null;
  const next = m ? jsonText(m.next_action ?? null) : null;
  const follow = m ? jsonText(m.follow_up_date ?? null) : null;
  const assigned = m ? jsonText(m.assigned_to ?? null) : null;

  switch (event.event_type) {
    case "status_changed":
      return `Status moved from ${titleCase(from ?? "unset")} to ${titleCase(to ?? "unset")}.`;
    case "stage_changed":
    case "pipeline_stage_changed":
      return `Pipeline stage moved from ${titleCase(from ?? "unset")} to ${titleCase(to ?? "unset")}.`;
    case "note_added":
      return note ? `Note added — "${note}"` : "Note added.";
    case "next_action_set":
      return next ? `Next move set — ${next}` : "Next move updated.";
    case "follow_up_set":
      return follow ? `Follow-up scheduled for ${formatDate(follow)}.` : "Follow-up scheduled.";
    case "booking_confirmed":
      return "Discovery call confirmed.";
    case "assigned":
      return assigned ? `Assigned to ${assigned}.` : "Ownership assigned.";
    default: {
      const detail = [
        from || to ? `${from ?? "unset"} → ${to ?? "unset"}` : null,
        note,
        next,
        follow ? `due ${formatDate(follow)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return detail ? `${eventLabel(event.event_type)} — ${detail}` : eventLabel(event.event_type);
    }
  }
}

/** Mobile / narrow fallback: full detail with a Detail/Activity segmented toggle. */
export function EngagementDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const state = useEngagementDetail(id);
  const [tab, setTab] = useState<"detail" | "activity">("detail");
  const row = state.row;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-start gap-3 px-3.5 py-2.5 edge-b shrink-0">
        <div className="min-w-0">
          <div className="mono-label !text-[9px]">
            {row ? brandLabel(row.brand_key) : "ENGAGEMENT"}
          </div>
          <h2 className="text-[15px] font-semibold tracking-tight truncate">
            {row ? row.company_name || row.contact_name || row.email || "Engagement" : "Loading…"}
          </h2>
          {row && (
            <div className="text-[11px] text-muted-foreground font-sans mt-0.5">
              {formatDateTime(row.created_at)} · {relativeTime(row.created_at)}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-auto h-6 w-6 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] motion-micro"
          aria-label="Close engagement"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="px-3.5 py-2 edge-b shrink-0">
        <div
          role="tablist"
          className="inline-flex items-center gap-0.5 rounded-md p-0.5 bg-[var(--surface-2)] border border-edge"
        >
          {(["detail", "activity"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "motion-micro rounded px-2.5 h-[22px] text-[10px] font-sans uppercase tracking-[0.1em]",
                tab === t
                  ? "bg-[var(--surface-selected)] text-foreground shadow-[0_0_0_1px_var(--edge-strong)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "detail" ? "Detail" : "Activity"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "detail" ? (
          <EngagementCenterPane state={state} />
        ) : (
          <EngagementActivityRail state={state} />
        )}
      </div>
    </div>
  );
}

function EventMeta({ event }: { event: EngagementEventRow }) {
  const m = event.metadata;
  if (!m) return null;
  const parts: string[] = [];
  const from = jsonText(m.from);
  const to = jsonText(m.to);
  if (from || to) parts.push(`${from ?? "unset"} → ${to ?? "unset"}`);
  const note = jsonText(m.note ?? null);
  if (note) parts.push(note);
  const next = jsonText(m.next_action ?? null);
  if (next) parts.push(next);
  const follow = jsonText(m.follow_up_date ?? null);
  if (follow) parts.push(`due ${formatDate(follow)}`);
  const assigned = jsonText(m.assigned_to ?? null);
  if (assigned) parts.push(`assigned ${assigned}`);
  if (!parts.length) return null;
  return <div className="text-[11px] text-muted-foreground leading-snug">{parts.join(" · ")}</div>;
}

function SectionPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="surface rounded-[10px] px-3.5 py-3">
      <div className="mono-label !text-[8.5px] mb-1.5">{label}</div>
      {children}
    </section>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-7 px-2.5 rounded border border-teal/40 bg-teal-soft text-teal text-[10px] font-sans uppercase tracking-[0.06em] disabled:opacity-40 motion-micro shrink-0"
    >
      {children}
    </button>
  );
}
