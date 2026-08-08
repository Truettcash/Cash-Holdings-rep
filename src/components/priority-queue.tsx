import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ArrowUpRight, Check } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { QueueItem } from "@/lib/queue";
import { m } from "@/lib/mutations";
import { PRIORITIES, TASK_STATUSES, formatDate } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { analyticsRefresh } from "@/lib/analytics/invalidate";

const inputCls =
  "bg-[var(--input-background)] border border-hairline rounded px-2 h-7 text-[12px] focus:outline-none focus:border-teal/60";

function priorityClass(p: string) {
  if (p === "critical") return "text-danger border-danger/40 bg-danger/10";
  if (p === "high") return "text-warn border-warn/40 bg-warn/10";
  return "text-muted-foreground border-hairline bg-transparent";
}
function statusDot(s: string) {
  if (s === "blocked") return "bg-danger";
  if (s === "in_progress") return "bg-teal teal-glow";
  if (s === "completed") return "bg-success";
  return "bg-muted-foreground/40";
}

export function PriorityQueue({ items }: { items: QueueItem[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(items[0]?.key ?? null);

  return (
    <section className="glass-panel rounded-lg flex flex-col">
      <header className="flex items-center justify-between px-3 h-9 border-b border-hairline">
        <div className="flex items-baseline gap-3">
          <span className="mono-label !text-[9px]">HOLDINGS PRIORITY QUEUE</span>
          <span className="mono-label !text-[9px] text-foreground/70">TOP 5 NEXT MOVES</span>
        </div>
        <span className="mono-label !text-[9px] text-teal">{items.length} QUEUED</span>
      </header>
      {items.length === 0 ? (
        <div className="px-3 py-8 text-center">
          <div className="mono-label !text-[10px]">QUEUE CLEAR</div>
          <div className="text-[12px] text-muted-foreground mt-1.5">
            No blocked, critical, or overdue work. Add the next execution item.
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {items.map((it, idx) => (
            <QueueRow
              key={it.key}
              rank={idx + 1}
              item={it}
              expanded={expandedKey === it.key}
              onToggle={() =>
                setExpandedKey((cur) => (cur === it.key ? null : it.key))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueRow({
  rank,
  item,
  expanded,
  onToggle,
}: {
  rank: number;
  item: QueueItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const task = item.task;

  const [pri, setPri] = useState(item.priority);
  const [status, setStatus] = useState(item.status);
  const [due, setDue] = useState(item.dueDate ?? "");
  const [blocker, setBlocker] = useState(task?.blocker_reason ?? "");
  const [saving, setSaving] = useState(false);

  const isTask = item.kind === "task" && task;

  const save = async () => {
    if (!isTask) return;
    setSaving(true);
    try {
      await m.updateTask(task.id, {
        priority: pri,
        status,
        due_date: due || null,
        blocker_reason: status === "blocked" ? blocker || null : null,
      });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      analyticsRefresh.projectOrTaskChanged(qc);
      toast.success("Task updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (!isTask) return;
    setSaving(true);
    try {
      await m.completeTask(task.id);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      analyticsRefresh.projectOrTaskChanged(qc);
      toast.success("Task completed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={cn("transition-colors", expanded && "bg-accent/30")}>
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="grid grid-cols-[24px_10px_1fr_auto_auto] sm:grid-cols-[28px_14px_1fr_140px_90px_70px_80px] items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/40 focus-visible:bg-accent/40 focus:outline-none"
      >
        <div className="font-mono text-[10.5px] text-muted-foreground tabular-nums tracking-wider">
          {String(rank).padStart(2, "0")}
        </div>
        <span className={cn("h-2 w-2 rounded-full", statusDot(item.status))} />
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium truncate leading-tight">{item.title}</div>
          <div className="mono-label !text-[9px] mt-0.5 flex items-center gap-1.5 truncate">
            <span className="text-teal">{item.reason}</span>
            {item.brandName && <span>· {item.brandName}</span>}
            {item.projectName && <span className="truncate">· {item.projectName}</span>}
          </div>
        </div>
        <div className="hidden sm:block mono-label !text-[9px] truncate">{item.projectName ?? "—"}</div>
        <span
          className={cn(
            "hidden sm:inline-flex justify-center px-2 h-5 rounded text-[9.5px] font-sans uppercase tracking-[0.06em] border items-center",
            priorityClass(item.priority)
          )}
        >
          {item.priority}
        </span>
        <div className="hidden sm:block mono-label !text-[9px] text-right tabular-nums">
          {item.dueDate ? formatDate(item.dueDate) : "—"}
        </div>
        <div className="flex justify-end gap-1">
          {isTask ? (
            <button
              onClick={(e) => { e.stopPropagation(); complete(); }}
              disabled={saving}
              title="Complete"
              className="h-7 w-7 sm:h-5 sm:w-5 inline-flex items-center justify-center rounded border border-hairline hover:border-teal/60 hover:text-teal"
            >
              <Check className="h-3 w-3" />
            </button>
          ) : null}
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="h-7 w-7 sm:h-5 sm:w-5 inline-flex items-center justify-center rounded border border-hairline hover:border-teal/60 hover:text-teal"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <div
        className={cn(expanded ? "ch-expand" : "ch-collapse")}
        aria-hidden={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
        <div className="px-3 pb-3 pt-1 border-t border-hairline">
          {isTask ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
              <div className="md:col-span-7">
                <div className="mono-label !text-[9px] mb-1">DESCRIPTION</div>
                <div className="text-[12.5px] text-foreground/85 whitespace-pre-wrap min-h-[40px]">
                  {task?.description || <span className="text-muted-foreground">No description.</span>}
                </div>
                <div className="mono-label !text-[9px] mt-3 mb-1">CONTEXT</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {item.brandName ?? "—"} · {item.projectName ?? "—"}
                </div>
              </div>
              <div className="md:col-span-5 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mono-label !text-[9px] mb-1">STATUS</div>
                    <select className={cn(inputCls, "w-full h-9 sm:h-7")} value={status} onChange={(e) => setStatus(e.target.value)}>
                      {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="mono-label !text-[9px] mb-1">PRIORITY</div>
                    <select className={cn(inputCls, "w-full h-9 sm:h-7")} value={pri} onChange={(e) => setPri(e.target.value)}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div className="mono-label !text-[9px] mb-1">DUE</div>
                  <input type="date" className={cn(inputCls, "w-full h-9 sm:h-7")} value={due ?? ""} onChange={(e) => setDue(e.target.value)} />
                </div>
                {status === "blocked" && (
                  <div>
                    <div className="mono-label !text-[9px] mb-1">BLOCKED REASON</div>
                    <input className={cn(inputCls, "w-full h-9 sm:h-7")} value={blocker} onChange={(e) => setBlocker(e.target.value)} />
                  </div>
                )}
                <div className="flex justify-between items-center pt-1">
                  <button
                    onClick={() => navigate({ to: "/projects" })}
                    className="mono-label !text-[9px] text-teal hover:opacity-80 inline-flex items-center gap-1"
                  >
                    OPEN PROJECT <ArrowUpRight className="h-3 w-3" />
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="h-8 sm:h-6 px-3 sm:px-2.5 rounded border border-teal/40 bg-teal-soft text-teal text-[10px] font-sans uppercase tracking-[0.06em] hover:bg-teal/20 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Update"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-2 grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-8">
                <div className="mono-label !text-[9px] mb-1">DEAL</div>
                <div className="text-[12.5px]">{item.deal?.name}</div>
                <div className="mono-label !text-[9px] mt-3 mb-1">NEXT ACTION</div>
                <div className="text-[12.5px]">{item.deal?.next_action ?? "—"}</div>
              </div>
              <div className="md:col-span-4 flex flex-col gap-2">
                <div>
                  <div className="mono-label !text-[9px] mb-1">STAGE</div>
                  <div className="text-[12px]">{item.status}</div>
                </div>
                <button
                  onClick={() => navigate({ to: "/crm" })}
                  className="mono-label !text-[9px] text-teal hover:opacity-80 inline-flex items-center gap-1 self-start"
                >
                  OPEN IN CRM <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </li>
  );
}