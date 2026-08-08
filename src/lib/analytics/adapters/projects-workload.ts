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

export type WorkloadBucket = {
  key: string;
  label: string;
  openTasks: number | null;
  overdueTasks: number | null;
  load: number | null;
};

export type ProjectsWorkloadModel = {
  buckets: WorkloadBucket[];
  openTasks: number | null;
  overdueTasks: number | null;
  blockedTasks: number | null;
  completedTasks: number | null;
  dueSoon: number | null;
  unassigned: number | null;
  meta: AdapterMeta;
};

export const adaptProjectsWorkload: Adapter<ProjectsWorkloadModel> = (payload) => {
  const invalid = requireEnvelope(payload, "projects_workload");
  if (invalid) return invalid;

  // Live shape: `data.workload = { open, blocked, overdue, completed }`.
  const w = obj(payload, ["workload"]);

  const raw = rows(payload, ["workload", "buckets", "items", "rows", "byProject", "byOwner"]);
  const buckets: WorkloadBucket[] = raw.map((row, index) => ({
    key: rowStr(row, ["key", "id", "project", "owner", "bucket", "label"]) ?? `bucket-${index}`,
    label: rowStr(row, ["label", "name", "project", "owner", "bucket"]) ?? `Bucket ${index + 1}`,
    openTasks: rowNum(row, ["openTasks", "open", "tasks", "count"]),
    overdueTasks: rowNum(row, ["overdueTasks", "overdue"]),
    load: rowNum(row, ["load", "share", "weight", "pct"]),
  }));

  return ok({
    buckets,
    openTasks: num(w, ["open", "openTasks"]) ?? num(payload, ["openTasks", "tasksOpen"]),
    overdueTasks: num(w, ["overdue", "overdueTasks"]) ?? num(payload, ["overdueTasks"]),
    blockedTasks: num(w, ["blocked", "blockedTasks"]) ?? num(payload, ["blockedTasks"]),
    completedTasks: num(w, ["completed", "completedTasks"]) ?? num(payload, ["completedTasks"]),
    dueSoon: num(payload, ["dueSoon", "due_soon", "upcoming"]),
    unassigned: num(payload, ["unassigned", "withoutOwner"]),
    meta: meta(payload),
  });
};