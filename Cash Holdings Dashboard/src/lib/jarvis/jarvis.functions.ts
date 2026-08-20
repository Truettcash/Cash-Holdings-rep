import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildJarvisPrompt } from "./jarvis.server";
import { generateJarvisAnswer } from "./model-provider.server";
import type { JarvisAnswer } from "./types";

export type JarvisResult =
  | { ok: true; answer: JarvisAnswer }
  | { ok: false; reason: string };

const contextSchema = z
  .object({
    active_brand: z.string().trim().max(160).optional(),
    route: z.string().trim().max(200).optional(),
    operating_view: z.string().trim().max(120).optional(),
    selected_entity_type: z.string().trim().max(80).optional(),
    selected_entity_id: z.string().trim().max(120).optional(),
    selected_project: z.string().trim().max(200).optional(),
    selected_account: z.string().trim().max(200).optional(),
    selected_evidence: z.string().trim().max(200).optional(),
    selected_intelligence_object: z.string().trim().max(200).optional(),
  })
  .strip();

const evidenceSchema = z.object({
  title: z.string().trim().max(240),
  type: z.string().trim().max(80),
  context: z.string().trim().max(160).optional(),
  excerpt: z.string().trim().max(1200).optional(),
  source: z.string().trim().max(240).optional(),
});

const inputSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  voice: z
    .enum(["standard", "executive", "technical", "brief", "conversational", "operator"])
    .default("standard"),
  context: contextSchema.default({}),
  evidence: z.array(evidenceSchema).max(24).default([]),
  history: z
    .array(
      z.object({
        prompt: z.string().trim().max(600),
        summary: z.string().trim().max(900),
      }),
    )
    .max(6)
    .default([]),
});

export type JarvisInput = z.input<typeof inputSchema>;

/**
 * Reasoning only. Retrieval happens on the client through the governed read
 * contracts (owner JWT), so this function never touches the database, never
 * writes, and never sees identity internals beyond the verified session.
 */
export const askJarvis = createServerFn({ method: "POST" })
  .inputValidator((input: JarvisInput) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<JarvisResult> => {
    const { requireCashHoldingsUser } = await import("@/lib/intelligence/require-owner.server");
    await requireCashHoldingsUser();

    try {
      const answer = await generateJarvisAnswer({
        prompt: buildJarvisPrompt({
          prompt: data.prompt,
          context: data.context,
          evidence: data.evidence,
          history: data.history,
          voice: data.voice,
        }),
        context: data.context,
        knowledge: data.evidence,
        intelligence: { operations: [] },
      });
      return { ok: true, answer };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error("[jarvis] reasoning unavailable:", message);
      const reason = message.includes("PROVIDER_CREDENTIALS_REQUIRED")
        ? "Jarvis reasoning is not configured."
        : "Jarvis reasoning is unavailable right now.";
      return { ok: false, reason };
    }
  });