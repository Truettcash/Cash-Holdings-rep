import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Check } from "lucide-react";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const RUNTIME_KEY = "cash-operator-primary";
const CONNECTED_TTL_MS = 120_000;
const STANDBY_TTL_MS = 600_000;
const POLL_MS = 45_000;
const TICK_MS = 30_000;

const START_COMMAND =
  "cd /workspaces/cash-mcp && nohup bash ./run_jarvis_runtime_presence.sh --background >/tmp/jarvis-presence.log 2>&1 &";

type Presence = {
  runtime_key: string;
  runtime_name: string | null;
  agent_name: string | null;
  agent_id: string | null;
  status: string | null;
  tool_count: number | null;
  last_seen_at: string | null;
  updated_at: string | null;
};

type State = "connected" | "standby" | "offline" | "unavailable";

function relative(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Live Jarvis runtime presence indicator.
 * SELECT-only read of public.jarvis_runtime_presence through the existing
 * authenticated Cash Holdings client. No tokens, no writes, no service role.
 */
export function JarvisConnectCard() {
  const [row, setRow] = useState<Presence | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await cashHoldingsSupabase
        .from("jarvis_runtime_presence")
        .select(
          "runtime_key,runtime_name,agent_name,agent_id,status,tool_count,last_seen_at,updated_at",
        )
        .eq("runtime_key", RUNTIME_KEY)
        .maybeSingle();
      if (error) {
        setFailed(true);
      } else {
        setFailed(false);
        setRow((data as Presence | null) ?? null);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const tick = setInterval(() => setTick((t) => t + 1), TICK_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const age = row?.last_seen_at ? Date.now() - new Date(row.last_seen_at).getTime() : null;
  const reportedOnline = (row?.status ?? "").toLowerCase() === "online";
  const state: State = failed
    ? "unavailable"
    : reportedOnline || (age !== null && !Number.isNaN(age) && age <= CONNECTED_TTL_MS)
      ? "connected"
      : age !== null && !Number.isNaN(age) && age <= STANDBY_TTL_MS
        ? "standby"
        : "offline";

  const label =
    state === "connected"
      ? "CONNECTED"
      : state === "standby"
        ? "STANDBY"
        : state === "unavailable"
          ? "UNAVAILABLE"
          : "OFFLINE";

  const supporting =
    state === "connected"
      ? "Tier 0 · Read-only Cash access"
      : state === "standby"
        ? "Jarvis heartbeat delayed"
        : state === "unavailable"
          ? "Runtime status could not be verified."
          : "Jarvis runtime not reporting";

  const buttonLabel =
    state === "connected" ? "Jarvis Connected" : state === "standby" ? "Check Jarvis" : "Connect Jarvis";

  const statusClass =
    state === "connected"
      ? "!text-success"
      : state === "standby"
        ? "!text-warn"
        : "!text-muted-foreground";

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(START_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="surface rounded-[14px] p-4 flex flex-col gap-3 motion-micro lift-hover">
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-9 w-9 rounded-[10px] flex items-center justify-center bg-teal-soft text-teal">
            <Bot className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-body font-medium truncate">Jarvis</h4>
            <p className="text-supporting text-muted-foreground mt-0.5">
              Persistent read-only operating intelligence for Cash Holdings.
            </p>
          </div>
        </div>

        <div className="rounded-[10px] bg-[var(--surface-2)] px-3 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="mono-label !text-[8.5px]">STATUS</span>
            <span className={`mono-label !text-[9px] ${statusClass}`}>
              {loaded ? label : "…"}
            </span>
          </div>
          <div className="text-[11.5px] text-muted-foreground">{supporting}</div>
        </div>

        <div className="mt-auto pt-1">
          <button
            onClick={() => {
              void load();
              setOpen(true);
            }}
            className="w-full h-8 rounded-md border border-edge text-[11.5px] font-medium hover:border-teal hover:text-teal transition-colors"
          >
            {buttonLabel}
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Jarvis Runtime</DialogTitle>
            <DialogDescription className="text-[12.5px] leading-relaxed">
              {state === "connected"
                ? "Jarvis is connected through its dedicated Cash Holdings session."
                : state === "unavailable"
                  ? "Runtime status could not be verified."
                  : "Jarvis is configured, but the local runtime is not currently reporting. Start the Jarvis runtime from its Codespace to reconnect."}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-y-2 text-[12.5px]">
            <dt className="mono-label !text-[9px] self-center">STATUS</dt>
            <dd className={`text-right ${state === "connected" ? "text-success" : ""}`}>
              {state === "connected"
                ? "Connected"
                : state === "standby"
                  ? "Standby"
                  : state === "unavailable"
                    ? "Unavailable"
                    : "Offline"}
            </dd>
            <dt className="mono-label !text-[9px] self-center">AGENT</dt>
            <dd className="text-right">{row?.agent_name ?? "Cash Operator"}</dd>
            <dt className="mono-label !text-[9px] self-center">ACCESS</dt>
            <dd className="text-right">Tier 0 · Read-only</dd>
            {state === "connected" && (
              <>
                <dt className="mono-label !text-[9px] self-center">APPROVED TOOLS</dt>
                <dd className="text-right">{row?.tool_count ?? "—"}</dd>
                <dt className="mono-label !text-[9px] self-center">RUNTIME</dt>
                <dd className="text-right">Local</dd>
                <dt className="mono-label !text-[9px] self-center">LAST SEEN</dt>
                <dd className="text-right">{relative(row?.last_seen_at ?? null)}</dd>
              </>
            )}
          </dl>

          {state !== "connected" && (
            <div className="rounded-[10px] bg-[var(--surface-2)] px-3 py-2.5 space-y-2">
              <div className="mono-label !text-[8.5px]">START COMMAND</div>
              <code className="block text-[10.5px] leading-relaxed break-all text-muted-foreground">
                {START_COMMAND}
              </code>
              <button
                onClick={copyCommand}
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-edge text-[11px] font-medium hover:border-teal hover:text-teal transition-colors"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy command"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
