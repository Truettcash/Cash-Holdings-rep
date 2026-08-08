import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, ChevronRight, ChevronDown, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { q, type Brand, type Project, type Task } from "@/lib/data";
import { m } from "@/lib/mutations";
import {
  PRIORITIES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  STATUS_LABEL,
  formatDate,
  titleCase,
} from "@/lib/domain";
import { useApp } from "@/lib/app-context";
import { useAnalyticsSurface } from "@/lib/analytics/surfaces";
import { useAnalyticsScope } from "@/lib/analytics/scope";
import { SourceBadge } from "@/components/analytics/source-badge";
import { cn } from "@/lib/utils";
import { analyticsRefresh } from "@/lib/analytics/invalidate";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { brandFilter, openAdd } = useApp();
  const scope = useAnalyticsScope();
  // Portfolio-level counts prefer the modular RPCs; the list/board panes below
  // still read the raw tables because they need per-row task detail.
  const overviewRpc = useAnalyticsSurface("projects-overview", scope);
  const workloadRpc = useAnalyticsSurface("projects-workload", scope);
  const overview = overviewRpc.live ? overviewRpc.model : null;
  const workload = workloadRpc.live ? workloadRpc.model : null;
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: q.tasks });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardMode, setBoardMode] = useState<"list" | "board">("list");

  const projectTypes = useMemo(() => {
    const set = new Set<string>();
    (projects.data ?? []).forEach((p) => p.project_type && set.add(p.project_type));
    return Array.from(set);
  }, [projects.data]);

  const filtered = (projects.data ?? []).filter(
    (p) =>
      (brandFilter === "all" || p.brand_id === brandFilter) &&
      (statusFilter === "all" || p.status === statusFilter) &&
      (priorityFilter === "all" || p.priority === priorityFilter) &&
      (typeFilter === "all" || p.project_type === typeFilter) &&
      (!query || p.name.toLowerCase().includes(query.toLowerCase()))
  );

  const selected = filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

  // Top execution flow summary
  const allOpen = (tasks.data ?? []).filter(
    (t) => t.status !== "completed" && t.status !== "archived"
  );
  const counts = {
    active: overview?.active ?? (projects.data ?? []).filter((p) => p.status === "active").length,
    inProg: (tasks.data ?? []).filter((t) => t.status === "in_progress").length,
    blocked: overview?.blocked ?? (tasks.data ?? []).filter((t) => t.status === "blocked").length,
    completed:
      overview?.completed ?? (tasks.data ?? []).filter((t) => t.status === "completed").length,
    open: overview?.openTasks ?? workload?.openTasks ?? allOpen.length,
  };
  const priorityMix = PRIORITIES.map(
    (p) => ({ p, n: allOpen.filter((t) => t.priority === p).length })
  );
  const priorityTotal = priorityMix.reduce((s, x) => s + x.n, 0) || 1;

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="mono-label !text-[9px]">OPERATE / EXECUTION WORKSPACE</div>
          <h1 className="text-title mt-1 flex items-center gap-2">
            Projects
            <SourceBadge source={overviewRpc.source} malformed={overviewRpc.malformed} />
            <SourceBadge source={workloadRpc.source} malformed={workloadRpc.malformed} />
          </h1>
        </div>
        <button
          onClick={() =>
            openAdd("project", { brand_id: brandFilter === "all" ? undefined : brandFilter })
          }
          className="h-6 px-2.5 inline-flex items-center gap-1.5 rounded border border-teal/40 bg-teal-soft text-teal text-[10.5px] font-sans uppercase tracking-[0.06em] hover:bg-teal/20"
        >
          <Plus className="h-3 w-3" /> New Project
        </button>
      </header>

      {/* Execution flow summary */}
      <section className="glass-panel rounded-lg px-3 py-3 grid grid-cols-12 gap-3">
        <SummaryBlock label="Active Projects" value={counts.active} accent />
        <SummaryBlock label="In Progress" value={counts.inProg} accent={counts.inProg > 0} />
        <SummaryBlock
          label="Blocked"
          value={counts.blocked}
          tone={counts.blocked ? "danger" : undefined}
        />
        <SummaryBlock label="Completed" value={counts.completed} />
        <div className="col-span-12 md:col-span-8">
          <div className="mono-label !text-[9px] mb-1">PRIORITY MIX · OPEN TASKS</div>
          <div className="flex h-2 rounded overflow-hidden border border-hairline">
            {priorityMix.map(({ p, n }) => {
              const w = (n / priorityTotal) * 100;
              if (n === 0) return null;
              const color =
                p === "critical"
                  ? "bg-danger"
                  : p === "high"
                  ? "bg-warn"
                  : p === "medium"
                  ? "bg-teal"
                  : "bg-muted-foreground/50";
              return <div key={p} className={color} style={{ width: `${w}%` }} title={`${p}: ${n}`} />;
            })}
            {counts.open === 0 && <div className="bg-muted-foreground/20 flex-1" />}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 mono-label !text-[9px]">
            {priorityMix.map(({ p, n }) => (
              <span key={p} className="inline-flex items-center gap-1">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    p === "critical"
                      ? "bg-danger"
                      : p === "high"
                      ? "bg-warn"
                      : p === "medium"
                      ? "bg-teal"
                      : "bg-muted-foreground/50"
                  )}
                />
                {p} · {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Three-pane workspace */}
      <div className="grid grid-cols-12 gap-3">
        {/* LEFT — index */}
        <section className="col-span-12 lg:col-span-3 glass-panel rounded-lg flex flex-col min-h-[60vh]">
          <header className="px-3 h-9 border-b border-hairline flex items-center justify-between">
            <div className="mono-label !text-[9px]">PROJECTS · {filtered.length}</div>
          </header>
          <div className="px-3 pt-2 pb-2 border-b border-hairline space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filter projects"
                className="w-full bg-[var(--input-background)] border border-hairline rounded text-[11.5px] h-6 pl-6 pr-2 focus:outline-none focus:border-teal/60"
              />
            </div>
            <Chips
              value={statusFilter}
              onChange={setStatusFilter}
              options={["all", ...PROJECT_STATUSES]}
              labelize={(v) => (v === "all" ? "ALL" : (STATUS_LABEL[v] ?? v).toUpperCase())}
            />
            <Chips
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={["all", ...PRIORITIES]}
              labelize={(v) => (v === "all" ? "PRI" : v.toUpperCase())}
            />
            {projectTypes.length > 0 && (
              <Chips
                value={typeFilter}
                onChange={setTypeFilter}
                options={["all", ...projectTypes]}
                labelize={(v) => (v === "all" ? "TYPE" : v.toUpperCase())}
              />
            )}
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-hairline">
            {filtered.length === 0 ? (
              <li className="p-6 mono-label !text-[10px] text-center">No projects match.</li>
            ) : (
              filtered.map((p) => {
                const brand = brands.data?.find((b) => b.id === p.brand_id);
                const open = (tasks.data ?? []).filter(
                  (t) =>
                    t.project_id === p.id &&
                    t.status !== "completed" &&
                    t.status !== "archived"
                ).length;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "w-full text-left px-3.5 py-3 transition-colors motion-micro",
                        selected?.id === p.id
                          ? "bg-teal-soft/40 border-l-2 border-teal -ml-px"
                          : "hover:bg-accent/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            p.priority === "critical"
                              ? "bg-danger"
                              : p.priority === "high"
                              ? "bg-warn"
                              : p.status === "active"
                              ? "bg-teal"
                              : "bg-muted-foreground/40"
                          )}
                        />
                        <div className="text-[12.5px] font-medium truncate flex-1">{p.name}</div>
                        <span className="mono-label !text-[9px] tabular-nums">{open}</span>
                      </div>
                      <div className="mono-label !text-[9px] mt-0.5 truncate">
                        {brand?.name ?? "—"} · {STATUS_LABEL[p.status] ?? p.status}
                        {p.due_date && <> · DUE {formatDate(p.due_date)}</>}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* CENTER — execution board */}
        <section className="col-span-12 lg:col-span-6 glass-panel rounded-lg flex flex-col min-h-[60vh]">
          {selected ? (
            <ExecutionBoard
              project={selected}
              brand={brands.data?.find((b) => b.id === selected.brand_id) ?? null}
              boardMode={boardMode}
              setBoardMode={setBoardMode}
            />
          ) : (
            <div className="grid place-items-center h-full">
              <div className="mono-label !text-[10px]">No project selected.</div>
            </div>
          )}
        </section>

        {/* RIGHT — intelligence */}
        <section className="col-span-12 lg:col-span-3 glass-panel rounded-lg flex flex-col min-h-[60vh]">
          {selected ? (
            <ProjectIntelligence
              project={selected}
              brand={brands.data?.find((b) => b.id === selected.brand_id) ?? null}
            />
          ) : (
            <div className="grid place-items-center h-full">
              <div className="mono-label !text-[10px]">—</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryBlock({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  tone?: "danger" | "warn";
}) {
  return (
    <div className="col-span-6 md:col-span-1 border border-hairline rounded-lg p-3">
      <div className="mono-label !text-[9px]">{label}</div>
      <div
        className={cn(
          "mt-1 text-[20px] tabular-nums font-medium leading-none",
          tone === "danger" && Number(value) > 0 ? "text-danger" : accent ? "text-teal" : ""
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Chips<T extends string>({
  value,
  onChange,
  options,
  labelize,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  labelize: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            "px-1.5 h-5 rounded text-[9.5px] font-sans uppercase tracking-[0.1em] border transition-colors",
            value === o
              ? "bg-teal-soft text-teal border-teal/40"
              : "border-hairline text-muted-foreground hover:text-foreground"
          )}
        >
          {labelize(o)}
        </button>
      ))}
    </div>
  );
}

/* ============ Execution Board ============ */

function ExecutionBoard({
  project,
  brand,
  boardMode,
  setBoardMode,
}: {
  project: Project;
  brand: Brand | null;
  boardMode: "list" | "board";
  setBoardMode: (m: "list" | "board") => void;
}) {
  const { openAdd } = useApp();
  const projectTasks = useQuery({
    queryKey: ["tasks", "by-project", project.id],
    queryFn: () => q.tasksByProject(project.id),
  });
  const tasks = projectTasks.data ?? [];

  const groups = {
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    todo: tasks.filter((t) => t.status === "todo"),
    blocked: tasks.filter((t) => t.status === "blocked"),
    completed: tasks.filter((t) => t.status === "completed"),
  };

  const blockedOpen = groups.blocked.length;
  const health = blockedOpen ? "ATTN" : groups.in_progress.length ? "MOVING" : "IDLE";

  return (
    <>
      <header className="px-3.5 py-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              health === "ATTN" ? "bg-danger" : health === "MOVING" ? "bg-teal teal-glow" : "bg-muted-foreground/40"
            )}
          />
          <div className="text-heading truncate">{project.name}</div>
          <span className="mono-label !text-[9px] text-foreground/60 ml-auto">{health}</span>
        </div>
        <div className="mono-label !text-[9px] mt-1 truncate">
          {brand?.name ?? "—"} · {STATUS_LABEL[project.status] ?? project.status} · {project.priority.toUpperCase()}
          {project.due_date && <> · DUE {formatDate(project.due_date)}</>}
        </div>
      </header>

      <div className="px-3 h-9 border-b border-hairline flex items-center justify-between">
        <div className="mono-label !text-[9px]">TASK WORKFLOW · {tasks.length}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setBoardMode("list")}
            className={cn(
              "px-1.5 h-5 rounded text-[9.5px] font-sans uppercase tracking-[0.1em] border",
              boardMode === "list"
                ? "bg-teal-soft text-teal border-teal/40"
                : "border-hairline text-muted-foreground"
            )}
          >
            List
          </button>
          <button
            onClick={() => setBoardMode("board")}
            className={cn(
              "px-1.5 h-5 rounded text-[9.5px] font-sans uppercase tracking-[0.1em] border",
              boardMode === "board"
                ? "bg-teal-soft text-teal border-teal/40"
                : "border-hairline text-muted-foreground"
            )}
          >
            Board
          </button>
          <button
            onClick={() =>
              openAdd("task", { brand_id: project.brand_id, project_id: project.id })
            }
            className="ml-2 h-5 px-2 rounded border border-teal/40 bg-teal-soft text-teal text-[9.5px] font-sans uppercase tracking-[0.06em] hover:bg-teal/20 inline-flex items-center gap-1"
          >
            <Plus className="h-2.5 w-2.5" /> Task
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mono-label !text-[10px]">No tasks yet.</div>
            <button
              onClick={() =>
                openAdd("task", { brand_id: project.brand_id, project_id: project.id })
              }
              className="mt-3 h-6 px-2.5 inline-flex items-center rounded border border-teal/40 bg-teal-soft text-teal text-[10.5px] font-sans uppercase tracking-[0.06em] hover:bg-teal/20"
            >
              Add first task
            </button>
          </div>
        ) : boardMode === "list" ? (
          <div>
            <TaskGroup title="In Progress" tasks={groups.in_progress} />
            <TaskGroup title="Next" tasks={groups.todo} />
            <TaskGroup title="Blocked" tasks={groups.blocked} tone="danger" />
            <TaskGroup title="Completed" tasks={groups.completed} defaultOpen={false} />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 p-2">
            {(["in_progress", "todo", "blocked", "completed"] as const).map((s) => (
              <BoardColumn key={s} title={STATUS_LABEL[s] ?? s} tasks={groups[s]} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TaskGroup({
  title,
  tasks,
  tone,
  defaultOpen = true,
}: {
  title: string;
  tasks: Task[];
  tone?: "danger";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-hairline">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3.5 h-9 flex items-center justify-between bg-[var(--surface-2)] hover:bg-[var(--surface-3)] motion-micro"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span
            className={cn(
              "mono-label !text-[9px]",
              tone === "danger" ? "text-danger" : ""
            )}
          >
            {title.toUpperCase()}
          </span>
        </div>
        <span className="mono-label !text-[9px] tabular-nums">{tasks.length}</span>
      </button>
      {open && (
        <ul className="divide-y divide-hairline">
          {tasks.length === 0 ? (
            <li className="px-3 py-2 mono-label !text-[9px] opacity-50">empty</li>
          ) : (
            tasks.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </ul>
      )}
    </div>
  );
}

function BoardColumn({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <div className="border border-hairline rounded">
      <div className="px-2 h-7 border-b border-hairline flex items-center justify-between bg-[var(--surface-2)]">
        <span className="mono-label !text-[9px]">{title.toUpperCase()}</span>
        <span className="mono-label !text-[9px] tabular-nums">{tasks.length}</span>
      </div>
      <div className="p-1.5 space-y-1.5 min-h-[80px]">
        {tasks.length === 0 ? (
          <div className="mono-label !text-[9px] opacity-50 text-center py-3">—</div>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className="border border-hairline rounded p-2 text-[11.5px] hover:border-teal/40"
            >
              <div className="truncate font-medium">{t.title}</div>
              <div className="mono-label !text-[9px] mt-1">
                {t.priority.toUpperCase()}
                {t.due_date && <> · {formatDate(t.due_date)}</>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [pri, setPri] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [due, setDue] = useState(task.due_date ?? "");
  const [blocker, setBlocker] = useState(task.blocker_reason ?? "");

  const update = useMutation({
    mutationFn: (patch: any) => m.updateTask(task.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      analyticsRefresh.projectOrTaskChanged(qc);
      toast.success("Task updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const complete = useMutation({
    mutationFn: () => m.completeTask(task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      analyticsRefresh.projectOrTaskChanged(qc);
      toast.success("Task completed");
    },
  });
  const reopen = useMutation({
    mutationFn: () => m.updateTask(task.id, { status: "todo", completed_at: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      analyticsRefresh.projectOrTaskChanged(qc);
      toast.success("Task re-opened");
    },
  });

  const isCompleted = task.status === "completed";

  return (
    <li className={cn("transition-colors", expanded && "bg-accent/30")}>
      <div className="px-3.5 py-3 flex items-center gap-2.5">
        <button
          onClick={() => {
            if (isCompleted) {
              if (confirm("Re-open this completed task?")) reopen.mutate();
            } else {
              complete.mutate();
            }
          }}
          className={cn(
            "h-4 w-4 rounded border border-hairline grid place-items-center shrink-0 transition-colors",
            isCompleted && "bg-teal border-teal"
          )}
          aria-label="Toggle complete"
        >
          {isCompleted && <Check className="h-2.5 w-2.5 text-teal-foreground" />}
        </button>
        <button onClick={() => setExpanded((v) => !v)} className="flex-1 text-left min-w-0">
          <div className={cn("text-[12.5px] truncate", isCompleted && "line-through text-muted-foreground")}>
            {task.title}
          </div>
          <div className="mono-label !text-[9px] mt-0.5 flex items-center gap-2 truncate">
            <span>{task.priority.toUpperCase()}</span>
            {task.due_date && <span>· {formatDate(task.due_date)}</span>}
            {task.status === "blocked" && task.blocker_reason && (
              <span className="text-danger truncate">· {task.blocker_reason}</span>
            )}
          </div>
        </button>
        <span
          className={cn(
            "px-1.5 h-5 rounded text-[9.5px] font-sans uppercase tracking-[0.1em] border inline-flex items-center",
            task.status === "blocked"
              ? "border-danger/40 text-danger"
              : task.status === "in_progress"
              ? "border-teal/40 text-teal"
              : "border-hairline text-muted-foreground"
          )}
        >
          {(STATUS_LABEL[task.status] ?? task.status).replace(/ /g, "·")}
        </span>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-hairline pt-2 grid grid-cols-12 gap-2">
          <div className="col-span-12 md:col-span-7">
            <div className="mono-label !text-[9px] mb-1">DESCRIPTION</div>
            <div className="text-[12px] text-foreground/85 whitespace-pre-wrap min-h-[40px]">
              {task.description || <span className="text-muted-foreground">No description.</span>}
            </div>
          </div>
          <div className="col-span-12 md:col-span-5 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-[var(--input-background)] border border-hairline rounded text-[11.5px] h-6 px-1.5"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                  ))}
                </select>
              </Mini>
              <Mini label="Priority">
                <select
                  value={pri}
                  onChange={(e) => setPri(e.target.value)}
                  className="w-full bg-[var(--input-background)] border border-hairline rounded text-[11.5px] h-6 px-1.5"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{titleCase(p)}</option>
                  ))}
                </select>
              </Mini>
            </div>
            <Mini label="Due">
              <input
                type="date"
                value={due ?? ""}
                onChange={(e) => setDue(e.target.value)}
                className="w-full bg-[var(--input-background)] border border-hairline rounded text-[11.5px] h-6 px-1.5"
              />
            </Mini>
            {status === "blocked" && (
              <Mini label="Blocked reason">
                <input
                  value={blocker}
                  onChange={(e) => setBlocker(e.target.value)}
                  placeholder="What's blocking this?"
                  className="w-full bg-[var(--input-background)] border border-hairline rounded text-[11.5px] h-6 px-1.5"
                />
              </Mini>
            )}
            <div className="flex justify-end pt-1">
              <button
                onClick={() =>
                  update.mutate({
                    priority: pri,
                    status,
                    due_date: due || null,
                    blocker_reason: status === "blocked" ? blocker || null : null,
                  })
                }
                disabled={update.isPending}
                className="h-6 px-2.5 rounded border border-teal/40 bg-teal-soft text-teal text-[10px] font-sans uppercase tracking-[0.06em] hover:bg-teal/20 disabled:opacity-50"
              >
                {update.isPending ? "Saving…" : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono-label !text-[9px] mb-1">{label}</div>
      {children}
    </div>
  );
}

/* ============ Project Intelligence (right pane) ============ */

function ProjectIntelligence({
  project,
  brand,
}: {
  project: Project;
  brand: Brand | null;
}) {
  const { openAdd } = useApp();
  const qc = useQueryClient();
  const activities = useQuery({
    queryKey: ["activities", 50],
    queryFn: () => q.activities(50),
  });
  const linkedActs = (activities.data ?? []).filter(
    (a) => a.brand_id === project.brand_id
  );

  const completeProject = useMutation({
    mutationFn: async () => {
      const { error } = await (await import("@/integrations/cash-holdings/client"))
        .cashHoldingsSupabase
        .from("projects" as any)
        .update({ status: "completed" } as any)
        .eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      analyticsRefresh.projectOrTaskChanged(qc);
      toast.success("Project marked complete");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <header className="px-3 h-9 border-b border-hairline flex items-center justify-between">
        <div className="mono-label !text-[9px]">PROJECT INTELLIGENCE</div>
      </header>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <div className="mono-label !text-[9px] mb-1">DESCRIPTION</div>
          <p className="text-[12px] text-foreground/85 whitespace-pre-wrap">
            {project.description || (
              <span className="text-muted-foreground/70 italic">No description recorded.</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mono-label !text-[9px]">TARGET DATE</div>
            <div className="text-[12px] tabular-nums mt-0.5">
              {project.due_date ? formatDate(project.due_date) : "—"}
            </div>
          </div>
          <div>
            <div className="mono-label !text-[9px]">TYPE</div>
            <div className="text-[12px] mt-0.5">{project.project_type ?? "—"}</div>
          </div>
        </div>

        <div>
          <div className="mono-label !text-[9px] mb-1">LINKED ACTIVITY · {linkedActs.length}</div>
          {linkedActs.length === 0 ? (
            <div className="text-[11.5px] text-muted-foreground/70 italic">No activity logged.</div>
          ) : (
            <ul className="space-y-1.5">
              {linkedActs.slice(0, 4).map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-teal/70 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11.5px] truncate">{a.subject}</div>
                    <div className="mono-label !text-[9px]">
                      {a.activity_type} · {formatDate(a.activity_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <ActionBtn onClick={() => openAdd("task", { brand_id: project.brand_id, project_id: project.id })}>
            + Task
          </ActionBtn>
          <ActionBtn onClick={() => openAdd("activity", { brand_id: project.brand_id })}>
            + Activity
          </ActionBtn>
          <ActionBtn
            onClick={() => completeProject.mutate()}
            disabled={project.status === "completed"}
          >
            Mark Complete
          </ActionBtn>
          <ActionBtn
            onClick={() => openAdd("metric", { brand_id: project.brand_id })}
          >
            + Metric
          </ActionBtn>
        </div>
      </div>
    </>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-7 px-2 rounded border border-hairline text-[11px] hover:border-teal/40 hover:text-teal disabled:opacity-50 disabled:hover:border-hairline disabled:hover:text-foreground"
    >
      {children}
    </button>
  );
}