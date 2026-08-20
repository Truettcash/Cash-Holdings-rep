import { describe, expect, it } from "vitest";

import { parseJarvisJson } from "./jarvis.server";
import { resolveJarvisModelConfig } from "./model-provider.server";

describe("Jarvis model provider selection", () => {
  it("requires explicit provider credentials before model generation", () => {
    expect(() => resolveJarvisModelConfig({})).toThrowError(/PROVIDER_CREDENTIALS_REQUIRED/);
  });

  it("accepts the Lovable adapter when configured", () => {
    const config = resolveJarvisModelConfig({
      JARVIS_MODEL_PROVIDER: "lovable",
      JARVIS_MODEL: "google/gemini-3.6-flash",
      JARVIS_MODEL_API_KEY: "lovable-key",
    });

    expect(config.provider).toBe("lovable");
    expect(config.model).toBe("google/gemini-3.6-flash");
    expect(config.baseUrl).toBe("https://ai.gateway.lovable.dev/v1");
  });

  it("accepts a portable openai-compatible adapter", () => {
    const config = resolveJarvisModelConfig({
      JARVIS_MODEL_PROVIDER: "openai-compatible",
      JARVIS_MODEL: "gpt-4o-mini",
      JARVIS_MODEL_API_KEY: "portable-key",
      JARVIS_MODEL_BASE_URL: "https://example.com/v1",
    });

    expect(config.provider).toBe("openai-compatible");
    expect(config.model).toBe("gpt-4o-mini");
    expect(config.baseUrl).toBe("https://example.com/v1");
  });
});

describe("Jarvis output validation", () => {
  it("parses a valid structured Jarvis answer", () => {
    const answer = parseJarvisJson(`{
      "summary": "ATHRTY CRM is being consolidated.",
      "state": "inferred",
      "blocks": [{
        "kind": "status",
        "title": "Current view",
        "items": [{
          "label": "CRM consolidation",
          "detail": "The work is being folded into one operating CRM.",
          "state": "known",
          "confidence": 0.8
        }]
      }],
      "unknowns": ["The exact owner of the final CRM cutover is still unclear."],
      "candidates": []
    }`);

    expect(answer).not.toBeNull();
    expect(answer?.summary).toContain("ATHRTY");
    expect(answer?.blocks[0]?.kind).toBe("status");
  });

  it("rejects malformed provider output safely", () => {
    expect(parseJarvisJson("not-json")).toBeNull();
    expect(parseJarvisJson('{"summary": "ok"}')).not.toBeNull();
  });
});
