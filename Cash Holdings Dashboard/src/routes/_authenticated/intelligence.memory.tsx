import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  acceptedConstraintsQuery,
  evidenceRequestsQuery,
  patternObservationsQuery,
  reviewEventsQuery,
} from "@/lib/cash-intelligence/queries";
import { absoluteTime, relativeTime } from "@/lib/cash-intelligence/normalize";
import { LEGACY_UNAUDITED_OBSERVATION_ID, type DurableObjectRecord } from "@/lib/cash-intelligence/types";
import {
  AuditEventRow,
  Confidence,
  EmptyState,
  EpistemicTag,
  EvidenceRefList,
  Field,
  LoadingRows,
  MissingState,
  Mono,
  Panel,
  ServiceState,
} from "@/components/intel/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/intelligence/memory")({
  component: DurableIntelligence,
});

type View = "patterns" | "constraints" | "requests" | "history";

const VIEWS: { id: View; label: string }[] = [
  { id: "patterns", label: "Patterns" },
  { id: "constraints", label: "Constraints" },
  { id: "requests", label: "Evidence Requests" },
  { id: "history", label: "History" },
];

function DurableIntelligence() {
  const [view, setView] = useState<View>("patterns");
  const observations = useQuery(patternObservationsQuery());
  const constraints = useQuery(acceptedConstraintsQuery());
  const requests = useQuery(evidenceRequestsQuery());
  const events = useQuery(reviewEventsQuery());

  const eventTraceRefs = new Set(
    (events.data ?? []).map((e) => `${e.targetRef ?? ""}|${e.traceId ?? ""}`),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "motion-micro h-7 rounded-[7px] border px-2.5 text-[11.5px]",
              view === v.id
                ? "border-teal/40 bg-teal-soft text-teal"
                : "border-edge bg-[var(--surface-2)] text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "patterns" && (
        <Panel
          title="PATTERNS"
          meta="what the organization now knows"
          actions={<EpistemicTag kind="derived" label="DURABLE" />}
        >
          {observations.isLoading ? (
            <LoadingRows rows={5} />
          ) : observations.error ? (
            <ServiceState error={observations.error} label="Pattern observations" />
          ) : (observations.data ?? []).length === 0 ? (
            <EmptyState title="No accepted patterns yet" />
          ) : (
            <div className="space-y-2">
              {(observations.data ?? []).map((o, i) => (
                <DurableCard
                  key={o.id ?? i}
                  record={o}
                  showDecision
                  unaudited={
                    o.id === LEGACY_UNAUDITED_OBSERVATION_ID ||
                    (events.data !== undefined &&
                      !eventTraceRefs.has(`${o.title ?? ""}|${o.traceId ?? ""}`))
                  }
                />
              ))}
            </div>
          )}
        </Panel>
      )}

      {view === "constraints" && (
        <Panel title="CONSTRAINTS" actions={<EpistemicTag kind="derived" label="DURABLE" />}>
          {constraints.isLoading ? (
            <LoadingRows rows={5} />
          ) : constraints.error ? (
            <ServiceState error={constraints.error} label="Accepted constraints" />
          ) : (constraints.data ?? []).length === 0 ? (
            <EmptyState title="No accepted constraints yet" />
          ) : (
            <div className="space-y-2">
              {(constraints.data ?? []).map((c, i) => (
                <DurableCard key={c.id ?? i} record={c} />
              ))}
            </div>
          )}
        </Panel>
      )}

      {view === "requests" && (
        <Panel title="EVIDENCE REQUESTS" actions={<EpistemicTag kind="unknown" label="OPEN STATE" />}>
          {requests.isLoading ? (
            <LoadingRows rows={5} />
          ) : requests.error ? (
            <ServiceState error={requests.error} label="Evidence requests" />
          ) : (requests.data ?? []).length === 0 ? (
            <EmptyState title="No open evidence requests" />
          ) : (
            <div className="space-y-2">
              {(requests.data ?? []).map((r, i) => (
                <DurableCard key={r.id ?? i} record={r} showMissing />
              ))}
            </div>
          )}
        </Panel>
      )}

      {view === "history" && (
        <Panel title="HISTORY" meta="every decision, in order">
          {events.isLoading ? (
            <LoadingRows rows={8} />
          ) : events.error ? (
            <ServiceState error={events.error} label="Review history" />
          ) : (events.data ?? []).length === 0 ? (
            <EmptyState title="No review events recorded" />
          ) : (
            <div>
              {(events.data ?? []).map((e, i) => (
                <AuditEventRow key={e.id ?? i} event={e} />
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function DurableCard({
  record,
  showDecision,
  showMissing,
  unaudited,
}: {
  record: DurableObjectRecord;
  showDecision?: boolean;
  showMissing?: boolean;
  unaudited?: boolean;
}) {
  return (
    <article className="rounded-[9px] border border-edge bg-[var(--surface-2)]">
      <header className="flex items-center justify-between gap-3 border-b border-edge/50 px-3 h-9">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-[12px]">{record.title ?? record.id ?? "—"}</span>
          {unaudited && (
            <span className="mono-label !text-[8px] !text-muted-foreground/60 rounded border border-dashed border-edge px-1.5">
              NO LINKED REVIEW EVENT
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {record.confidence !== null && <Confidence value={record.confidence} />}
          <span className="tabular text-[11px] text-muted-foreground">
            {relativeTime(record.createdAt)}
          </span>
        </div>
      </header>
      <div className="grid gap-x-6 px-3 py-2.5 md:grid-cols-2">
        <div>
          {showDecision && <Field label="Decision" value={record.decision} />}
          <Field label="Scope" value={record.scope} />
          <Field label="Reason" value={record.reason} />
          <Field
            label="Trace"
            value={record.traceId ? <span className="font-mono text-[11px]">{record.traceId}</span> : null}
          />
          <Field label="Created" value={absoluteTime(record.createdAt)} />
        </div>
        <div className="pt-1.5 md:pt-0">
          <Mono>EVIDENCE</Mono>
          <div className="mt-1.5">
            <EvidenceRefList refs={record.evidenceRefs} />
          </div>
          {showMissing && (
            <div className="mt-2">
              <MissingState items={record.missingState} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}