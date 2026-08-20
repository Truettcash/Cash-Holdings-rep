import { isDev } from "@/lib/analytics/client";
import type { AnalyticsSource } from "@/lib/analytics/service";

/**
 * Development-only provenance label. Renders nothing in production builds, so a
 * cutover diagnostic can never leak into the operator interface.
 */
export function SourceBadge({
  source,
  malformed,
}: {
  source: AnalyticsSource | null;
  malformed?: string | null;
}) {
  if (!isDev || !source) return null;
  const tone =
    source === "rpc"
      ? "text-teal border-teal/40"
      : source === "fallback"
        ? "text-warn border-warn/40"
        : "text-muted-foreground border-edge";
  return (
    <span
      title={malformed ?? undefined}
      className={`mono-label !text-[8.5px] rounded-sm border px-1 py-[1px] ${tone}`}
    >
      {source}
    </span>
  );
}