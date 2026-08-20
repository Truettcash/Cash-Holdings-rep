import type {
  ConstraintCandidate,
  DurableObjectRecord,
  EvidenceRef,
  KnowledgeContent,
  KnowledgeDocument,
  KnowledgeSource,
  PatternCandidate,
  ReasoningTrace,
  ReviewEvent,
  Row,
} from "./types";

/**
 * Tolerant readers over service payloads. The Edge Functions own the shape;
 * the interface reads defensively so a field the backend renames degrades to
 * "not provided" instead of crashing the operator surface.
 */

const variants = (name: string) => {
  const camel = name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const snake = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return [...new Set([name, camel, snake])];
};

export function pick(row: Row | null | undefined, names: string[]): unknown {
  if (!row) return undefined;
  for (const name of names) {
    for (const key of variants(name)) {
      const value = row[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return undefined;
}

export function str(row: Row | null | undefined, names: string[]): string | null {
  const v = pick(row, names);
  if (v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function num(row: Row | null | undefined, names: string[]): number | null {
  const v = pick(row, names);
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Any list-ish payload → array of rows. */
export function rows(payload: unknown, keys: string[] = []): Row[] {
  if (Array.isArray(payload)) return payload.filter((r) => r && typeof r === "object") as Row[];
  if (payload && typeof payload === "object") {
    const p = payload as Row;
    for (const key of [...keys, "items", "rows", "records", "list", "data", "results"]) {
      for (const k of variants(key)) {
        if (Array.isArray(p[k])) return (p[k] as unknown[]).filter((r) => r && typeof r === "object") as Row[];
      }
    }
  }
  return [];
}

export function one(payload: unknown): Row | null {
  if (Array.isArray(payload)) return (payload[0] as Row) ?? null;
  if (payload && typeof payload === "object") return payload as Row;
  return null;
}

/** Text list: tolerates arrays of strings, arrays of objects, or a single string. */
export function textList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === "string") return v;
        if (typeof v === "number") return String(v);
        if (v && typeof v === "object") {
          const r = v as Row;
          return (
            str(r, ["label", "text", "description", "name", "value", "statement", "question", "key"]) ??
            JSON.stringify(r)
          );
        }
        return null;
      })
      .filter((v): v is string => Boolean(v && v.trim()));
  }
  if (typeof value === "object") {
    return Object.entries(value as Row).map(([k, v]) => `${k}: ${String(v)}`);
  }
  return [];
}

export function evidenceList(value: unknown): EvidenceRef[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((v): EvidenceRef | null => {
      if (typeof v === "string") {
        return { id: v, label: v, kind: null, raw: v };
      }
      if (v && typeof v === "object") {
        const r = v as Row;
        return {
          id: str(r, ["evidence_ref_id", "evidence_ref", "id", "ref", "uuid"]),
          label: str(r, ["label", "title", "name", "summary", "excerpt", "description"]),
          kind: str(r, ["kind", "type", "evidence_type", "source_type"]),
          raw: r,
        };
      }
      return null;
    })
    .filter((v): v is EvidenceRef => v !== null);
}

export function evidenceIds(refs: EvidenceRef[]): string[] {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(refs.map((r) => r.id).filter((id): id is string => Boolean(id && UUID.test(id))))];
}

export function toSource(r: Row): KnowledgeSource {
  return {
    id: str(r, ["id", "source_id"]),
    name: str(r, ["name", "title", "label", "source_name"]),
    kind: str(r, ["kind", "source_type", "type"]),
    workspace: str(r, ["workspace", "workspace_key", "context", "scope"]),
    createdAt: str(r, ["created_at", "createdAt", "inserted_at"]),
    documentCount: num(r, ["document_count", "documents", "doc_count"]),
    raw: r,
  };
}

export function toDocument(r: Row): KnowledgeDocument {
  return {
    id: str(r, ["id", "document_id"]),
    sourceId: str(r, ["source_id", "knowledge_source_id"]),
    title: str(r, ["title", "name", "label", "document_title"]),
    kind: str(r, ["kind", "document_type", "type"]),
    workspace: str(r, ["workspace", "workspace_key", "context", "scope"]),
    uri: str(r, ["uri", "url", "path", "location"]),
    createdAt: str(r, ["created_at", "inserted_at"]),
    updatedAt: str(r, ["updated_at", "modified_at"]),
    raw: r,
  };
}

export function toContent(r: Row): KnowledgeContent {
  return {
    id: str(r, ["id", "content_id"]),
    documentId: str(r, ["document_id", "knowledge_document_id"]),
    heading: str(r, ["heading", "section", "title", "label"]),
    body: str(r, ["body", "content", "text", "chunk", "excerpt"]),
    position: num(r, ["position", "ordinal", "index", "chunk_index"]),
    createdAt: str(r, ["created_at", "inserted_at"]),
    raw: r,
  };
}

export function toPatternCandidate(r: Row): PatternCandidate {
  return {
    patternKey: str(r, ["pattern_key", "pattern", "key", "name"]),
    confidence: num(r, ["confidence", "score"]),
    matchedDimensions: textList(pick(r, ["matched_dimensions", "matched"])),
    contradictingDimensions: textList(pick(r, ["contradicting_dimensions", "contradictions"])),
    supportingEvidence: evidenceList(pick(r, ["supporting_evidence", "evidence"])),
    counterevidence: evidenceList(pick(r, ["counterevidence", "counter_evidence"])),
    missingState: textList(pick(r, ["missing_state", "missing"])),
    raw: r,
  };
}

export function toConstraintCandidate(r: Row): ConstraintCandidate {
  return {
    constraintFamily: str(r, ["constraint_family", "family", "constraint", "key", "name"]),
    confidence: num(r, ["confidence", "score"]),
    supportingEvidence: evidenceList(pick(r, ["supporting_evidence", "evidence"])),
    counterevidence: evidenceList(pick(r, ["counterevidence", "counter_evidence"])),
    missingState: textList(pick(r, ["missing_state", "missing"])),
    raw: r,
  };
}

export function toTrace(payload: unknown): ReasoningTrace | null {
  const r = one(payload);
  if (!r) return null;
  const inner = (pick(r, ["trace", "reasoning_trace"]) as Row | undefined) ?? r;
  return {
    traceId: str(inner, ["trace_id", "id"]),
    createdAt: str(inner, ["created_at", "generated_at", "timestamp"]),
    scope: str(inner, ["scope", "operating_scope"]),
    query: str(inner, ["query", "question", "input"]),
    intent: str(inner, ["intent", "objective"]),
    evidence: evidenceList(pick(inner, ["evidence"])),
    evidenceRefs: evidenceList(pick(inner, ["evidence_refs"])),
    sourceRefs: evidenceList(pick(inner, ["source_refs"])),
    observed: textList(pick(inner, ["observed", "observed_facts"])),
    existingIntelligence: textList(pick(inner, ["existing_intelligence"])),
    signals: textList(pick(inner, ["signals"])),
    constructs: textList(pick(inner, ["constructs"])),
    problemState: str(inner, ["problem_state"]),
    symptoms: textList(pick(inner, ["symptoms"])),
    structuralSignature: str(inner, ["structural_signature"]),
    flowPaths: textList(pick(inner, ["flow_paths"])),
    knownConstraints: textList(pick(inner, ["known_constraints"])),
    context: str(inner, ["context"]),
    expectedOutcomes: textList(pick(inner, ["expected_outcomes"])),
    patternCandidates: rows(pick(inner, ["pattern_candidates"])).map(toPatternCandidate),
    constraintCandidates: rows(pick(inner, ["constraint_candidates"])).map(toConstraintCandidate),
    conclusion: str(inner, ["conclusion"]),
    supportedInterpretations: textList(pick(inner, ["supported_interpretations"])),
    unsupportedInterpretations: textList(pick(inner, ["unsupported_interpretations"])),
    unresolvedQuestions: textList(pick(inner, ["unresolved_questions"])),
    provenance: textList(pick(inner, ["provenance"])),
    toolsUsed: textList(pick(inner, ["tools_used"])),
    raw: inner,
  };
}

export function toDurable(r: Row): DurableObjectRecord {
  return {
    id: str(r, ["id"]),
    title: str(r, [
      "pattern_key",
      "pattern",
      "constraint_family",
      "constraint",
      "target_ref",
      "target",
      "name",
      "label",
    ]),
    decision: str(r, ["decision", "outcome", "lifecycle_state", "state", "status"]),
    scope: str(r, ["scope", "operating_scope"]),
    confidence: num(r, ["confidence", "score"]),
    traceId: str(r, ["trace_id"]),
    reason: str(r, ["reason", "rationale", "notes"]),
    missingState: textList(pick(r, ["missing_state"])),
    evidenceRefs: evidenceList(pick(r, ["evidence_refs", "evidence"])),
    createdAt: str(r, ["created_at", "inserted_at"]),
    raw: r,
  };
}

export function toReviewEvent(r: Row): ReviewEvent {
  return {
    id: str(r, ["id"]),
    action: str(r, ["action", "review_action", "event_type"]),
    targetType: str(r, ["target_type"]),
    targetRef: str(r, ["target_ref", "target"]),
    scope: str(r, ["scope"]),
    reason: str(r, ["reason", "notes"]),
    traceId: str(r, ["trace_id"]),
    lifecycleState: str(r, ["resulting_lifecycle_state", "lifecycle_state", "state"]),
    createdAt: str(r, ["created_at", "inserted_at"]),
    raw: r,
  };
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function absoluteTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}