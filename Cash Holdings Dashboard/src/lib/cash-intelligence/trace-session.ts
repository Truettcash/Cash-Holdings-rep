import { useEffect, useState } from "react";
import type { ReasoningTrace } from "./types";

/**
 * In-memory holder for the operator's current reasoning trace.
 *
 * Traces are ephemeral runtime objects: this store lives in module memory for
 * the life of the tab, is never written to localStorage, the query cache, or
 * the database, and is discarded on reload.
 */

let current: ReasoningTrace | null = null;
const listeners = new Set<() => void>();

export function setCurrentTrace(trace: ReasoningTrace | null) {
  current = trace;
  listeners.forEach((l) => l());
}

export function getCurrentTrace(): ReasoningTrace | null {
  return current;
}

export function useCurrentTrace(): ReasoningTrace | null {
  const [trace, setTrace] = useState<ReasoningTrace | null>(current);
  useEffect(() => {
    const listener = () => setTrace(current);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return trace;
}