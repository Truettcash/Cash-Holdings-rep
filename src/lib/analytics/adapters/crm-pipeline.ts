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

export type PipelineStage = {
  key: string;
  label: string;
  count: number | null;
  value: number | null;
};

export type CrmPipelineModel = {
  stages: PipelineStage[];
  totalValue: number | null;
  openDeals: number | null;
  wonDeals: number | null;
  lostDeals: number | null;
  winRate: number | null;
  meta: AdapterMeta;
};

export const adaptCrmPipeline: Adapter<CrmPipelineModel> = (payload) => {
  const invalid = requireEnvelope(payload, "crm_pipeline");
  if (invalid) return invalid;

  const raw = rows(payload, ["stages", "pipeline", "items", "rows", "byStage"]);
  const stages: PipelineStage[] = raw.map((row, index) => ({
    key: rowStr(row, ["key", "stage", "stageKey", "id", "name"]) ?? `stage-${index}`,
    label: rowStr(row, ["label", "stageLabel", "stage", "name", "title"]) ?? `Stage ${index + 1}`,
    count: rowNum(row, ["count", "deals", "dealCount", "total"]),
    value: rowNum(row, ["value", "amount", "total_value", "pipelineValue"]),
  }));

  return ok({
    stages,
    totalValue: num(payload, ["totalValue", "pipelineValue", "value", "total_amount"]),
    openDeals: num(payload, ["openDeals", "open", "dealCount", "deals"]),
    wonDeals: num(payload, ["wonDeals", "won"]),
    lostDeals: num(payload, ["lostDeals", "lost"]),
    winRate: num(payload, ["winRate", "win_rate", "conversionRate"]),
    meta: meta(payload),
  });
};