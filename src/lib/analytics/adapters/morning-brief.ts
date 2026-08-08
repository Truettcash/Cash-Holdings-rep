import {
  fail,
  meta,
  num,
  ok,
  requireEnvelope,
  rowStr,
  rows,
  str,
  type Adapter,
  type AdapterMeta,
} from "./envelope";

export type BriefLine = {
  key: string;
  label: string | null;
  text: string;
  group: string | null;
  tone: "neutral" | "teal" | "warn" | "success";
  at: string | null;
};

export type MorningBriefModel = {
  headline: string | null;
  windowLabel: string | null;
  total: number | null;
  attentionCount: number | null;
  openWork: number | null;
  brands: number | null;
  projects: number | null;
  lines: BriefLine[];
  meta: AdapterMeta;
};

const TONES = new Set(["neutral", "teal", "warn", "success"]);

function tone(value: string | null): BriefLine["tone"] {
  if (value && TONES.has(value)) return value as BriefLine["tone"];
  if (value === "attention" || value === "warning" || value === "risk") return "warn";
  if (value === "win" || value === "positive") return "success";
  return "neutral";
}

export const adaptMorningBrief: Adapter<MorningBriefModel> = (payload) => {
  const invalid = requireEnvelope(payload, "dashboard_morning_brief");
  if (invalid) return invalid;

  const raw = rows(payload, ["lines", "items", "updates", "sections", "brief", "events"]);
  const lines: BriefLine[] = raw.map((row, index) => ({
    key: rowStr(row, ["key", "id"]) ?? `line-${index}`,
    label: rowStr(row, ["label", "title", "heading"]),
    text: rowStr(row, ["text", "message", "summary", "description", "label"]) ?? "",
    group: rowStr(row, ["group", "section", "category", "type"]),
    tone: tone(rowStr(row, ["tone", "severity", "status"])),
    at: rowStr(row, ["at", "ts", "occurredAt", "createdAt", "activityAt", "timestamp"]),
  }));

  const model: MorningBriefModel = {
    headline: str(payload, ["headline", "summaryText", "narrative", "title"]),
    windowLabel: str(payload, ["windowLabel", "window", "periodLabel", "rangeLabel"]),
    total: num(payload, ["total", "updates", "updateCount", "totalUpdates"]),
    attentionCount: num(payload, ["attentionCount", "needsAttention", "attention", "attentionItems"]),
    openWork: num(payload, ["openWork", "openTasks", "tasksOpen"]),
    brands: num(payload, ["brands", "brandCount"]),
    projects: num(payload, ["projects", "projectCount"]),
    lines: lines.filter((line) => line.text.length > 0),
    meta: meta(payload),
  };

  const hasSignal =
    model.lines.length > 0 ||
    typeof model.total === "number" ||
    typeof model.attentionCount === "number" ||
    typeof model.openWork === "number";
  if (!hasSignal) return fail("dashboard_morning_brief: no recognised brief fields");
  return ok(model);
};