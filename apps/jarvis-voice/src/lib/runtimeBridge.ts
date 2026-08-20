export type JarvisRuntimeResult = {
  ok?: boolean;
  action?: string;
  intent?: string;
  status?: string;
  answer?: string;
  transcript?: string[];
  error?: string;
};

declare global {
  interface Window {
    __JARVIS_RUNTIME_BRIDGE__?: {
      ask: (query: string) => Promise<JarvisRuntimeResult>;
    };
  }
}

function classifyIntent(query: string): string {
  const lower = query.trim().toLowerCase();
  if (lower.includes('pattern') || lower.includes('diagnose') || lower.includes('constraint')) return 'DIAGNOSTIC';
  if (lower.includes('project') || lower.includes('status')) return 'OPERATING';
  if (lower.includes('evidence') || lower.includes('source')) return 'EVIDENCE';
  return 'INTELLIGENCE';
}

export async function askJarvisRuntime(query: string): Promise<JarvisRuntimeResult> {
  const bridge = typeof window !== 'undefined' ? window.__JARVIS_RUNTIME_BRIDGE__ : undefined;
  if (bridge && typeof bridge.ask === 'function') {
    return bridge.ask(query);
  }

  if (typeof fetch === 'function') {
    try {
      const response = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (response.ok) {
        const json = (await response.json()) as Partial<JarvisRuntimeResult>;
        return {
          ok: true,
          action: 'managed-agent-query',
          intent: json.intent ?? classifyIntent(query),
          status: json.status ?? 'routed',
          answer: json.answer ?? `Jarvis Voice routed: "${query}" through the managed runtime.`,
          transcript: json.transcript ?? [query],
        };
      }
      const fallback = await response.text();
      return {
        ok: false,
        action: 'managed-agent-query',
        intent: classifyIntent(query),
        status: 'error',
        error: fallback || 'runtime request failed',
      };
    } catch (error) {
      return {
        ok: false,
        action: 'managed-agent-query',
        intent: classifyIntent(query),
        status: 'error',
        error: error instanceof Error ? error.message : 'runtime request failed',
      };
    }
  }

  const intent = classifyIntent(query);
  return {
    ok: true,
    action: 'managed-agent-query',
    intent,
    status: 'simulation',
    answer: `Jarvis Voice queued a managed-agent request for: "${query}". The local runtime bridge is ready to hand this query to the existing Jarvis execution path when the desktop host is connected.`,
    transcript: [query],
  };
}
