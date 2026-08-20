import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { q } from "@/lib/data";
import { StatusPill, priorityTone, taskStatusTone } from "@/components/ui-bits";
import { PRIORITIES, STATUS_LABEL, TASK_STATUSES, formatDate } from "@/lib/domain";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const { brandFilter } = useApp();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: q.tasks });
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects });
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });

  const projById = new Map((projects.data ?? []).map((p) => [p.id, p]));
  const brandById = new Map((brands.data ?? []).map((b) => [b.id, b]));
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const rows = (tasks.data ?? [])
    .filter((t) => {
      const proj = projById.get(t.project_id);
      if (brandFilter !== "all" && proj?.brand_id !== brandFilter) return false;
      if (statusFilter === "open" && (t.status === "completed" || t.status === "archived"))
        return false;
      if (statusFilter !== "open" && statusFilter !== "all" && t.status !== statusFilter)
        return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const o = (s: string) =>
        s === "blocked" ? 0 : s === "in_progress" ? 1 : s === "todo" ? 2 : 3;
      return o(a.status) - o(b.status);
    });

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <div className="mono-label !text-[9px]">OPERATE / EXECUTION QUEUE</div>
          <h1 className="text-title mt-1">Tasks</h1>
        </div>
      </header>

      {/* Filter chips */}
      <div className="surface rounded-[10px] px-3 py-2 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search tasks…"
          className="bg-[var(--input-background)] border border-hairline rounded text-[11.5px] h-6 px-2 focus:outline-none focus:border-teal/60"
        />
        <ChipGroup
          value={statusFilter}
          onChange={setStatusFilter}
          options={["open", "all", ...TASK_STATUSES]}
          labelize={(v) => (v === "open" ? "OPEN" : v === "all" ? "ALL" : (STATUS_LABEL[v] ?? v).toUpperCase())}
        />
        <ChipGroup
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={["all", ...PRIORITIES]}
          labelize={(v) => (v === "all" ? "PRI" : v.toUpperCase())}
        />
        <span className="mono-label !text-[9px] ml-auto">{rows.length} TASKS</span>
      </div>

      <section className="surface rounded-[10px] overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <div className="mono-label !text-[10px]">NO WORK QUEUED</div>
            <div className="text-[12px] text-muted-foreground mt-1.5">
              Add the next execution item to begin moving the queue.
            </div>
          </div>
        ) : (
        <>
        {/* md+: dense table */}
        <table className="w-full text-[12.5px] hidden md:table">
          <thead>
            <tr className="mono-label text-left edge-b">
              <th className="font-normal px-3 py-2">Task</th>
              <th className="font-normal py-2">Brand</th>
              <th className="font-normal py-2">Project</th>
              <th className="font-normal py-2">Due</th>
              <th className="font-normal py-2 pr-3 text-right">Priority / Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const p = projById.get(t.project_id);
              const b = p ? brandById.get(p.brand_id) : undefined;
              return (
                <tr key={t.id} className="surface-interactive edge-b last:border-b-0 motion-micro h-12">
                  <td className="px-3.5 py-3 max-w-[360px] truncate">{t.title}</td>
                  <td className="py-2 text-muted-foreground">{b?.name ?? "—"}</td>
                  <td className="py-2 text-muted-foreground truncate max-w-[200px]">
                    {p ? (
                      <Link to="/projects" className="hover:text-foreground">
                        {p.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 mono-label !text-[10px]">{t.due_date ? formatDate(t.due_date) : "—"}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <StatusPill status={t.priority} tone={priorityTone(t.priority)} />
                      <StatusPill
                        status={STATUS_LABEL[t.status] ?? t.status}
                        tone={taskStatusTone(t.status)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* below md: stacked rows */}
        <ul className="md:hidden">
          {rows.map((t) => {
            const p = projById.get(t.project_id);
            const b = p ? brandById.get(p.brand_id) : undefined;
            return (
              <li key={t.id} className="px-3.5 py-3 edge-b last:border-b-0 surface-interactive motion-micro">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] truncate">{t.title}</div>
                    <div className="mono-label !text-[9px] mt-0.5 truncate">
                      {b?.name ?? "—"}
                      {p && <> · {p.name}</>}
                    </div>
                  </div>
                  <div className="mono-label !text-[9px] shrink-0">{t.due_date ? formatDate(t.due_date) : "—"}</div>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <StatusPill status={t.priority} tone={priorityTone(t.priority)} />
                  <StatusPill status={STATUS_LABEL[t.status] ?? t.status} tone={taskStatusTone(t.status)} />
                </div>
              </li>
            );
          })}
        </ul>
        </>
        )}
      </section>
    </div>
  );
}

function ChipGroup<T extends string>({
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