import {
  meta,
  num,
  ok,
  requireEnvelope,
  rowNum,
  rowStr,
  rows,
  str,
  type Adapter,
  type AdapterMeta,
} from "./envelope";

export type InsightItem = {
  id: string;
  title: string;
  evidence: string | null;
  metric: string | null;
  value: number | null;
  delta: number | null;
  direction: "up" | "down" | "flat" | null;
  tone: "neutral" | "teal" | "warn" | "success";
  at: string | null;
};

export type InsightsModel = {
  narrative: string | null;
  items: InsightItem[];
  observed: number | null;
  meta: AdapterMeta;
};

function direction(value: string | null, delta: number | null): InsightItem["direction"] {
  if (value === "up" || value === "down" || value === "flat") return value;
  if (value === "increase" || value === "rising") return "up";
  if (value === "decrease" || value === "falling") return "down";
  if (delta === null) return null;
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function tone(value: string | null): InsightItem["tone"] {
  if (value === "warn" || value === "warning" || value === "risk") return "warn";
  if (value === "success" || value === "win") return "success";
  if (value === "teal" || value === "highlight") return "teal";
  return "neutral";
}

export const adaptInsights: Adapter<InsightsModel> = (payload) => {
  const invalid = requireEnvelope(payload, "dashboard_insights");
  if (invalid) return invalid;

  const raw = rows(payload, ["insights", "items", "observations", "rows"]);
  const items: InsightItem[] = raw.map((row, index) => {
    const delta = rowNum(row, ["delta", "change", "changePct", "deltaPct", "difference"]);
    return {
      id: rowStr(row, ["id", "key", "insightId"]) ?? `insight-${index}`,
      title: rowStr(row, ["title", "headline", "label", "text", "message"]) ?? "",
      evidence: rowStr(row, ["evidence", "detail", "because", "support", "description"]),
      metric: rowStr(row, ["metric", "metricKey", "metricName", "name"]),
      value: rowNum(row, ["value", "current", "latest", "amount"]),
      delta,
      direction: direction(rowStr(row, ["direction", "trend"]), delta),
      tone: tone(rowStr(row, ["tone", "severity", "status"])),
      at: rowStr(row, ["at", "observedAt", "createdAt", "ts"]),
    };
  });

  return ok({
    narrative: str(payload, ["narrative", "summary", "text", "commentary"]),
    items: items.filter((item) => item.title.length > 0),
    observed: num(payload, ["observed", "count", "recordCount", "insightCount"]),
    meta: meta(payload),
  });
};