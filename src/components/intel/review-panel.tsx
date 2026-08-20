import { useMemo, useState } from "react";
import { toast } from "sonner";
import { evidenceIds } from "@/lib/cash-intelligence/normalize";
import {
  ACTION_EFFECT,
  ACTION_LIFECYCLE,
  promotionSignature,
  submitPromotion,
  type PromotionResult,
} from "@/lib/cash-intelligence/promotion";
import type {
  ConstraintCandidate,
  PatternCandidate,
  PromotionAction,
  ReasoningTrace,
} from "@/lib/cash-intelligence/types";
import {
  Button,
  Confidence,
  EvidenceRefList,
  Field,
  MissingState,
  Mono,
  Panel,
  ServiceState,
} from "./primitives";

export type ReviewTarget =
  | { kind: "pattern"; candidate: PatternCandidate }
  | { kind: "constraint"; candidate: ConstraintCandidate };

const PATTERN_ACTIONS: PromotionAction[] = [
  "ACCEPT_PATTERN_MATCH",
  "ACCEPT_SIGNAL",
  "REJECT_CANDIDATE",
  "MARK_UNCERTAIN",
  "REQUEST_MORE_EVIDENCE",
];
const CONSTRAINT_ACTIONS: PromotionAction[] = [
  "ACCEPT_CONSTRAINT",
  "REJECT_CANDIDATE",
  "MARK_UNCERTAIN",
  "REQUEST_MORE_EVIDENCE",
];

/**
 * Presentation-only labels. The promotion contract is unchanged — the enum is
 * still what gets sent, and appears only in the technical confirmation detail.
 */
const ACTION_LABEL: Record<PromotionAction, string> = {
  ACCEPT_PATTERN_MATCH: "Accept as pattern",
  ACCEPT_SIGNAL: "Accept as signal",
  ACCEPT_CONSTRAINT: "Accept as constraint",
  REJECT_CANDIDATE: "Reject",
  MARK_UNCERTAIN: "Mark uncertain",
  REQUEST_MORE_EVIDENCE: "Request evidence",
};

/**
 * Human review of one candidate. Opening, selecting or navigating never
 * promotes anything: every action passes through an explicit confirmation
 * state and is executed exactly once by the promotion Edge Function.
 */
export function ReviewPanel({
  trace,
  target,
  onClose,
  onPromoted,
}: {
  trace: ReasoningTrace;
  target: ReviewTarget;
  onClose: () => void;
  onPromoted?: () => void;
}) {
  const isPattern = target.kind === "pattern";
  const candidate = target.candidate;
  const title = isPattern
    ? (target.candidate.patternKey ?? "")
    : (target.candidate.constraintFamily ?? "");

  const [action, setAction] = useState<PromotionAction>(
    isPattern ? "ACCEPT_PATTERN_MATCH" : "ACCEPT_CONSTRAINT",
  );
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<"compose" | "confirm" | "done">("compose");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [executed, setExecuted] = useState<string[]>([]);

  const refs = useMemo(
    () => evidenceIds([...candidate.supportingEvidence, ...trace.evidenceRefs]),
    [candidate.supportingEvidence, trace.evidenceRefs],
  );

  const request = useMemo(
    () => ({
      action,
      trace_id: trace.traceId ?? "",
      target_type: isPattern ? "pattern" : "constraint",
      target_ref: title,
      reason: reason.trim(),
      scope: trace.scope ?? undefined,
      evidence_refs: refs,
      notes: notes.trim() || undefined,
      expected_resulting_lifecycle_state: ACTION_LIFECYCLE[action],
      missing_state:
        action === "REQUEST_MORE_EVIDENCE" && candidate.missingState.length
          ? candidate.missingState
          : undefined,
    }),
    [action, trace.traceId, trace.scope, isPattern, title, reason, notes, refs, candidate.missingState],
  );

  const signature = promotionSignature(request);
  const alreadyExecuted = executed.includes(signature);
  const ready = Boolean(request.trace_id && request.target_ref && request.reason.length >= 8);
  const actions = isPattern ? PATTERN_ACTIONS : CONSTRAINT_ACTIONS;

  async function execute() {
    if (submitting || alreadyExecuted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitPromotion(request);
      setResult(res);
      setExecuted((e) => [...e, signature]);
      setStage("done");
      toast.success(
        res.idempotentReplay ? "Replay accepted — no duplicate created" : "Promotion recorded",
      );
      onPromoted?.();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title={isPattern ? "PATTERN CANDIDATE REVIEW" : "CONSTRAINT CANDIDATE REVIEW"}
        meta={title || "unnamed candidate"}
        actions={<Button onClick={onClose}>Close</Button>}
      >
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <Field label="Candidate type" value={isPattern ? "pattern" : "constraint"} />
            <Field label="Candidate" value={<span className="font-mono text-[11px]">{title}</span>} />
            <Field label="Scope" value={trace.scope} />
            <Field label="Confidence" value={<Confidence value={candidate.confidence} />} />
          </div>
          <div>
            <Field
              label="Trace"
              value={<span className="font-mono text-[11px]">{trace.traceId}</span>}
            />
            <Field label="Query" value={trace.query} />
            <Field label="Durable evidence refs" value={refs.length || null} />
          </div>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <Mono>SUPPORTING EVIDENCE</Mono>
            <div className="mt-1.5">
              <EvidenceRefList refs={candidate.supportingEvidence} />
            </div>
          </div>
          <div>
            <Mono>COUNTEREVIDENCE</Mono>
            <div className="mt-1.5">
              <EvidenceRefList
                refs={candidate.counterevidence}
                tone="counter"
                emptyNote="No counterevidence"
              />
            </div>
          </div>
          <MissingState items={candidate.missingState} />
        </div>
      </Panel>

      {stage === "compose" && (
        <Panel title="YOUR DECISION">
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={
                  "motion-micro h-7 rounded-[7px] border px-2.5 text-[11px] tracking-[0.04em] " +
                  (a === action
                    ? "border-teal/40 bg-teal-soft text-teal"
                    : "border-edge bg-[var(--surface-2)] text-muted-foreground hover:text-foreground")
                }
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/75">
            What happens if you approve: {ACTION_EFFECT[action]}
          </p>
          <label className="mt-3 block">
            <Mono>REASON (REQUIRED)</Mono>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why this judgement is warranted by the evidence above."
              className="mt-1.5 w-full resize-y rounded-[8px] border border-edge bg-[var(--surface-2)] px-2.5 py-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-teal/40"
            />
          </label>
          <label className="mt-2 block">
            <Mono>OPERATOR NOTES (OPTIONAL)</Mono>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 h-8 w-full rounded-[8px] border border-edge bg-[var(--surface-2)] px-2.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-teal/40"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <Button tone="primary" disabled={!ready} onClick={() => setStage("confirm")}>
              Continue to confirmation
            </Button>
            {!ready && (
              <span className="text-[11px] text-muted-foreground/70">
                A trace ID, target and a reason of at least 8 characters are required.
              </span>
            )}
          </div>
        </Panel>
      )}

      {stage === "confirm" && (
        <Panel title="CONFIRM DECISION" meta="this action is consequential">
          <Field label="Decision" value={ACTION_LABEL[action]} />
          <Field label="Target" value={<span className="font-mono text-[11px]">{title}</span>} />
          <Field label="Target type" value={request.target_type} />
          <Field label="Scope" value={request.scope ?? null} />
          <Field label="Reason" value={request.reason} />
          <Field label="Evidence refs" value={refs.length ? refs.join(", ") : null} />
          <Field
            label="Counterevidence"
            value={candidate.counterevidence.length ? `${candidate.counterevidence.length} item(s)` : null}
          />
          <Field
            label="Missing state"
            value={candidate.missingState.length ? candidate.missingState.join("; ") : null}
          />
          <Field label="What happens if you approve" value={ACTION_EFFECT[action]} />
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-muted-foreground/70 hover:text-foreground motion-micro">
              Technical detail
            </summary>
            <div className="mt-1.5">
              <Field label="Action" value={<span className="font-mono text-[11px]">{action}</span>} />
              <Field label="Expected lifecycle state" value={ACTION_LIFECYCLE[action]} />
            </div>
          </details>
          <Field label="Executed by" value="authenticated operator session (backend-derived)" />

          {error !== null && (
            <div className="mt-3">
              <ServiceState error={error} label="intelligence-promotion-write" />
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button tone="quiet" onClick={() => setStage("compose")} disabled={submitting}>
              Back
            </Button>
            <Button
              tone="primary"
              onClick={execute}
              disabled={submitting || alreadyExecuted || !ready}
            >
              {submitting
                ? "Executing…"
                : alreadyExecuted
                  ? "Already executed"
                  : `Confirm · ${ACTION_LABEL[action]}`}
            </Button>
          </div>
        </Panel>
      )}

      {stage === "done" && result && (
        <Panel title="DECISION RECORDED" meta={result.idempotentReplay ? "idempotent replay" : "recorded"}>
          <Field label="Status" value={result.ok ? "accepted by promotion gateway" : "rejected"} />
          <Field label="Decision" value={ACTION_LABEL[action]} />
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <Mono>AUDIT EVENT</Mono>
              <div className="mt-1.5">
                {result.reviewEvent ? (
                  <>
                    <Field label="Event ID" value={result.reviewEvent.id} />
                    <Field label="Action" value={result.reviewEvent.action} />
                    <Field label="Lifecycle" value={result.reviewEvent.lifecycleState} />
                    <Field label="Created" value={result.reviewEvent.createdAt} />
                  </>
                ) : (
                  <p className="text-[11.5px] text-muted-foreground/70 italic">
                    The gateway did not return the audit event inline. Verify it in Intelligence →
                    Review History.
                  </p>
                )}
              </div>
            </div>
            <div>
              <Mono>DURABLE OBJECT</Mono>
              <div className="mt-1.5">
                {result.durable ? (
                  <>
                    <Field label="ID" value={result.durable.id} />
                    <Field label="Object" value={result.durable.title} />
                    <Field label="Scope" value={result.durable.scope} />
                    <Field label="Created" value={result.durable.createdAt} />
                  </>
                ) : (
                  <p className="text-[11.5px] text-muted-foreground/70 italic">
                    No domain object is produced by this action, or it was not returned inline.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={onClose}>Back to queue</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}