import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { fetchReasoningTrace, runMatchPatterns } from "@/lib/cash-intelligence/queries";
import { setCurrentTrace, useCurrentTrace } from "@/lib/cash-intelligence/trace-session";
import { Button, EmptyState, Mono, Panel, ServiceState } from "@/components/intel/primitives";
import { TraceView } from "@/components/intel/trace-view";

export const Route = createFileRoute("/_authenticated/intelligence/findings")({
  component: ReasoningWorkspace,
});

function ReasoningWorkspace() {
  const navigate = useNavigate();
  const trace = useCurrentTrace();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [refs, setRefs] = useState("");
  const [traceId, setTraceId] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [empty, setEmpty] = useState(false);

  async function run(kind: "match" | "fetch") {
    setRunning(true);
    setError(null);
    setEmpty(false);
    try {
      const result =
        kind === "match"
          ? await runMatchPatterns({
              query: query.trim(),
              scope,
              evidenceRefs: refs
                .split(/[\s,]+/)
                .map((r) => r.trim())
                .filter(Boolean),
            })
          : await fetchReasoningTrace(traceId.trim());
      setCurrentTrace(result);
      setEmpty(result === null);
    } catch (e) {
      setCurrentTrace(null);
      setError(e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="RUN A DIAGNOSTIC" meta="read-only · sessions are never stored">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            <label className="block">
              <Mono>SITUATION TO DIAGNOSE</Mono>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={2}
                placeholder="Describe the evidence-backed situation to diagnose."
                className="mt-1.5 w-full resize-y rounded-[8px] border border-edge bg-[var(--surface-2)] px-2.5 py-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-teal/40"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <Mono>SCOPE (OPTIONAL)</Mono>
                <input
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-[8px] border border-edge bg-[var(--surface-2)] px-2.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-teal/40"
                />
              </label>
              <label className="block">
                <Mono>EVIDENCE REFERENCES (OPTIONAL)</Mono>
                <input
                  value={refs}
                  onChange={(e) => setRefs(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-[8px] border border-edge bg-[var(--surface-2)] px-2.5 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-teal/40"
                />
              </label>
            </div>
            <Button
              tone="primary"
              disabled={running || query.trim().length < 4}
              onClick={() => run("match")}
            >
              {running ? "Diagnosing…" : "Run diagnostic"}
            </Button>
          </div>
          <div className="space-y-2 border-edge lg:border-l lg:pl-4">
            <label className="block">
              <Mono>EXISTING SESSION ID</Mono>
              <input
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                className="mt-1.5 h-8 w-full rounded-[8px] border border-edge bg-[var(--surface-2)] px-2.5 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-teal/40"
              />
            </label>
            <Button disabled={running || traceId.trim().length < 4} onClick={() => run("fetch")}>
              Load session
            </Button>
            {trace && (
              <>
                <Button onClick={() => navigate({ to: "/intelligence/review" })}>
                  Send to review
                </Button>
                <Button onClick={() => setCurrentTrace(null)}>Discard session</Button>
              </>
            )}
          </div>
        </div>
      </Panel>

      {error !== null && <ServiceState error={error} label="Diagnostic read" />}

      {empty && (
        <EmptyState
          title="Nothing was found"
          note="No diagnostic output was produced for this input. Nothing is inferred locally."
        />
      )}

      {trace ? (
        <TraceView
          trace={trace}
          onReview={() => navigate({ to: "/intelligence/review" })}
        />
      ) : (
        !error &&
        !empty && (
          <EmptyState
            title="No active diagnostic"
            note="Describe an evidence-backed situation above, or load an existing session."
          />
        )
      )}
    </div>
  );
}