import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import {
  NARRATIVE_SYSTEM_PROMPT,
  buildNarrativePrompt,
  createGateway,
  isGrounded,
  parseNarrativeJson,
  type InsightPayload,
} from "./insights.server";

export type NarrativeResult = {
  available: boolean;
  reason?: string;
  narratives: { type: string; headline: string; narrative: string }[];
};

const insightSchema = z.object({
  type: z.string().trim().min(1).max(64),
  title: z.string().trim().max(200),
  value: z.number().finite(),
  previous: z.number().finite().nullable(),
  change: z.number().finite().nullable(),
  unit: z.string().trim().max(32),
  records: z.number().finite(),
  affectedBrands: z.array(z.string().trim().max(120)).max(20),
  periodLabel: z.string().trim().max(120),
  confidence: z.number().finite(),
  supporting: z.string().trim().max(500),
  recommendedAction: z.string().trim().max(500),
});

const inputSchema = z.object({
  insights: z.array(insightSchema).max(8).default([]),
});

/**
 * AI is a presentation layer only: it receives the already-computed metric
 * objects and may reword them. Anything ungrounded is dropped, and any failure
 * returns `available: false` so the deterministic cards render unchanged.
 */
export const narrateInsights = createServerFn({ method: "POST" })
  .inputValidator((input: { insights: InsightPayload[] }) =>
    inputSchema.parse({ insights: (input?.insights ?? []).slice(0, 8) }),
  )
  .handler(async ({ data }): Promise<NarrativeResult> => {
    // Public HTTP endpoint by construction: verify the caller's session
    // server-side before spending any AI gateway quota.
    const { requireCashHoldingsUser } = await import("./require-owner.server");
    await requireCashHoldingsUser();

    if (data.insights.length === 0) return { available: false, reason: "no-insights", narratives: [] };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { available: false, reason: "no-key", narratives: [] };

    try {
      const gateway = createGateway(apiKey);
      const { text } = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        system: NARRATIVE_SYSTEM_PROMPT,
        prompt: buildNarrativePrompt(data.insights),
      });

      const parsed = parseNarrativeJson(text);
      const byType = new Map(data.insights.map((i) => [i.type, i]));
      const narratives = parsed.flatMap((n) => {
        const payload = n.type ? byType.get(n.type) : undefined;
        if (!payload || !n.headline || !n.narrative) return [];
        if (!isGrounded(n.headline, payload) || !isGrounded(n.narrative, payload)) return [];
        return [{ type: payload.type, headline: n.headline, narrative: n.narrative }];
      });

      return { available: narratives.length > 0, narratives };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error("[insights] narrative unavailable:", message);
      return { available: false, reason: "gateway-error", narratives: [] };
    }
  });