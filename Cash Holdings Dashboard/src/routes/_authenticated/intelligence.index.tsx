import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import {
  acceptedConstraintsQuery,
  evidenceRequestsQuery,
  knowledgeDocumentsQuery,
  knowledgeSourcesQuery,
  patternObservationsQuery,
  reviewEventsQuery,
} from "@/lib/cash-intelligence/queries";
import { relativeTime } from "@/lib/cash-intelligence/normalize";
import { useCurrentTrace } from "@/lib/cash-intelligence/trace-session";
import { LoadingRows, ServiceState } from "@/components/intel/primitives";

export const Route = createFileRoute("/_authenticated/intelligence/")({
  component: IntelligenceLanding,
});

function IntelligenceLanding() {
  const sources = useQuery(knowledgeSourcesQuery());
  const documents = useQuery(knowledgeDocumentsQuery(null));
  const observations = useQuery(patternObservationsQuery());
  const constraints = useQuery(acceptedConstraintsQuery());
  const requests = useQuery(evidenceRequestsQuery());
  const events = useQuery(reviewEventsQuery());
  const trace = useCurrentTrace();

  const findings = trace
    ? trace.patternCandidates.length + trace.constraintCandidates.length
    : 0;
  const durable =
    (observations.data?.length ?? 0) + (constraints.data?.length ?? 0);
  const lastEvent = (events.data ?? [])[0] ?? null;

  const stages = [
    {
      to: "/intelligence/inputs",
      label: "Inputs",
      question: "What the system can read",
      count: sources.error ? null : (sources.data?.length ?? null),
      unit: "sources",
      current:
        documents.data && documents.data.length
          ? `${documents.data.length} documents available`
          : "No documents available",
    },
    {
      to: "/intelligence/findings",
      label: "Findings",
      question: "What the system found",
      count: findings,
      unit: "candidates",
      current: trace
        ? (trace.conclusion ?? trace.query ?? "Active diagnostic session")
        : "No active diagnostic session",
    },
    {
      to: "/intelligence/review",
      label: "Review",
      question: "What needs your decision",
      count: findings,
      unit: "awaiting",
      current: findings
        ? "Operator judgement required before anything is remembered"
        : "Nothing awaiting judgement",
    },
    {
      to: "/intelligence/memory",
      label: "Memory",
      question: "What we now know",
      count: observations.error ? null : durable,
      unit: "durable",
      current: requests.data?.length
        ? `${requests.data.length} open evidence requests`
        : "No open evidence requests",
    },
  ];

  return (
    <div className="space-y-10">
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-4">
        {stages.map((s, i) => (
          <Link
            key={s.to}
            to={s.to}
            className="group motion-micro block border-t border-edge pt-3"
          >
            <div className="flex items-center gap-2">
              <span className="mono-label !text-[8px] !text-muted-foreground/45">
                0{i + 1}
              </span>
              <span className="text-[13px] font-medium group-hover:text-teal motion-micro">
                {s.label}
              </span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-teal motion-micro" />
            </div>
            <div className="mt-3 tabular text-[26px] font-medium leading-none">
              {s.count === null ? (
                <span className="text-[15px] text-muted-foreground/60">Unavailable</span>
              ) : (
                s.count
              )}
              {s.count !== null && (
                <span className="ml-2 text-[10.5px] font-normal text-muted-foreground/70">
                  {s.unit}
                </span>
              )}
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground/80">
              {s.question}
            </p>
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground/55">
              {s.current}
            </p>
          </Link>
        ))}
      </div>

      <section>
        <div className="flex items-baseline justify-between border-b border-edge pb-2">
          <h2 className="text-[13px] font-medium">What changed</h2>
          <span className="mono-label !text-[8px] !text-muted-foreground/45">
            {lastEvent ? `LAST ACTIVITY ${relativeTime(lastEvent.createdAt)}` : "NO ACTIVITY"}
          </span>
        </div>
        {events.isLoading ? (
          <div className="pt-3">
            <LoadingRows rows={5} />
          </div>
        ) : events.error ? (
          <div className="pt-3">
            <ServiceState error={events.error} label="Recent activity" />
          </div>
        ) : (events.data ?? []).length === 0 ? (
          <p className="pt-3 text-[12px] leading-relaxed text-muted-foreground/70">
            Nothing has been accepted into memory yet. Decisions you make in Review appear here.
          </p>
        ) : (
          <ul className="divide-y divide-edge/60">
            {(events.data ?? []).slice(0, 8).map((e, i) => (
              <li
                key={e.id ?? i}
                className="flex items-baseline gap-4 py-2.5 text-[12.5px]"
              >
                <span className="min-w-0 flex-1 truncate">{e.targetRef ?? "—"}</span>
                <span className="shrink-0 text-[11.5px] text-muted-foreground/75">
                  {humanDecision(e.action)}
                </span>
                <span className="shrink-0 tabular text-[11px] text-muted-foreground/55">
                  {relativeTime(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Presentation-only mapping: backend action enums are never shown as primary labels. */
function humanDecision(action: string | null): string {
  switch (action) {
    case "ACCEPT_PATTERN_MATCH":
    case "ACCEPT_SIGNAL":
    case "ACCEPT_CONSTRAINT":
      return "Accepted";
    case "REJECT_CANDIDATE":
      return "Rejected";
    case "MARK_UNCERTAIN":
      return "Marked uncertain";
    case "REQUEST_MORE_EVIDENCE":
      return "Evidence requested";
    default:
      return action ? "Recorded" : "—";
  }
}
