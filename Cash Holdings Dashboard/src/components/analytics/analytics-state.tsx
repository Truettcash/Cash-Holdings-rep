import type { ReactNode } from "react";
import { AlertTriangle, Database, Inbox } from "lucide-react";
import { isDev, type AnalyticsRpcError } from "@/lib/analytics/client";

/**
 * Operator-safe states for every analytics panel. Never an unexplained empty
 * grid, never a raw PostgREST response, never a project identifier.
 */
export function AnalyticsPanelState({
  title,
  body,
  action,
  icon = "empty",
  detail,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: "empty" | "error" | "backend";
  /** Development-only disclosure. */
  detail?: string | null;
}) {
  const Icon = icon === "error" ? AlertTriangle : icon === "backend" ? Database : Inbox;
  return (
    <div className="grid place-items-center px-6 py-10 text-center">
      <div className="max-w-[340px] space-y-2.5">
        <Icon
          className={
            icon === "error"
              ? "h-4.5 w-4.5 mx-auto text-danger"
              : "h-4.5 w-4.5 mx-auto text-muted-foreground"
          }
        />
        <h4 className="text-heading">{title}</h4>
        {body && <p className="text-supporting">{body}</p>}
        {action && <div className="pt-1.5">{action}</div>}
        {isDev && detail && (
          <details className="pt-2 text-left">
            <summary className="text-[11px] text-muted-foreground cursor-pointer">
              Developer details
            </summary>
            <pre className="mt-1.5 whitespace-pre-wrap break-words text-[10.5px] font-mono text-muted-foreground">
              {detail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

/** No rows for the selected brand + period. States the source explicitly. */
export function AnalyticsEmpty({
  brandLabel,
  periodLabel,
  source,
  action,
}: {
  brandLabel: string;
  periodLabel: string;
  source: string;
  action?: ReactNode;
}) {
  return (
    <AnalyticsPanelState
      title={`No ${source} for ${brandLabel}`}
      body={`Nothing was recorded ${periodLabel}. This panel reads ${source}.`}
      action={action}
    />
  );
}

/** Both the analytics API and the local fallback failed. */
export function AnalyticsFailed({ failure }: { failure: AnalyticsRpcError }) {
  const backendMissing =
    failure.kind === "backend-not-installed" || failure.kind === "function-not-found";
  return (
    <AnalyticsPanelState
      icon={backendMissing ? "backend" : "error"}
      title={backendMissing ? "Analytics backend not connected" : failure.message}
      body={
        backendMissing
          ? "This panel will populate as soon as the analytics API is available. No figures are estimated in the meantime."
          : failure.kind === "forbidden"
            ? "This account isn't permitted to read analytics. Operational data is unaffected."
            : "Retry in a moment. Operational data is unaffected."
      }
      detail={failure.detail}
    />
  );
}