import type { LucideIcon } from "lucide-react";
import { Link2, RefreshCw, Settings, Unlink, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui-bits";

export type IntegrationCardState = "connected" | "available" | "coming-soon";

export type IntegrationCardHealth = "ok" | "error" | "unknown";

export function IntegrationCard({
  icon: Icon,
  name,
  description,
  state,
  accountLabel,
  lastSyncedAt,
  health = "unknown",
  errorMessage,
  busy,
  onConnect,
  onDisconnect,
  onSync,
  onConfigure,
  className,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  state: IntegrationCardState;
  /** Connected account label, e.g. "@brandhandle" or "3 brands". */
  accountLabel?: string | null;
  lastSyncedAt?: string | null;
  health?: IntegrationCardHealth;
  errorMessage?: string | null;
  busy?: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSync?: () => void;
  onConfigure?: () => void;
  className?: string;
}) {
  const disabled = state === "coming-soon";

  return (
    <div
      className={cn(
        "surface rounded-[14px] p-4 flex flex-col gap-3 motion-micro",
        !disabled && "lift-hover",
        disabled && "opacity-60",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 h-9 w-9 rounded-[10px] flex items-center justify-center",
            state === "connected" ? "bg-teal-soft text-teal" : "bg-[var(--surface-2)] text-muted-foreground"
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-body font-medium truncate">{name}</h4>
            {state === "coming-soon" && <StatusPill status="coming soon" tone="muted" />}
          </div>
          <p className="text-supporting text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        </div>
      </div>

      {state === "connected" && (
        <div className="rounded-[10px] bg-[var(--surface-2)] px-3 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="mono-label !text-[8.5px]">STATUS</span>
            <StatusPill
              status={health === "error" ? "error" : "connected"}
              tone={health === "error" ? "danger" : "success"}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-muted-foreground truncate">{accountLabel ?? "Connected account"}</span>
            <span className="tabular text-muted-foreground shrink-0">
              {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "never synced"}
            </span>
          </div>
          {errorMessage && (
            <div className="flex items-start gap-1.5 text-[11px] text-danger pt-1">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="truncate">{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      {state === "available" && (
        <div className="rounded-[10px] bg-[var(--surface-2)] px-3 py-2">
          <span className="mono-label !text-[8.5px] text-muted-foreground">NOT CONNECTED</span>
        </div>
      )}

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        {state === "coming-soon" && (
          <button
            disabled
            className="w-full h-8 rounded-md border border-edge text-[11.5px] font-medium text-muted-foreground cursor-not-allowed"
          >
            Coming Soon
          </button>
        )}

        {state === "available" && (
          <button
            onClick={onConnect}
            disabled={busy != null}
            className="w-full h-8 rounded-md border border-edge text-[11.5px] font-medium hover:border-teal hover:text-teal transition-colors disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            {busy === "connect" ? "Connecting…" : "Connect"}
          </button>
        )}

        {state === "connected" && (
          <>
            {onSync && (
              <button
                onClick={onSync}
                disabled={busy != null}
                className="flex-1 h-8 rounded-md border border-edge text-[11.5px] font-medium hover:border-teal hover:text-teal transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 inline mr-1.5 -mt-0.5", busy === "sync" && "animate-spin")} />
                Sync
              </button>
            )}
            {onConfigure && (
              <button
                onClick={onConfigure}
                disabled={busy != null}
                className="flex-1 h-8 rounded-md border border-edge text-[11.5px] font-medium hover:border-teal hover:text-teal transition-colors disabled:opacity-40"
              >
                <Settings className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                Configure
              </button>
            )}
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                disabled={busy != null}
                className="h-8 w-8 shrink-0 rounded-md border border-edge text-muted-foreground hover:border-danger/60 hover:text-danger transition-colors disabled:opacity-40 flex items-center justify-center"
                aria-label="Disconnect"
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
