/**
 * Jarvis interface model.
 *
 * Jarvis is an interface layer: it reads through the existing governed read
 * contracts, reasons over what it was given, and renders structure. It never
 * writes, never promotes intelligence, and never receives identity internals.
 */

/** The single frontend context envelope sent with every Jarvis call. */
export type JarvisContext = {
  active_brand?: string;
  route?: string;
  operating_view?: string;
  selected_entity_type?: string;
  selected_entity_id?: string;
  selected_project?: string;
  selected_account?: string;
  selected_evidence?: string;
  selected_intelligence_object?: string;
};

export type Epistemic = "known" | "inferred" | "unknown";

export type JarvisItem = {
  label: string;
  detail?: string;
  meta?: string;
  state?: Epistemic;
  confidence?: number;
};

export type JarvisBlockKind =
  | "flow"
  | "hierarchy"
  | "timeline"
  | "relationship"
  | "comparison"
  | "table"
  | "status"
  | "decision"
  | "evidence"
  | "actions";

export type JarvisBlock = {
  kind: JarvisBlockKind;
  title?: string;
  items?: JarvisItem[];
  columns?: string[];
  rows?: string[][];
};

export type JarvisCandidate = {
  title: string;
  rationale?: string;
  confidence?: number;
};

export type JarvisAnswer = {
  summary: string;
  state: Epistemic;
  blocks: JarvisBlock[];
  unknowns: string[];
  candidates: JarvisCandidate[];
};

export type JarvisTurn = {
  id: string;
  prompt: string;
  answer: JarvisAnswer | null;
  error: string | null;
  pending: boolean;
  context: JarvisContext;
  at: string;
};

export type JarvisMode = "text" | "speech" | "conversational";

/** Delivery voice. Presentation only — never changes reasoning or authority. */
export type JarvisVoice =
  | "standard"
  | "executive"
  | "technical"
  | "brief"
  | "conversational"
  | "operator";

/** Retrieved material handed to the model. Nothing here is invented locally. */
export type JarvisEvidenceItem = {
  title: string;
  type: string;
  context?: string;
  excerpt?: string;
  source?: string;
};