import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type InsightPayload = {
  type: string;
  title: string;
  value: number;
  previous: number | null;
  change: number | null;
  unit: string;
  records: number;
  affectedBrands: string[];
  periodLabel: string;
  confidence: number;
  supporting: string;
  recommendedAction: string;
};

export const NARRATIVE_SYSTEM_PROMPT = [
  "You write one-sentence executive commentary for a private holdings dashboard.",
  "You receive computed metrics. Those numbers are the ONLY facts available to you.",
  "Rules, without exception:",
  "- Never invent, estimate, or infer a metric, percentage, trend, brand, or record that is not in the payload.",
  "- Never add recommendations that the payload's numbers do not support.",
  "- Reuse the payload's own figures verbatim when you cite them.",
  "- Keep the headline under 70 characters and the narrative to at most two sentences.",
  "- Plain, calm, factual. No emojis, no hype, no bullet points.",
  'Reply with JSON only: {"headline": string, "narrative": string}',
].join("\n");

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

/** Only numbers already computed on the client engine are sent to the model. */
export function buildNarrativePrompt(insights: InsightPayload[]) {
  return [
    "Metrics (JSON):",
    JSON.stringify(insights, null, 2),
    "",
    "For each metric, return an object with the metric's `type`, a `headline`, and a `narrative`.",
    'Reply with JSON only: {"insights":[{"type":string,"headline":string,"narrative":string}]}',
  ].join("\n");
}

/** Rejects any narrative that introduces a figure the payload does not contain. */
export function isGrounded(text: string, payload: InsightPayload) {
  const numbers = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numbers.length === 0) return true;
  const allowed = new Set<string>();
  const push = (n: number | null) => {
    if (n === null || Number.isNaN(n)) return;
    const abs = Math.abs(n);
    allowed.add(String(abs));
    allowed.add(abs.toFixed(1));
    allowed.add(String(Math.round(abs)));
    allowed.add(Math.round(abs).toLocaleString());
  };
  push(payload.value);
  push(payload.previous);
  push(payload.change);
  push(payload.records);
  for (const match of payload.supporting.match(/\d+(?:[.,]\d+)?/g) ?? []) allowed.add(match);
  for (const match of payload.periodLabel.match(/\d+/g) ?? []) allowed.add(match);
  return numbers.every((n) => allowed.has(n) || allowed.has(n.replace(",", "")));
}

export function parseNarrativeJson(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      insights?: { type?: string; headline?: string; narrative?: string }[];
    };
    return parsed.insights ?? [];
  } catch {
    return [];
  }
}