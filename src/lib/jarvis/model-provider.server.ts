import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { z } from "zod";

import { JARVIS_SYSTEM_PROMPT, parseJarvisJson } from "./jarvis.server";
import type { JarvisAnswer, JarvisContext, JarvisEvidenceItem } from "./types";

export type JarvisModelProvider = "lovable" | "openai-compatible";

export type JarvisModelConfig = {
  provider: JarvisModelProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
};

export type GenerateJarvisAnswerInput = {
  prompt: string;
  context: JarvisContext;
  knowledge: JarvisEvidenceItem[];
  intelligence: { operations: string[] };
  system?: string;
};

export const jarvisAnswerSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  state: z.enum(["known", "inferred", "unknown"]),
  blocks: z
    .array(
      z.object({
        kind: z.enum([
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
        ]),
        title: z.string().trim().max(120).optional(),
        items: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(200),
              detail: z.string().trim().max(400).optional(),
              meta: z.string().trim().max(120).optional(),
              state: z.enum(["known", "inferred", "unknown"]).optional(),
              confidence: z.number().finite().optional(),
            }),
          )
          .max(12)
          .optional(),
        columns: z.array(z.string().trim().max(60)).max(6).optional(),
        rows: z.array(z.array(z.string().trim().max(200)).max(6)).max(20).optional(),
      }),
    )
    .max(6)
    .default([]),
  unknowns: z.array(z.string().trim().max(240)).max(8).default([]),
  candidates: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        rationale: z.string().trim().max(400).optional(),
        confidence: z.number().finite().optional(),
      }),
    )
    .max(5)
    .default([]),
});

export function resolveJarvisModelConfig(env: Record<string, string | undefined> = process.env): JarvisModelConfig {
  const configuredProvider = (env.JARVIS_MODEL_PROVIDER ?? (env.LOVABLE_API_KEY ? "lovable" : undefined))
    ?.trim()
    .toLowerCase();

  if (!configuredProvider) {
    throw new Error(
      "PROVIDER_CREDENTIALS_REQUIRED: set JARVIS_MODEL_PROVIDER and JARVIS_MODEL_API_KEY, or provide a Lovable gateway key via LOVABLE_API_KEY.",
    );
  }

  const provider = configuredProvider === "lovable" ? "lovable" : "openai-compatible";
  const model = env.JARVIS_MODEL?.trim() || (provider === "lovable" ? "google/gemini-3.6-flash" : undefined);
  const apiKey = env.JARVIS_MODEL_API_KEY?.trim() || env.LOVABLE_API_KEY?.trim();
  const baseUrl =
    env.JARVIS_MODEL_BASE_URL?.trim() ||
    (provider === "lovable" ? "https://ai.gateway.lovable.dev/v1" : undefined);

  if (!model || !apiKey || !baseUrl) {
    throw new Error(
      "PROVIDER_CREDENTIALS_REQUIRED: provide JARVIS_MODEL, JARVIS_MODEL_API_KEY, and JARVIS_MODEL_BASE_URL (or LOVABLE_API_KEY for the Lovable adapter).",
    );
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl,
  };
}

function createGateway(config: JarvisModelConfig) {
  if (config.provider === "lovable") {
    return createOpenAICompatible({
      name: "lovable",
      baseURL: config.baseUrl,
      headers: {
        "Lovable-API-Key": config.apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
  }

  return createOpenAICompatible({
    name: "portable-openai-compatible",
    baseURL: config.baseUrl,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });
}

export async function generateJarvisAnswer(input: GenerateJarvisAnswerInput): Promise<JarvisAnswer> {
  const config = resolveJarvisModelConfig(process.env);
  const gateway = createGateway(config);
  const system = input.system ?? JARVIS_SYSTEM_PROMPT;

  const { text } = await generateText({
    model: gateway(config.model),
    system,
    prompt: input.prompt,
  });

  const raw = parseJarvisJson(text);
  if (!raw) {
    throw new Error("MODEL_OUTPUT_INVALID: provider returned malformed content.");
  }

  const parsed = jarvisAnswerSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`MODEL_OUTPUT_INVALID: ${parsed.error.message}`);
  }

  return parsed.data;
}
