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

export type ProjectSummary = {
  id: string;
  name: string;
  brandKey: string | null;
  status: string | null;
  openTasks: number | null;
  completedTasks: number | null;
  completion: number | null;
  dueAt: string | null;
};

export type ProjectsOverviewModel = {
  projects: ProjectSummary[];
  total: number | null;
  active: number | null;
  planned: number | null;
  blocked: number | null;
  completed: number | null;
  openTasks: number | null;
  overdueTasks: number | null;
  completionRate: number | null;
  meta: AdapterMeta;
};

export const adaptProjectsOverview: Adapter<ProjectsOverviewModel> = (payload) => {
  const invalid = requireEnvelope(payload, "projects_overview");
  if (invalid) return invalid;

  // Live shape: `data.overview = { active, blocked, planned, completed }`.
  const o = obj(payload, ["overview"]);

  const raw = rows(payload, ["projects", "items", "rows", "records"]);
  const projects: ProjectSummary[] = raw.map((row, index) => ({
    id: rowStr(row, ["id", "projectId", "key"]) ?? `project-${index}`,
    name: rowStr(row, ["name", "title", "project", "label"]) ?? "",
    brandKey: rowStr(row, ["brandKey", "brand", "brandSlug"]),
    status: rowStr(row, ["status", "state", "phase"]),
    openTasks: rowNum(row, ["openTasks", "tasksOpen", "open"]),
    completedTasks: rowNum(row, ["completedTasks", "tasksCompleted", "done"]),
    completion: rowNum(row, ["completion", "progress", "completionRate", "pctComplete"]),
    dueAt: rowStr(row, ["dueAt", "dueDate", "due_date", "targetDate"]),
  }));

  return ok({
    projects: projects.filter((p) => p.name.length > 0 || p.id.length > 0),
    total: num(payload, ["total", "projects", "projectCount", "recordCount"]),
    active: num(o, ["active", "inProgress"]) ?? num(payload, ["active", "activeProjects", "inProgress"]),
    planned: num(o, ["planned", "backlog"]) ?? num(payload, ["planned", "plannedProjects"]),
    blocked: num(o, ["blocked", "atRisk"]) ?? num(payload, ["blocked", "blockedProjects", "atRisk"]),
    completed: num(o, ["completed", "done"]) ?? num(payload, ["completed", "completedProjects", "done"]),
    openTasks: num(payload, ["openTasks", "tasksOpen"]),
    overdueTasks: num(payload, ["overdueTasks", "tasksOverdue", "overdue"]),
    completionRate: num(payload, ["completionRate", "completion", "progress"]),
    meta: meta(payload),
  });
};