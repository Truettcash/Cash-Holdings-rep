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

export type ProgressPoint = {
  at: string;
  completed: number | null;
  created: number | null;
  open: number | null;
};

export type ProjectsProgressModel = {
  granularity: string | null;
  points: ProgressPoint[];
  completedTotal: number | null;
  createdTotal: number | null;
  velocity: number | null;
  meta: AdapterMeta;
};

export const adaptProjectsProgress: Adapter<ProjectsProgressModel> = (payload) => {
  const invalid = requireEnvelope(payload, "projects_progress");
  if (invalid) return invalid;

  const raw = rows(payload, ["points", "series", "progress", "buckets", "rows", "items"]);
  const points: ProgressPoint[] = raw
    .map((row) => ({
      at: rowStr(row, ["at", "bucket", "period", "date", "day", "ts"]) ?? "",
      completed: rowNum(row, ["completed", "done", "completedTasks"]),
      created: rowNum(row, ["created", "opened", "createdTasks", "new"]),
      open: rowNum(row, ["open", "openTasks", "backlog"]),
    }))
    .filter((point) => point.at.length > 0);

  return ok({
    granularity: str(payload, ["granularity", "grain", "interval"]),
    points,
    completedTotal: num(payload, ["completedTotal", "completed", "totalCompleted"]),
    createdTotal: num(payload, ["createdTotal", "created", "totalCreated"]),
    velocity: num(payload, ["velocity", "throughput", "avgCompleted"]),
    meta: meta(payload),
  });
};