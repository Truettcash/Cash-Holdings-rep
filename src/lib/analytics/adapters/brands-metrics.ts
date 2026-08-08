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

export type MetricSeriesPoint = { at: string; value: number | null };

export type MetricSeries = {
  key: string;
  label: string;
  unit: string | null;
  latest: number | null;
  delta: number | null;
  /** null is preserved: an unsupported metric never becomes 0. */
  supported: boolean;
  /** Backend flag: the metric exists but has too little history to trend. */
  insufficientHistory: boolean;
  points: MetricSeriesPoint[];
};

export type BrandsMetricsModel = {
  granularity: string | null;
  series: MetricSeries[];
  observations: number | null;
  meta: AdapterMeta;
};

export const adaptBrandsMetrics: Adapter<BrandsMetricsModel> = (payload) => {
  const invalid = requireEnvelope(payload, "brands_metrics");
  if (invalid) return invalid;

  const raw = rows(payload, ["metrics", "series", "definitions", "items", "rows"]);
  const series: MetricSeries[] = raw.map((row, index) => {
    const pointRows = rows(row, ["points", "series", "observations", "values", "data"]);
    const points: MetricSeriesPoint[] = pointRows
      .map((point) => ({
        at: rowStr(point, ["at", "bucket", "period", "date", "observedAt", "ts", "day"]) ?? "",
        value: rowNum(point, ["value", "v", "amount", "observation"]),
      }))
      .filter((point) => point.at.length > 0);

    const unsupported = row["supported"] === false || row["unsupported"] === true;

    return {
      key: rowStr(row, ["key", "metricKey", "id", "name"]) ?? `metric-${index}`,
      label:
        rowStr(row, ["label", "name", "metricName", "title"]) ??
        rowStr(row, ["metricKey", "key"]) ??
        `Metric ${index + 1}`,
      unit: rowStr(row, ["unit", "units", "format"]),
      latest: rowNum(row, ["latest", "value", "current", "lastValue"]),
      delta: rowNum(row, ["delta", "change", "changePct", "trend"]),
      supported: !unsupported,
      insufficientHistory: row["insufficientHistory"] === true || row["insufficient_history"] === true,
      points,
    };
  });

  return ok({
    granularity: str(payload, ["granularity", "grain", "interval"]),
    series,
    observations: num(payload, ["observations", "observationCount", "recordCount", "count"]),
    meta: meta(payload),
  });
};