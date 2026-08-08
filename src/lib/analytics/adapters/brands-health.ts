import {
  meta,
  num,
  ok,
  requireEnvelope,
  rowNum,
  rowStr,
  rows,
  type Adapter,
  type AdapterMeta,
} from "./envelope";

export type BrandHealthRow = {
  brandKey: string;
  label: string;
  score: number | null;
  status: string | null;
  lastActivityAt: string | null;
  staleDays: number | null;
  issues: string[];
  /** Integration sync counters as returned by the live function. */
  totalSyncs: number | null;
  failedSyncs: number | null;
};

export type BrandsHealthModel = {
  brands: BrandHealthRow[];
  healthy: number | null;
  attention: number | null;
  stale: number | null;
  meta: AdapterMeta;
};

export const adaptBrandsHealth: Adapter<BrandsHealthModel> = (payload) => {
  const invalid = requireEnvelope(payload, "brands_health");
  if (invalid) return invalid;

  const raw = rows(payload, ["brands", "health", "items", "rows", "records"]);
  const brands: BrandHealthRow[] = raw
    .map((row) => {
      const issues = row["issues"] ?? row["problems"] ?? row["flags"];
      const sync = row["sync"];
      const syncScope = sync && typeof sync === "object" ? (sync as Record<string, unknown>) : {};
      return {
        brandKey: rowStr(row, ["brandKey", "brand", "brandSlug", "slug", "key"]) ?? "",
        label: rowStr(row, ["label", "name", "brandName", "brand"]) ?? "",
        score: rowNum(row, ["score", "health", "healthScore", "index"]),
        status: rowStr(row, ["status", "state", "tone", "severity"]),
        lastActivityAt: rowStr(row, ["lastActivityAt", "last_activity_at", "lastSeenAt", "at"]),
        staleDays: rowNum(row, ["staleDays", "stale_days", "daysSinceActivity"]),
        issues: Array.isArray(issues)
          ? issues.filter((issue): issue is string => typeof issue === "string")
          : [],
        totalSyncs: rowNum(syncScope, ["totalSyncs", "total"]) ?? rowNum(row, ["totalSyncs"]),
        failedSyncs: rowNum(syncScope, ["failedSyncs", "failed"]) ?? rowNum(row, ["failedSyncs"]),
      };
    })
    .filter((row) => row.brandKey.length > 0 || row.label.length > 0);

  return ok({
    brands,
    healthy: num(payload, ["healthy", "healthyCount", "ok"]),
    attention: num(payload, ["attention", "attentionCount", "atRisk", "warning"]),
    stale: num(payload, ["stale", "staleCount", "inactive"]),
    meta: meta(payload),
  });
};