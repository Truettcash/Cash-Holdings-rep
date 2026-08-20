/**
 * Cash Intelligence read/write model.
 *
 * Everything here mirrors what the deployed Edge Functions return. Nothing in
 * this module derives, infers or persists intelligence: reasoning traces are
 * ephemeral runtime objects, candidates stay candidates, and durable objects
 * only ever come back from the backend.
 */

export type Row = Record<string, unknown>;

/** How certain the interface is allowed to present a value. */
export type Epistemic = "observed" | "derived" | "candidate" | "unknown";

export type EvidenceRef = {
  id: string | null;
  label: string | null;
  kind: string | null;
  raw: Row | string;
};

export type KnowledgeSource = {
  id: string | null;
  name: string | null;
  kind: string | null;
  workspace: string | null;
  createdAt: string | null;
  documentCount: number | null;
  raw: Row;
};

export type KnowledgeDocument = {
  id: string | null;
  sourceId: string | null;
  title: string | null;
  kind: string | null;
  workspace: string | null;
  uri: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw: Row;
};

export type KnowledgeContent = {
  id: string | null;
  documentId: string | null;
  heading: string | null;
  body: string | null;
  position: number | null;
  createdAt: string | null;
  raw: Row;
};

export type PatternCandidate = {
  patternKey: string | null;
  confidence: number | null;
  matchedDimensions: string[];
  contradictingDimensions: string[];
  supportingEvidence: EvidenceRef[];
  counterevidence: EvidenceRef[];
  missingState: string[];
  raw: Row;
};

export type ConstraintCandidate = {
  constraintFamily: string | null;
  confidence: number | null;
  supportingEvidence: EvidenceRef[];
  counterevidence: EvidenceRef[];
  missingState: string[];
  raw: Row;
};

export type ReasoningTrace = {
  traceId: string | null;
  createdAt: string | null;
  scope: string | null;
  query: string | null;
  intent: string | null;
  evidence: EvidenceRef[];
  evidenceRefs: EvidenceRef[];
  sourceRefs: EvidenceRef[];
  observed: string[];
  existingIntelligence: string[];
  signals: string[];
  constructs: string[];
  problemState: string | null;
  symptoms: string[];
  structuralSignature: string | null;
  flowPaths: string[];
  knownConstraints: string[];
  context: string | null;
  expectedOutcomes: string[];
  patternCandidates: PatternCandidate[];
  constraintCandidates: ConstraintCandidate[];
  conclusion: string | null;
  supportedInterpretations: string[];
  unsupportedInterpretations: string[];
  unresolvedQuestions: string[];
  provenance: string[];
  toolsUsed: string[];
  raw: Row;
};

export type DurableObjectRecord = {
  id: string | null;
  title: string | null;
  decision: string | null;
  scope: string | null;
  confidence: number | null;
  traceId: string | null;
  reason: string | null;
  missingState: string[];
  evidenceRefs: EvidenceRef[];
  createdAt: string | null;
  raw: Row;
};

export type ReviewEvent = {
  id: string | null;
  action: string | null;
  targetType: string | null;
  targetRef: string | null;
  scope: string | null;
  reason: string | null;
  traceId: string | null;
  lifecycleState: string | null;
  createdAt: string | null;
  raw: Row;
};

/** The only promotion actions the deployed writer accepts. */
export const PROMOTION_ACTIONS = [
  "ACCEPT_SIGNAL",
  "ACCEPT_PATTERN_MATCH",
  "ACCEPT_CONSTRAINT",
  "REJECT_CANDIDATE",
  "MARK_UNCERTAIN",
  "REQUEST_MORE_EVIDENCE",
] as const;

export type PromotionAction = (typeof PROMOTION_ACTIONS)[number];

export type PromotionRequest = {
  action: PromotionAction;
  trace_id: string;
  target_type: string;
  target_ref: string;
  reason: string;
  scope?: string;
  evidence_refs?: string[];
  notes?: string;
  expected_resulting_lifecycle_state?: string;
  missing_state?: string[];
};

/** Historical pattern observation predating the repaired V2 audit contract. */
export const LEGACY_UNAUDITED_OBSERVATION_ID = "c87231ab-dc45-46dd-90c9-6fa23d50309f";