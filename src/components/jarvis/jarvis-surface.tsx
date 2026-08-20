import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mic, MicOff, Radio, Send, Sparkle, X, Maximize2, Minimize2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useJarvis } from "@/lib/jarvis/context";
import { JarvisResponse } from "./response-renderer";
import type { JarvisVoice } from "@/lib/jarvis/types";

const VOICES: { id: JarvisVoice; label: string }[] = [
  { id: "standard", label: "STANDARD" },
  { id: "executive", label: "EXECUTIVE" },
  { id: "operator", label: "OPERATOR" },
  { id: "technical", label: "TECHNICAL" },
  { id: "brief", label: "BRIEF" },
  { id: "conversational", label: "CONVERSATIONAL" },
];

/* ---------------------------------------------------------------- speech --- */

type Recognition = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function createRecognition(): Recognition | null {
  const w = window as unknown as Record<string, any>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor() as Recognition;
}

/** Push-to-speak dictation (TEXT stays typed; SPEECH dictates into the dock). */
function useDictation(onText: (text: string, final: boolean) => void) {
  const ref = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(Boolean(createRecognition()));
    return () => ref.current?.abort();
  }, []);

  const start = (continuous: boolean) => {
    const rec = createRecognition();
    if (!rec) {
      setSupported(false);
      return;
    }
    ref.current = rec;
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      let text = "";
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      onText(text.trim(), final);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };

  const stop = () => {
    ref.current?.stop();
    setListening(false);
  };

  return { listening, supported, start, stop };
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

/* ------------------------------------------------------------- launcher --- */

export function JarvisLauncher() {
  const { open, setOpen } = useJarvis();
  const isMobile = useIsMobile();
  if (isMobile || open) return null;
  return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 h-9 pl-3 pr-3.5 rounded-full chrome-blur border border-edge text-[12px] text-muted-foreground hover:text-foreground motion-micro"
      aria-label="Open Jarvis"
    >
      <Sparkle className="h-3.5 w-3.5 text-teal" />
      <span>Jarvis</span>
      <kbd className="mono-label !text-[8.5px] !text-muted-foreground/60">⌘J</kbd>
    </button>
  );
}

/* --------------------------------------------------------------- surface --- */

export function JarvisSurface() {
  const {
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
  } = useJarvis();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement | null>(null);
  const spokenRef = useRef<string | null>(null);

  const dictation = useDictation((text, final) => {
    setDraft(text);
    if (final && mode === "conversational" && text) {
      void ask(text);
      setDraft("");
    }
  });

  useEffect(() => {
    if (!open) {
      dictation.stop();
      stopSpeaking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // Conversational mode speaks each new answer once; presentation only.
  const last = turns[turns.length - 1];
  useEffect(() => {
    if (mode !== "conversational" || !last?.answer) return;
    if (spokenRef.current === last.id) return;
    spokenRef.current = last.id;
    speak(last.answer.summary);
  }, [last, mode]);

  const contextChips = useMemo(
    () =>
      [
        envelope.active_brand,
        envelope.operating_view,
        envelope.selected_project,
        envelope.selected_account,
        envelope.selected_evidence,
        envelope.selected_intelligence_object,
      ].filter((v): v is string => Boolean(v)),
    [envelope],
  );

  if (!open) return null;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void ask(text);
  };

  const body = (
    <>
      <header className="flex items-center gap-3 px-4 sm:px-5 h-12 edge-b shrink-0">
        <Sparkle className="h-3.5 w-3.5 text-teal shrink-0" />
        <span className="text-[13px] font-medium">Jarvis</span>
        <div className="ml-auto flex items-center gap-1">
          {turns.length > 0 && (
            <button
              onClick={clear}
              className="mono-label !text-[8.5px] !text-muted-foreground/60 hover:!text-foreground px-2 motion-micro"
            >
              CLEAR
            </button>
          )}
          {!isMobile && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground motion-micro"
              aria-label={expanded ? "Collapse Jarvis" : "Expand Jarvis"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground motion-micro"
            aria-label="Close Jarvis"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {contextChips.length > 0 && (
        <div className="px-4 sm:px-5 py-2 flex flex-wrap gap-1.5 edge-b shrink-0">
          {contextChips.map((c) => (
            <span
              key={c}
              className="mono-label !text-[8.5px] !text-muted-foreground/70 px-1.5 py-0.5 rounded bg-[var(--surface-2)]"
            >
              {c.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-6">
        {turns.length === 0 && (
          <div className="text-[12.5px] leading-6 text-muted-foreground">
            I already have your scope and view. Ask what changed, what's blocked, or what Cash knows
            about an account.
            <div className="mt-3 space-y-1.5">
              {[
                "What changed in this scope today?",
                "What's blocked here, and who owns the gap?",
                "What do we know about the selected account?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => void ask(s)}
                  className="block text-left text-[12.5px] text-foreground/80 hover:text-teal motion-micro"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <article key={t.id} className="min-w-0">
            <div className="mono-label !text-[8.5px] !text-muted-foreground/60">OPERATOR</div>
            <p className="mt-1 text-[13px] leading-6">{t.prompt}</p>
            <div className="mt-3 edge-t pt-3">
              {t.pending && (
                <div className="mono-label !text-[8.5px] !text-muted-foreground/60">
                  READING · REASONING…
                </div>
              )}
              {t.error && <p className="text-[12.5px] text-amber-500/90">{t.error}</p>}
              {t.answer && (
                <JarvisResponse
                  answer={t.answer}
                  onReviewCandidate={() => {
                    setOpen(false);
                    navigate({ to: "/intelligence/review" });
                  }}
                />
              )}
            </div>
          </article>
        ))}
      </div>

      <footer className="shrink-0 edge-t px-3 sm:px-4 py-2.5 safe-bottom">
        <div className="flex items-end gap-2">
          {/* One voice control: hold to dictate, or hand it the conversation. */}
          <button
            onMouseDown={mode === "conversational" ? undefined : () => dictation.start(false)}
            onMouseUp={mode === "conversational" ? undefined : dictation.stop}
            onTouchStart={mode === "conversational" ? undefined : () => dictation.start(false)}
            onTouchEnd={mode === "conversational" ? undefined : dictation.stop}
            onClick={
              mode === "conversational"
                ? () => (dictation.listening ? dictation.stop() : dictation.start(true))
                : undefined
            }
            className={cn(
              "h-9 w-9 grid place-items-center rounded-[10px] border border-edge motion-micro shrink-0",
              dictation.listening ? "text-teal" : "text-muted-foreground hover:text-foreground",
            )}
            aria-label={mode === "conversational" ? "Toggle conversation" : "Hold to speak"}
          >
            {!dictation.supported ? (
              <MicOff className="h-4 w-4" />
            ) : mode === "conversational" ? (
              <Radio className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={
              mode === "conversational" ? "Talk — Jarvis answers aloud…" : "Ask Jarvis…"
            }
            className="flex-1 min-w-0 resize-none max-h-28 bg-[var(--surface-2)] rounded-[10px] px-3 py-2 text-[13px] leading-6 focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={busy || !draft.trim()}
            className="h-9 w-9 grid place-items-center rounded-[10px] bg-[var(--surface-3)] text-foreground disabled:opacity-40 motion-micro shrink-0"
            aria-label="Send to Jarvis"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <label className="sr-only" htmlFor="jarvis-voice">
            Jarvis voice
          </label>
          <select
            id="jarvis-voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value as JarvisVoice)}
            className="mono-label !text-[8.5px] !text-muted-foreground/60 hover:!text-foreground bg-transparent focus:outline-none motion-micro cursor-pointer"
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id} className="bg-[var(--surface-2)] text-foreground">
                {v.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              dictation.stop();
              stopSpeaking();
              setMode(mode === "conversational" ? "text" : "conversational");
            }}
            className={cn(
              "mono-label !text-[8.5px] motion-micro",
              mode === "conversational"
                ? "!text-teal"
                : "!text-muted-foreground/60 hover:!text-foreground",
            )}
          >
            CONVERSATION {mode === "conversational" ? "ON" : "OFF"}
          </button>
          {mode === "conversational" && (
            <button
              onClick={stopSpeaking}
              className="ml-auto inline-flex items-center gap-1 mono-label !text-[8.5px] !text-muted-foreground/60 hover:!text-foreground motion-micro"
            >
              <Square className="h-2.5 w-2.5" /> STOP
            </button>
          )}
        </div>
      </footer>
    </>
  );

  if (isMobile) {
    return (
      <div className="md:hidden fixed inset-0 z-50 bg-canvas flex flex-col">{body}</div>
    );
  }

  return (
    <aside
      className={cn(
        "hidden md:flex fixed right-0 top-0 bottom-0 z-50 flex-col chrome-blur border-l border-edge",
        expanded ? "w-[min(920px,72vw)]" : "w-[420px]",
      )}
      aria-label="Jarvis"
    >
      {body}
    </aside>
  );
}