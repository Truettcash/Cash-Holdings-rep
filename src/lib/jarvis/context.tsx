import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { q } from "@/lib/data";
import { useApp } from "@/lib/app-context";
import { askJarvis } from "./jarvis.functions";
import { searchWhatCashKnows } from "./search";
import type {
  JarvisContext,
  JarvisEvidenceItem,
  JarvisMode,
  JarvisTurn,
  JarvisVoice,
} from "./types";

/** Interface selection registered by whichever view the operator is inside. */
export type JarvisSelection = {
  entityType?: string;
  entityId?: string;
  project?: string;
  account?: string;
  evidence?: string;
  intelligenceObject?: string;
};

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  mode: JarvisMode;
  setMode: (m: JarvisMode) => void;
  voice: JarvisVoice;
  setVoice: (v: JarvisVoice) => void;
  turns: JarvisTurn[];
  busy: boolean;
  ask: (prompt: string) => Promise<void>;
  clear: () => void;
  envelope: JarvisContext;
  setSelection: (s: JarvisSelection | null) => void;
};

const JarvisCtx = createContext<Ctx | null>(null);

function viewFor(path: string): string {
  if (path === "/") return "Morning Brief";
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "intelligence") return `Intelligence · ${seg[1] ?? "Overview"}`;
  if (seg[0] === "athrty") return `ATHRTY · ${seg[1] ?? "Overview"}`;
  return seg.map((s) => s.replace(/-/g, " ")).join(" · ");
}

function compact(envelope: JarvisContext): JarvisContext {
  return Object.fromEntries(
    Object.entries(envelope).filter(([, v]) => typeof v === "string" && v.trim().length > 0),
  ) as JarvisContext;
}

export function JarvisProvider({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { brandFilter } = useApp();
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: q.brands, staleTime: 60_000 });

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<JarvisMode>("text");
  const [voice, setVoice] = useState<JarvisVoice>("standard");
  const [turns, setTurns] = useState<JarvisTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [selection, setSelectionState] = useState<JarvisSelection | null>(null);
  const seq = useRef(0);

  // Selection is per-view: leaving the view clears it so context is never stale.
  useEffect(() => {
    setSelectionState(null);
  }, [path]);

  const setSelection = useCallback((s: JarvisSelection | null) => setSelectionState(s), []);

  const envelope = useMemo<JarvisContext>(
    () =>
      compact({
        active_brand:
          brandFilter === "all"
            ? "ALL HOLDINGS"
            : brands.find((b) => b.id === brandFilter)?.name ?? undefined,
        route: path,
        operating_view: viewFor(path),
        selected_entity_type: selection?.entityType,
        selected_entity_id: selection?.entityId,
        selected_project: selection?.project,
        selected_account: selection?.account,
        selected_evidence: selection?.evidence,
        selected_intelligence_object: selection?.intelligenceObject,
      }),
    [brandFilter, brands, path, selection],
  );

  const ask = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || busy) return;
      const id = `t${++seq.current}`;
      const ctx = envelope;
      setBusy(true);
      setTurns((prev) => [
        ...prev,
        { id, prompt: trimmed, answer: null, error: null, pending: true, context: ctx, at: new Date().toISOString() },
      ]);

      // Retrieval first, through the governed read layer only.
      let evidence: JarvisEvidenceItem[] = [];
      try {
        const results = await searchWhatCashKnows(trimmed);
        evidence = results.slice(0, 20).map((r) => ({
          title: r.title,
          type: r.type,
          context: r.context,
          excerpt: r.excerpt,
          source: r.source,
        }));
      } catch {
        evidence = [];
      }

      const history = turns
        .filter((t) => t.answer)
        .slice(-3)
        .map((t) => ({ prompt: t.prompt, summary: t.answer!.summary }));

      try {
        const res = await askJarvis({
          data: { prompt: trimmed, voice, context: ctx, evidence, history },
        });
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? res.ok
                ? { ...t, pending: false, answer: res.answer }
                : { ...t, pending: false, error: res.reason }
              : t,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Jarvis is unavailable.";
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, pending: false, error: message } : t)));
      } finally {
        setBusy(false);
      }
    },
    [busy, envelope, turns, voice],
  );

  const clear = useCallback(() => setTurns([]), []);

  // Global invocation: ⌘J / Ctrl+J from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <JarvisCtx.Provider
      value={{
        open,
        setOpen,
        expanded,
        setExpanded,
        mode,
        setMode,
        voice,
        setVoice,
        turns,
        busy,
        ask,
        clear,
        envelope,
        setSelection,
      }}
    >
      {children}
    </JarvisCtx.Provider>
  );
}

export function useJarvis() {
  const c = useContext(JarvisCtx);
  if (!c) throw new Error("useJarvis must be used inside JarvisProvider");
  return c;
}

/**
 * Register the current view's selection so Jarvis inherits it. Views call this
 * with whatever they actually have selected — never with invented values.
 */
export function useJarvisSelection(selection: JarvisSelection | null) {
  const { setSelection } = useJarvis();
  const key = JSON.stringify(selection ?? {});
  useEffect(() => {
    setSelection(selection);
    return () => setSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setSelection]);
}