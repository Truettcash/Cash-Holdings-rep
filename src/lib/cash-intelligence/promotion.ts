import { callFunction, INTEL_FUNCTIONS } from "./service";
import { one, toDurable, toReviewEvent } from "./normalize";
import type {
  DurableObjectRecord,
  PromotionAction,
  PromotionRequest,
  ReviewEvent,
  Row,
} from "./types";

/**
 * The single write path in the interface. Promotion always goes through
 * `intelligence-promotion-write`; the browser never inserts, updates or
 * deletes a promotion table, and never supplies identity fields — the
 * authenticated JWT is the actor.
 */

const FORBIDDEN_FIELDS = [
  "owner_user_id",
  "actor_user_id",
  "approved_by",
  "service_role",
  "table",
  "rpc",
  "sql",
  "raw_sql",
];

export type PromotionResult = {
  ok: boolean;
  reviewEvent: ReviewEvent | null;
  durable: DurableObjectRecord | null;
  idempotentReplay: boolean;
  raw: Row | null;
};

/** Human-readable description of what a given action will durably produce. */
export const ACTION_EFFECT: Record<PromotionAction, string> = {
  ACCEPT_SIGNAL: "intelligence_review_events (+ supported signal semantics)",
  ACCEPT_PATTERN_MATCH: "intelligence_review_events → pattern_observations",
  ACCEPT_CONSTRAINT: "intelligence_review_events → accepted_constraints",
  REJECT_CANDIDATE: "intelligence_review_events",
  MARK_UNCERTAIN: "intelligence_review_events",
  REQUEST_MORE_EVIDENCE: "intelligence_review_events → evidence_requests",
};

export const ACTION_LIFECYCLE: Record<PromotionAction, string> = {
  ACCEPT_SIGNAL: "ACCEPTED",
  ACCEPT_PATTERN_MATCH: "ACCEPTED",
  ACCEPT_CONSTRAINT: "ACCEPTED",
  REJECT_CANDIDATE: "REJECTED",
  MARK_UNCERTAIN: "UNCERTAIN",
  REQUEST_MORE_EVIDENCE: "EVIDENCE_REQUESTED",
};

/** Stable request signature — used to block accidental duplicate submission. */
export function promotionSignature(req: PromotionRequest): string {
  return [req.action, req.trace_id, req.target_type, req.target_ref, req.scope ?? ""].join("|");
}

export async function submitPromotion(req: PromotionRequest): Promise<PromotionResult> {
  for (const field of FORBIDDEN_FIELDS) {
    if (field in (req as unknown as Row)) {
      throw new Error(`Refusing to send governed field "${field}" from the browser.`);
    }
  }
  const body: Row = {
    action: req.action,
    trace_id: req.trace_id,
    target_type: req.target_type,
    target_ref: req.target_ref,
    reason: req.reason,
    expected_resulting_lifecycle_state:
      req.expected_resulting_lifecycle_state ?? ACTION_LIFECYCLE[req.action],
  };
  if (req.scope) body.scope = req.scope;
  if (req.evidence_refs?.length) body.evidence_refs = req.evidence_refs;
  if (req.notes) body.notes = req.notes;
  if (req.action === "REQUEST_MORE_EVIDENCE" && req.missing_state?.length) {
    body.missing_state = req.missing_state;
  }

  const payload = await callFunction(INTEL_FUNCTIONS.promotion, body);
  const root = one(payload) ?? {};
  const eventRow = (root.review_event ?? root.reviewEvent ?? root.event) as Row | undefined;
  const durableRow = (root.pattern_observation ??
    root.accepted_constraint ??
    root.evidence_request ??
    root.durable_object ??
    root.object) as Row | undefined;
  const replay = Boolean(
    root.idempotent ?? root.replay ?? root.already_exists ?? root.duplicate ?? false,
  );

  return {
    ok: root.ok === undefined ? true : Boolean(root.ok),
    reviewEvent: eventRow ? toReviewEvent(eventRow) : null,
    durable: durableRow ? toDurable(durableRow) : null,
    idempotentReplay: replay,
    raw: root,
  };
}