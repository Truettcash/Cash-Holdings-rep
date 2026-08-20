import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentTrace } from "@/lib/cash-intelligence/trace-session";
import { INTEL_ROOT } from "@/lib/cash-intelligence/queries";
import { Button, EmptyState, Field, Panel } from "@/components/intel/primitives";
import { CandidateRow } from "@/components/intel/trace-view";
import { ReviewPanel, type ReviewTarget } from "@/components/intel/review-panel";
import { useJarvisSelection } from "@/lib/jarvis/context";

export const Route = createFileRoute("/_authenticated/intelligence/review")({
  component: ReviewQueue,
});

function ReviewQueue() {
  const trace = useCurrentTrace();
  const qc = useQueryClient();
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  useJarvisSelection(
    target
      ? {
          entityType: `${target.kind}_candidate`,
          intelligenceObject: target.kind === "pattern" ? "pattern candidate" : "constraint candidate",
        }
      : null,
  );

  if (!trace) {
    return (
      <EmptyState
        title="Nothing needs your decision"
        note="Findings only exist while a diagnostic session is open. Run a diagnostic in Findings to surface items for review."
      />
    );
  }

  if (target) {
    return (
      <ReviewPanel
        trace={trace}
        target={target}
        onClose={() => setTarget(null)}
        onPromoted={() => qc.invalidateQueries({ queryKey: INTEL_ROOT })}
      />
    );
  }

  const total = trace.patternCandidates.length + trace.constraintCandidates.length;

  return (
    <div className="space-y-4">
      <Panel
        title="AWAITING YOUR DECISION"
        meta={`${total} item(s) need judgement`}
        actions={
          <Link to="/intelligence/findings">
            <Button>Open findings</Button>
          </Link>
        }
      >
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <Field label="Situation" value={trace.query} />
            <Field label="Scope" value={trace.scope} />
          </div>
          <div>
            <Field label="Current finding" value={trace.conclusion} />
          </div>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground/70 hover:text-foreground motion-micro">
            Technical detail
          </summary>
          <div className="mt-1.5">
            <Field label="Trace ID" value={<span className="font-mono text-[11px]">{trace.traceId}</span>} />
          </div>
        </details>
        <p className="mt-2 text-[11px] text-muted-foreground/75">
          Nothing here is remembered yet. Anything you accept is written only after an explicit
          confirmation step.
        </p>
      </Panel>

      {total === 0 ? (
        <EmptyState
          title="This session produced nothing to decide"
          note="Nothing in this situation warrants your judgement."
        />
      ) : (
        <div className="space-y-2">
          {trace.patternCandidates.map((c, i) => (
            <CandidateRow
              key={`p-${i}`}
              kindLabel="PATTERN"
              title={c.patternKey}
              confidence={c.confidence}
              matched={c.matchedDimensions}
              contradicting={c.contradictingDimensions}
              supporting={c.supportingEvidence}
              counter={c.counterevidence}
              missing={c.missingState}
              onReview={() => setTarget({ kind: "pattern", candidate: c })}
            />
          ))}
          {trace.constraintCandidates.map((c, i) => (
            <CandidateRow
              key={`c-${i}`}
              kindLabel="CONSTRAINT"
              title={c.constraintFamily}
              confidence={c.confidence}
              supporting={c.supportingEvidence}
              counter={c.counterevidence}
              missing={c.missingState}
              onReview={() => setTarget({ kind: "constraint", candidate: c })}
            />
          ))}
        </div>
      )}

    </div>
  );
}