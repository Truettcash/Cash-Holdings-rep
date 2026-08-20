import {
  meta,
  num,
  obj,
  ok,
  requireEnvelope,
  rowNum,
  rowStr,
  rows,
  type Adapter,
  type AdapterMeta,
} from "./envelope";

export type QualificationBand = {
  key: string;
  label: string;
  count: number | null;
  share: number | null;
};

export type CrmQualificationModel = {
  average: number | null;
  median: number | null;
  rate: number | null;
  qualified: number | null;
  unqualified: number | null;
  scored: number | null;
  bands: QualificationBand[];
  meta: AdapterMeta;
};

export const adaptCrmQualification: Adapter<CrmQualificationModel> = (payload) => {
  const invalid = requireEnvelope(payload, "crm_qualification");
  if (invalid) return invalid;

  // Live shape: `data.qualification = { count, averageScore }`.
  const q = obj(payload, ["qualification"]);

  const raw = rows(payload, ["bands", "distribution", "buckets", "rows", "items"]);
  const bands: QualificationBand[] = raw.map((row, index) => ({
    key: rowStr(row, ["key", "band", "bucket", "id", "label"]) ?? `band-${index}`,
    label: rowStr(row, ["label", "band", "bucket", "name"]) ?? `Band ${index + 1}`,
    count: rowNum(row, ["count", "total", "engagements"]),
    share: rowNum(row, ["share", "pct", "percent", "ratio"]),
  }));

  return ok({
    average:
      num(q, ["averageScore", "average", "avgScore", "mean"]) ??
      num(payload, ["average", "qualificationAverage", "avgScore", "averageScore", "mean"]),
    median: num(q, ["median", "medianScore"]) ?? num(payload, ["median", "medianScore"]),
    rate:
      num(q, ["rate", "qualificationRate", "qualifiedRate"]) ??
      num(payload, ["rate", "qualificationRate", "qualifiedRate", "qualifiedShare"]),
    qualified: num(q, ["qualified", "qualifiedCount"]) ?? num(payload, ["qualified", "qualifiedCount"]),
    unqualified:
      num(q, ["unqualified", "disqualified"]) ??
      num(payload, ["unqualified", "unqualifiedCount", "disqualified"]),
    scored:
      num(q, ["count", "scored", "scoredCount", "total"]) ??
      num(payload, ["scored", "scoredCount", "total", "recordCount"]),
    bands,
    meta: meta(payload),
  });
};