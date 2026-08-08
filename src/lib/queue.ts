import type { Task, Deal, Project, Brand } from "./data";

export type QueueItem = {
  key: string;
  kind: "task" | "crm";
  task?: Task;
  deal?: Deal;
  title: string;
  brandName: string | null;
  projectName: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  bucket: number;
  reason: string;
};

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function bucketFor(t: Task): { bucket: number; reason: string } {
  if (t.status === "blocked") return { bucket: 0, reason: "BLOCKED" };
  const overdue = t.due_date && new Date(t.due_date).getTime() < today() && t.status !== "completed";
  if (t.priority === "critical" && t.status !== "completed" && t.status !== "archived")
    return { bucket: 1, reason: "CRITICAL" };
  if (t.priority === "high" && t.status === "in_progress")
    return { bucket: 2, reason: "HIGH · IN PROGRESS" };
  if (overdue) return { bucket: 3, reason: "OVERDUE" };
  if (t.priority === "high" && t.status === "todo")
    return { bucket: 4, reason: "HIGH · NEXT" };
  if (t.status === "in_progress") return { bucket: 5, reason: "IN PROGRESS" };
  if (t.priority === "medium") return { bucket: 7, reason: "MEDIUM" };
  return { bucket: 9, reason: t.priority?.toUpperCase() ?? "BACKLOG" };
}

export function buildQueue(
  tasks: Task[],
  projects: Project[],
  brands: Brand[],
  deals: Deal[],
  limit = 5
): QueueItem[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const brandById = new Map(brands.map((b) => [b.id, b]));

  const openTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "archived");

  const taskItems: QueueItem[] = openTasks.map((t) => {
    const proj = projectById.get(t.project_id);
    const brand = proj ? brandById.get(proj.brand_id) : null;
    const { bucket, reason } = bucketFor(t);
    return {
      key: `task:${t.id}`,
      kind: "task",
      task: t,
      title: t.title,
      brandName: brand?.name ?? null,
      projectName: proj?.name ?? null,
      priority: t.priority,
      status: t.status,
      dueDate: t.due_date,
      bucket,
      reason,
    };
  });

  const crmItems: QueueItem[] = deals
    .filter((d) => d.next_action_due && d.stage !== "won" && d.stage !== "lost")
    .map((d) => {
      const brand = d.brand_id ? brandById.get(d.brand_id) : null;
      return {
        key: `crm:${d.id}`,
        kind: "crm",
        deal: d,
        title: d.next_action ?? d.name,
        brandName: brand?.name ?? null,
        projectName: d.name,
        priority: "medium",
        status: d.stage,
        dueDate: d.next_action_due,
        bucket: 6,
        reason: "CRM · PLANNED",
      };
    });

  const all = [...taskItems, ...crmItems];

  all.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    const at = a.task?.created_at ?? a.deal?.created_at ?? "";
    const bt = b.task?.created_at ?? b.deal?.created_at ?? "";
    return bt.localeCompare(at);
  });

  return all.slice(0, limit);
}