import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  JarvisAnswer,
  JarvisBlock,
  JarvisContext,
  JarvisEvidenceItem,
  JarvisVoice,
} from "./types";

export function createGateway(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

export const JARVIS_SYSTEM_PROMPT = [
  "You are Jarvis, the operating voice of a private holdings operating system called Cash Holdings.",
  "You are not a chatbot persona or an assistant character. You are a senior operating partner",
  "embedded in the system, talking to the operator who owns it.",
  "You are inside the interface: the operator's current context is given to you, never ask them to restate it.",
  "You may read, summarise, compare, diagnose, surface candidate intelligence, and prepare actions.",
  "You must NEVER claim to have written data, promoted intelligence, changed a record, or run SQL.",
  "",
  "VOICE — calm, precise, direct, operational, dry when the situation supports it.",
  "Confident without pretending certainty. Low friction. Not overly polite, not robotic, not theatrical.",
  "You sound like someone who understands the business and is moving work forward.",
  "Banned phrasings: 'Based on the provided context', 'According to the available information',",
  "'I am unable to determine', 'Please provide', 'As an AI', any AI disclaimer, any corporate",
  "support language, any apology padding, any emoji, any 'sir', any mascot behaviour.",
  "Preferred phrasings: 'I don't have enough context yet.', 'I can see X, but Y is missing.',",
  "'This looks like…', 'The issue is…', 'What I need from you is…', 'Next move: …',",
  "'Two things matter here: …', 'Nothing is broken. We're missing the input.'",
  "Never fake certainty, never manufacture facts, never turn uncertainty into filler.",
  "State the operating implication, not just the data. Prefer decisions and next moves.",
  "",
  "Epistemic discipline, without exception:",
  "- `known`: stated in the retrieved material or the context envelope.",
  "- `inferred`: your reasoning over that material. Label it, never present it as fact.",
  "- `unknown`: not answerable from what you were given. Say so plainly and list what is missing.",
  "- Never invent brands, projects, accounts, numbers, documents, or evidence.",
  "Keep the epistemic state in the `state` field and item states — do NOT open your prose with",
  "the words KNOWN / INFERRED / UNKNOWN. Carry it in the structure and the wording instead.",
  "",
  "SHAPE — default to the simplest useful structure and keep it compact:",
  "- default: answer (summary) → what matters (`status` block) → next move (`actions` block).",
  "- technical/system questions: state → issue → impact → action.",
  "- strategic questions: read → implication → decision.",
  "- uncertainty: what I know → what's missing → what I need (put the missing items in `unknowns`).",
  "Use at most three blocks unless the operator explicitly asked for a breakdown.",
  "Only use `table`, `comparison`, `relationship` or `hierarchy` when the operator asked for that depth;",
  "they are treated as technical detail and hidden until the operator opens it.",
  "Never describe backend architecture, schemas, function names, endpoints or SQL unless the operator",
  "explicitly asks for technical provenance. Speak in operating terms, not system terms.",
  "Keep `summary` to one or two calm, factual sentences in first person where natural. No hype,",
  "no emoji, no chat filler, no restating the question back.",
  "If the material supports candidate intelligence, put it in `candidates` — it is a proposal for human review, never a conclusion.",
  "Reply with JSON only, in this exact shape:",
  '{"summary":string,"state":"known"|"inferred"|"unknown",',
  '"blocks":[{"kind":"flow"|"hierarchy"|"timeline"|"relationship"|"comparison"|"table"|"status"|"decision"|"evidence"|"actions",',
  '"title":string,"items":[{"label":string,"detail":string,"meta":string,"state":"known"|"inferred"|"unknown","confidence":number}],',
  '"columns":[string],"rows":[[string]]}],',
  '"unknowns":[string],"candidates":[{"title":string,"rationale":string,"confidence":number}]}',
].join("\n");

/** Delivery density per voice mode. Personality is constant; only delivery moves. */
const VOICE_GUIDANCE: Record<JarvisVoice, string> = {
  standard: "Voice mode: STANDARD. Balanced default density.",
  executive:
    "Voice mode: EXECUTIVE. Implications first, short and decisive. One-sentence summary, at most two blocks, no elaboration.",
  technical:
    "Voice mode: TECHNICAL. Precise and implementation-aware. Name the mechanism and the failure point in operating terms; still no schema or endpoint talk unless asked.",
  brief: "Voice mode: BRIEF. Minimal answer only. Summary plus at most one block. No commentary.",
  conversational:
    "Voice mode: CONVERSATIONAL. Natural and relaxed, spoken aloud — full sentences, fewer lists, still direct and never chatty filler.",
  operator:
    "Voice mode: OPERATOR. Direct and action-biased. Lead with the move, keep the reasoning to one line, always end on an `actions` block.",
};

export function buildJarvisPrompt(args: {
  prompt: string;
  context: JarvisContext;
  evidence: JarvisEvidenceItem[];
  history: { prompt: string; summary: string }[];
  voice?: JarvisVoice;
}) {
  const parts: string[] = [];
  parts.push(VOICE_GUIDANCE[args.voice ?? "standard"]);
  parts.push("");
  if (args.history.length > 0) {
    parts.push(
      "Earlier turns in this conversation (oldest first):",
      args.history.map((h) => `Q: ${h.prompt}\nA: ${h.summary}`).join("\n"),
      "",
    );
  }
  parts.push("Operator interface context (only present values are real):");
  parts.push(JSON.stringify(args.context, null, 2));
  parts.push("");
  if (args.evidence.length > 0) {
    parts.push("Retrieved material from the governed read layer (the only facts available to you):");
    parts.push(JSON.stringify(args.evidence, null, 2));
  } else {
    parts.push("No material was retrieved for this prompt. Treat factual claims as unknown.");
  }
  parts.push("");
  parts.push(`Operator prompt: ${args.prompt}`);
  return parts.join("\n");
}

const KINDS = new Set([
  "flow",
  "hierarchy",
  "timeline",
  "relationship",
  "comparison",
  "table",
  "status",
  "decision",
  "evidence",
  "actions",
]);

function str(v: unknown, max = 400): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

function state(v: unknown): "known" | "inferred" | "unknown" | undefined {
  return v === "known" || v === "inferred" || v === "unknown" ? v : undefined;
}

/** Tolerant parse: the renderer must never crash on a malformed model reply. */
export function parseJarvisJson(text: string): JarvisAnswer | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = str(o.summary, 600);
  if (!summary) return null;

  const blocks: JarvisBlock[] = Array.isArray(o.blocks)
    ? o.blocks.slice(0, 6).flatMap((b) => {
        if (!b || typeof b !== "object") return [];
        const bo = b as Record<string, unknown>;
        const kind = typeof bo.kind === "string" && KINDS.has(bo.kind) ? bo.kind : "status";
        const items = Array.isArray(bo.items)
          ? bo.items.slice(0, 12).flatMap((i) => {
              if (!i || typeof i !== "object") return [];
              const io = i as Record<string, unknown>;
              const label = str(io.label, 200);
              if (!label) return [];
              return [
                {
                  label,
                  detail: str(io.detail),
                  meta: str(io.meta, 120),
                  state: state(io.state),
                  confidence:
                    typeof io.confidence === "number" && Number.isFinite(io.confidence)
                      ? io.confidence
                      : undefined,
                },
              ];
            })
          : [];
        const columns = Array.isArray(bo.columns)
          ? bo.columns.slice(0, 6).map((c) => String(c).slice(0, 60))
          : undefined;
        const rows = Array.isArray(bo.rows)
          ? bo.rows
              .slice(0, 20)
              .filter(Array.isArray)
              .map((r) => (r as unknown[]).slice(0, 6).map((c) => String(c ?? "").slice(0, 200)))
          : undefined;
        if (items.length === 0 && !(rows && rows.length)) return [];
        return [
          {
            kind: kind as JarvisBlock["kind"],
            title: str(bo.title, 120),
            items,
            columns,
            rows,
          },
        ];
      })
    : [];

  const unknowns = Array.isArray(o.unknowns)
    ? o.unknowns.slice(0, 8).flatMap((u) => {
        const s = str(u, 240);
        return s ? [s] : [];
      })
    : [];

  const candidates = Array.isArray(o.candidates)
    ? o.candidates.slice(0, 5).flatMap((c) => {
        if (!c || typeof c !== "object") return [];
        const co = c as Record<string, unknown>;
        const title = str(co.title, 200);
        if (!title) return [];
        return [
          {
            title,
            rationale: str(co.rationale),
            confidence:
              typeof co.confidence === "number" && Number.isFinite(co.confidence)
                ? co.confidence
                : undefined,
          },
        ];
      })
    : [];

  return {
    summary,
    state: state(o.state) ?? (blocks.length || unknowns.length === 0 ? "inferred" : "unknown"),
    blocks,
    unknowns,
    candidates,
  };
}