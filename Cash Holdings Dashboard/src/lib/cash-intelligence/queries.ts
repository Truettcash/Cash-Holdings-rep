import { queryOptions } from "@tanstack/react-query";
import { callOperation, INTEL_FUNCTIONS } from "./service";
import {
  one,
  rows,
  toConstraintCandidate,
  toContent,
  toDocument,
  toDurable,
  toPatternCandidate,
  toReviewEvent,
  toSource,
  toTrace,
} from "./normalize";
import type {
  ConstraintCandidate,
  DurableObjectRecord,
  KnowledgeContent,
  KnowledgeDocument,
  KnowledgeSource,
  PatternCandidate,
  ReasoningTrace,
  ReviewEvent,
  Row,
} from "./types";

/**
 * Every read below is a governed Edge Function call. There are deliberately no
 * table reads and no client-side derivation of intelligence.
 */

export const INTEL_ROOT = ["cash-intelligence"] as const;
const K = INTEL_FUNCTIONS.knowledge;
const I = INTEL_FUNCTIONS.intelligence;

const READ_STALE = 60_000;

export const knowledgeSourcesQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "knowledge", "sources"] as const,
    staleTime: READ_STALE,
    retry: false,
    queryFn: async (): Promise<KnowledgeSource[]> => {
      const out = await callOperation(K, ["list_sources", "list_knowledge_sources", "sources"]);
      return rows(out, ["sources"]).map(toSource);
    },
  });

export const knowledgeDocumentsQuery = (sourceId: string | null) =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "knowledge", "documents", sourceId ?? "all"] as const,
    staleTime: READ_STALE,
    retry: false,
    queryFn: async (): Promise<KnowledgeDocument[]> => {
      const out = await callOperation(
        K,
        ["list_documents", "list_knowledge_documents", "documents"],
        sourceId ? { source_id: sourceId } : {},
      );
      return rows(out, ["documents"]).map(toDocument);
    },
  });

export const knowledgeContentQuery = (documentId: string | null) =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "knowledge", "content", documentId ?? "none"] as const,
    staleTime: READ_STALE,
    retry: false,
    enabled: Boolean(documentId),
    queryFn: async (): Promise<KnowledgeContent[]> => {
      const out = await callOperation(
        K,
        ["get_document_content", "get_content", "list_content", "content"],
        { document_id: documentId },
      );
      return rows(out, ["content", "chunks", "sections"]).map(toContent);
    },
  });

export const knowledgeSearchQuery = (query: string) =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "knowledge", "search", query] as const,
    staleTime: READ_STALE,
    retry: false,
    enabled: query.trim().length > 2,
    queryFn: async (): Promise<KnowledgeContent[]> => {
      const out = await callOperation(K, ["search"], {
        query,
      });
      return rows(out, ["matches", "hits", "content"]).map(toContent);
    },
  });

export const patternLibraryQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "patterns", "library"] as const,
    staleTime: READ_STALE,
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      const out = await callOperation(I, ["list_patterns", "patterns"]);
      return rows(out, ["patterns"]);
    },
  });

export const constructsQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "constructs"] as const,
    staleTime: READ_STALE,
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      const out = await callOperation(I, ["list_constructs", "constructs"]);
      return rows(out, ["constructs"]);
    },
  });

export const constraintLibraryQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "constraints", "library"] as const,
    staleTime: READ_STALE,
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      const out = await callOperation(I, ["list_constraints", "constraints"]);
      return rows(out, ["constraints"]);
    },
  });

/** Durable, promoted intelligence — read back through the governed service. */
export const patternObservationsQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "durable", "pattern-observations"] as const,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<DurableObjectRecord[]> => {
      const out = await callOperation(I, [
        "list_pattern_observations",
        "pattern_observations",
        "list_observations",
      ]);
      return rows(out, ["pattern_observations", "observations"]).map(toDurable);
    },
  });

export const acceptedConstraintsQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "durable", "accepted-constraints"] as const,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<DurableObjectRecord[]> => {
      const out = await callOperation(I, [
        "list_accepted_constraints",
        "accepted_constraints",
      ]);
      return rows(out, ["accepted_constraints", "constraints"]).map(toDurable);
    },
  });

export const evidenceRequestsQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "durable", "evidence-requests"] as const,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<DurableObjectRecord[]> => {
      const out = await callOperation(I, ["list_evidence_requests", "evidence_requests"]);
      return rows(out, ["evidence_requests", "requests"]).map(toDurable);
    },
  });

export const reviewEventsQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "durable", "review-events"] as const,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<ReviewEvent[]> => {
      const out = await callOperation(I, [
        "list_review_events",
        "intelligence_review_events",
        "list_reviews",
        "review_history",
      ]);
      return rows(out, ["review_events", "events"]).map(toReviewEvent);
    },
  });

export const evidenceRefsQuery = () =>
  queryOptions({
    queryKey: [...INTEL_ROOT, "evidence-refs"] as const,
    staleTime: READ_STALE,
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      const out = await callOperation(I, [
        "list_evidence_refs",
        "intelligence_evidence_refs",
        "list_evidence",
      ]);
      return rows(out, ["evidence_refs", "evidence"]);
    },
  });

export type MatchInput = { query: string; scope: string; evidenceRefs: string[] };

/**
 * Runs the backend reasoning engine. The returned trace is ephemeral runtime
 * state: it is held in component memory for the operator's session and never
 * persisted, cached long-term, or re-derived here.
 */
export async function runMatchPatterns(input: MatchInput): Promise<ReasoningTrace | null> {
  const params: Row = { query: input.query };
  if (input.scope.trim()) params.scope = input.scope.trim();
  if (input.evidenceRefs.length) params.evidence_refs = input.evidenceRefs;
  const out = await callOperation(I, ["match_patterns", "match_pattern", "diagnose"], params);
  return toTrace(out);
}

export async function fetchReasoningTrace(traceId: string): Promise<ReasoningTrace | null> {
  const out = await callOperation(I, ["get_reasoning_trace", "reasoning_trace", "get_trace"], {
    trace_id: traceId,
  });
  return toTrace(out);
}

export async function fetchPattern(patternKey: string): Promise<Row | null> {
  const out = await callOperation(I, ["get_pattern", "pattern"], { pattern_key: patternKey });
  return one(out);
}

/** Candidate rows extracted from a trace — presentation only, never stored. */
export function traceCandidates(trace: ReasoningTrace | null): {
  patterns: PatternCandidate[];
  constraints: ConstraintCandidate[];
} {
  if (!trace) return { patterns: [], constraints: [] };
  return {
    patterns: trace.patternCandidates.map((c) => toPatternCandidate(c.raw)),
    constraints: trace.constraintCandidates.map((c) => toConstraintCandidate(c.raw)),
  };
}