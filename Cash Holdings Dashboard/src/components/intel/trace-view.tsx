import { absoluteTime } from "@/lib/cash-intelligence/normalize";
import type { ReasoningTrace } from "@/lib/cash-intelligence/types";
import {
  Confidence,
  Dimension,
  EpistemicTag,
  EvidenceRefList,
  Field,
  MissingState,
  Mono,
  Panel,
} from "./primitives";

/**
 * Read-only view of an ephemeral reasoning trace. Nothing here is durable
 * intelligence: candidates are rendered as candidates and unresolved state is
 * rendered as unresolved.
 */
export function TraceView({
  trace,
  onReview,
}: {
  trace: ReasoningTrace;
  onReview?: (candidate:
    | { type: "pattern"; index: number }
    | { type: "constraint"; index: number }) => void;
}) {
  return (
    <div className="space-y-4">
      <Panel title="TRACE" meta="ephemeral runtime object — not persisted">
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <Field
              label="Trace ID"
              value={<span className="font-mono text-[11px]">{trace.traceId}</span>}
            />
            <Field label="Created" value={absoluteTime(trace.createdAt)} />
            <Field label="Scope" value={trace.scope} />
          </div>
          <div>
            <Field label="Query" value={trace.query} />
            <Field label="Intent" value={trace.intent} />
            <Field
              label="Structural signature"
              value={
                trace.structuralSignature ? (
                  <span className="font-mono text-[11px]">{trace.structuralSignature}</span>
                ) : null
              }
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="EVIDENCE — OBSERVED">
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 pb-1.5">
                <Mono>EVIDENCE</Mono>
                <EpistemicTag kind={trace.evidence.length ? "observed" : "unknown"} />
              </div>
              <EvidenceRefList refs={trace.evidence} />
            </div>
            <div>
              <div className="flex items-center gap-2 pb-1.5">
                <Mono>EVIDENCE REFS</Mono>
                <EpistemicTag kind={trace.evidenceRefs.length ? "observed" : "unknown"} />
              </div>
              <EvidenceRefList refs={trace.evidenceRefs} emptyNote="No durable evidence refs" />
            </div>
            <div>
              <div className="flex items-center gap-2 pb-1.5">
                <Mono>SOURCE REFS</Mono>
                <EpistemicTag kind={trace.sourceRefs.length ? "observed" : "unknown"} />
              </div>
              <EvidenceRefList refs={trace.sourceRefs} emptyNote="No source refs" />
            </div>
            <Dimension label="OBSERVED FACTS" kind="observed" items={trace.observed} />
            <Dimension label="SIGNALS" kind="observed" items={trace.signals} />
            <Dimension label="CONSTRUCTS" kind="observed" items={trace.constructs} />
            <Dimension
              label="EXISTING INTELLIGENCE"
              kind="observed"
              items={trace.existingIntelligence}
            />
            <Dimension label="KNOWN CONSTRAINTS" kind="observed" items={trace.knownConstraints} />
          </div>
        </Panel>

        <Panel title="DERIVED STATE">
          <Field label="Problem state" value={trace.problemState} />
          <Field label="Context" value={trace.context} />
          <Dimension label="SYMPTOMS" kind="derived" items={trace.symptoms} />
          <Dimension label="FLOW PATHS" kind="derived" items={trace.flowPaths} />
          <Dimension label="EXPECTED OUTCOMES" kind="derived" items={trace.expectedOutcomes} />
          <Dimension
            label="SUPPORTED INTERPRETATIONS"
            kind="derived"
            items={trace.supportedInterpretations}
          />
          <Dimension
            label="UNSUPPORTED INTERPRETATIONS"
            kind="unknown"
            items={trace.unsupportedInterpretations}
          />
          <Dimension
            label="UNRESOLVED QUESTIONS"
            kind="unknown"
            items={trace.unresolvedQuestions}
          />
        </Panel>
      </div>

      <Panel title="CANDIDATE INTELLIGENCE" meta="requires human review — not accepted">
        {trace.patternCandidates.length === 0 && trace.constraintCandidates.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground/70 italic">
            The engine produced no candidates for this trace.
          </p>
        ) : (
          <div className="space-y-2">
            {trace.patternCandidates.map((c, i) => (
              <CandidateRow
                key={`p-${i}`}
                kindLabel="PATTERN CANDIDATE"
                title={c.patternKey}
                confidence={c.confidence}
                matched={c.matchedDimensions}
                contradicting={c.contradictingDimensions}
                supporting={c.supportingEvidence}
                counter={c.counterevidence}
                missing={c.missingState}
                onReview={onReview ? () => onReview({ type: "pattern", index: i }) : undefined}
              />
            ))}
            {trace.constraintCandidates.map((c, i) => (
              <CandidateRow
                key={`c-${i}`}
                kindLabel="CONSTRAINT CANDIDATE"
                title={c.constraintFamily}
                confidence={c.confidence}
                supporting={c.supportingEvidence}
                counter={c.counterevidence}
                missing={c.missingState}
                onReview={onReview ? () => onReview({ type: "constraint", index: i }) : undefined}
              />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="CONCLUSION">
          <p className="text-[12.5px] leading-relaxed">
            {trace.conclusion ?? (
              <span className="text-muted-foreground/55 italic">
                The engine did not return a conclusion for this trace.
              </span>
            )}
          </p>
        </Panel>
        <Panel title="PROVENANCE">
          <Dimension label="PROVENANCE" kind="observed" items={trace.provenance} />
          <Dimension label="TOOLS USED" kind="observed" items={trace.toolsUsed} />
        </Panel>
      </div>
    </div>
  );
}

export function CandidateRow({
  kindLabel,
  title,
  confidence,
  matched = [],
  contradicting = [],
  supporting,
  counter,
  missing,
  onReview,
}: {
  kindLabel: string;
  title: string | null;
  confidence: number | null;
  matched?: string[];
  contradicting?: string[];
  supporting: import("@/lib/cash-intelligence/types").EvidenceRef[];
  counter: import("@/lib/cash-intelligence/types").EvidenceRef[];
  missing: string[];
  onReview?: () => void;
}) {
  return (
    <article className="rounded-[9px] border border-warn/25 bg-[var(--surface-2)]">
      <header className="flex items-center justify-between gap-3 border-b border-edge/50 px-3 h-9">
        <div className="flex min-w-0 items-center gap-2">
          <EpistemicTag kind="candidate" label={kindLabel} />
          <span className="truncate font-mono text-[12px]">{title ?? "unnamed candidate"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Confidence value={confidence} />
          {onReview && (
            <button
              onClick={onReview}
              className="motion-micro h-6 rounded border border-edge px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Review
            </button>
          )}
        </div>
      </header>
      <div className="grid gap-x-6 gap-y-3 px-3 py-2.5 md:grid-cols-2">
        <div className="space-y-2">
          {matched.length > 0 && (
            <Dimension label="MATCHED DIMENSIONS" kind="derived" items={matched} />
          )}
          {contradicting.length > 0 && (
            <Dimension label="CONTRADICTING DIMENSIONS" kind="unknown" items={contradicting} />
          )}
          <div>
            <Mono>SUPPORTING EVIDENCE</Mono>
            <div className="mt-1.5">
              <EvidenceRefList refs={supporting} />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div>
            <Mono>COUNTEREVIDENCE</Mono>
            <div className="mt-1.5">
              <EvidenceRefList refs={counter} tone="counter" emptyNote="No counterevidence" />
            </div>
          </div>
          <MissingState items={missing} />
        </div>
      </div>
    </article>
  );
}