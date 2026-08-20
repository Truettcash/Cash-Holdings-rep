import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { q } from "@/lib/data";
import { m } from "@/lib/mutations";
import { cn } from "@/lib/utils";
import { PRIORITIES, TASK_STATUSES, PROJECT_STATUSES, DEAL_STAGES } from "@/lib/domain";
import { useApp } from "@/lib/app-context";
import { analyticsRefresh } from "@/lib/analytics/invalidate";

type Mode = "task" | "project" | "activity" | "metric" | "org" | "contact" | "deal";

const CAPTURE: { id: Mode; label: string; hint: string }[] = [
  { id: "task", label: "Task", hint: "Execution next move" },
  { id: "activity", label: "Activity", hint: "Log a touchpoint" },
  { id: "metric", label: "Metric", hint: "Record an observation" },
];
const PLAN: { id: Mode; label: string; hint: string }[] = [
  { id: "project", label: "Project", hint: "Spin up new initiative" },
  { id: "org", label: "Organization", hint: "Add account" },
  { id: "contact", label: "Contact", hint: "Add person" },
  { id: "deal", label: "Deal", hint: "Pipeline opportunity" },
];
const ALL_MODES: Mode[] = ["task", "activity", "metric", "project", "org", "contact", "deal"];
const MODE_LABEL: Record<Mode, string> = {
  task: "Task",
  activity: "Activity",
  metric: "Metric",
  project: "Project",
  org: "Organization",
  contact: "Contact",
  deal: "Deal",
};

export function AddButton() {
  const { openAdd } = useApp();
  return (
    <button
      onClick={() => openAdd()}
      className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded border border-teal/40 bg-teal-soft text-teal hover:bg-teal/20 transition-colors text-[10.5px] font-medium tracking-[0.06em] uppercase font-sans"
    >
      <Plus className="h-3 w-3" />
      ADD
    </button>
  );
}

/** Floating + ADD action — visible only on mobile so the operator can always capture from anywhere. */
export function AddFab() {
  const { openAdd, addOpen } = useApp();
  if (addOpen) return null;
  return (
    <button
      onClick={() => openAdd()}
      aria-label="Quick add"
      className="md:hidden fixed right-4 bottom-[72px] z-40 h-12 w-12 rounded-full grid place-items-center bg-teal text-teal-foreground shadow-[0_8px_24px_-6px_var(--accent-muted)] active:scale-95 transition-transform"
    >
      <Plus className="h-5 w-5" />
    </button>
  );
}

export function AddDrawerHost() {
  const { addOpen, addMode, addPrefill, openAdd, closeAdd } = useApp();
  const [view, setView] = useState<"choose" | "form">("choose");
  const [mode, setMode] = useState<Mode>(addMode);
  const [lastBrand, setLastBrand] = useState<string | undefined>(addPrefill.brand_id);
  const [lastProject, setLastProject] = useState<string | undefined>(addPrefill.project_id);
  const [lastOrg, setLastOrg] = useState<string | undefined>(addPrefill.organization_id);

  // When opened with an explicit mode (from command palette / page buttons),
  // skip the choice grid.
  useEffect(() => {
    if (!addOpen) return;
    setMode(addMode);
    setView("form");
    if (addPrefill.brand_id) setLastBrand(addPrefill.brand_id);
    if (addPrefill.project_id) setLastProject(addPrefill.project_id);
    if (addPrefill.organization_id) setLastOrg(addPrefill.organization_id);
  }, [addOpen, addMode, addPrefill]);

  const handleDone = (opts?: { again?: boolean }) => {
    if (opts?.again) {
      // keep drawer open, return to choose
      setView("choose");
      return;
    }
    closeAdd();
    setView("choose");
  };

  return (
    <Dialog
      open={addOpen}
      onOpenChange={(v) => {
        if (!v) {
          closeAdd();
          setView("choose");
        }
      }}
    >
      <DialogContent className="max-w-[720px] w-[calc(100vw-1rem)] sm:w-full max-h-[92dvh] overflow-y-auto p-0 gap-0 border-hairline bg-[var(--surface-floating)] rounded-lg">
        <DialogTitle className="sr-only">Quick Add</DialogTitle>
        <div className="flex items-center justify-between px-4 h-10 border-b border-hairline">
          <div className="flex items-center gap-3">
            {view === "form" && (
              <button
                onClick={() => setView("choose")}
                className="mono-label !text-[9px] inline-flex items-center gap-1 text-muted-foreground hover:text-teal"
              >
                <ArrowLeft className="h-3 w-3" /> BACK
              </button>
            )}
            <span className="mono-label !text-[9px]">
              CASH HOLDINGS / {view === "choose" ? "QUICK ADD" : MODE_LABEL[mode].toUpperCase()}
            </span>
          </div>
          {view === "form" && (
            <div className="flex items-center gap-1">
              {ALL_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-1.5 h-5 rounded text-[9.5px] font-sans uppercase tracking-[0.1em] transition-colors",
                    mode === m
                      ? "bg-teal-soft text-teal border border-teal/40"
                      : "text-muted-foreground hover:text-foreground border border-transparent"
                  )}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === "choose" ? (
          <ChooseGrid
            onPick={(m) => {
              setMode(m);
              setView("form");
            }}
          />
        ) : (
          <div className="px-4 py-4 max-h-[70vh] overflow-y-auto">
            <AddForm
              mode={mode}
              prefill={{
                brand_id: lastBrand,
                project_id: lastProject,
                organization_id: lastOrg,
              }}
              onContext={(c) => {
                if (c.brand_id) setLastBrand(c.brand_id);
                if (c.project_id) setLastProject(c.project_id);
                if (c.organization_id) setLastOrg(c.organization_id);
              }}
              onDone={handleDone}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChooseGrid({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="p-5 space-y-5">
      <Section title="CAPTURE">
        <div className="grid grid-cols-3 gap-2">
          {CAPTURE.map((c) => (
            <ChoiceCard key={c.id} label={c.label} hint={c.hint} onClick={() => onPick(c.id)} />
          ))}
        </div>
      </Section>
      <Section title="PLAN">
        <div className="grid grid-cols-4 gap-2">
          {PLAN.map((c) => (
            <ChoiceCard key={c.id} label={c.label} hint={c.hint} onClick={() => onPick(c.id)} />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono-label !text-[9px] mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function ChoiceCard({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left px-3 py-2.5 rounded border border-hairline bg-[var(--input-background)] hover:border-teal/60 hover:bg-teal-soft/30 transition-colors group"
    >
      <div className="text-[12.5px] font-medium group-hover:text-teal">{label}</div>
      <div className="mono-label !text-[8.5px] mt-0.5">{hint}</div>
    </button>
  );
}

/* ============= Shared form primitives ============= */

function L({ children }: { children: React.ReactNode }) {
  return <label className="mono-label !text-[9px] block mb-1">{children}</label>;
}

const inputCls =
  "w-full bg-[var(--input-background)] border border-hairline rounded px-2.5 h-8 text-[12.5px] focus:outline-none focus:border-teal/60";
const areaCls = inputCls.replace("h-8", "min-h-[60px] py-1.5");
const selectCls = inputCls;

function Actions({
  pending,
  label = "Save",
  onAgain,
}: {
  pending: boolean;
  label?: string;
  onAgain?: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {onAgain && (
        <button
          type="button"
          onClick={onAgain}
          disabled={pending}
          className="h-7 px-3 rounded text-[11px] font-sans uppercase tracking-[0.06em] border border-hairline text-muted-foreground hover:text-foreground hover:border-teal/40 disabled:opacity-50"
        >
          Save & Add another
        </button>
      )}
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "h-7 px-3 rounded text-[11px] font-sans uppercase tracking-[0.06em]",
          "border border-teal/40 bg-teal-soft text-teal hover:bg-teal/20 disabled:opacity-50"
        )}
      >
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    if (keys.some((k) => k === "engagements")) analyticsRefresh.engagementCreated(qc);
    if (keys.some((k) => k === "tasks" || k === "projects")) {
      analyticsRefresh.projectOrTaskChanged(qc);
    }
  };
}

/* ============= Forms ============= */

type DoneFn = (opts?: { again?: boolean }) => void;
type Prefill = { brand_id?: string; project_id?: string; organization_id?: string };
type CtxCb = (c: Prefill) => void;

function AddForm({
  mode,
  onDone,
  prefill,
  onContext,
}: {
  mode: Mode;
  onDone: DoneFn;
  prefill: Prefill;
  onContext: CtxCb;
}) {
  if (mode === "task") return <TaskForm onDone={onDone} prefill={prefill} onContext={onContext} />;
  if (mode === "project") return <ProjectForm onDone={onDone} prefill={prefill} onContext={onContext} />;
  if (mode === "activity") return <ActivityForm onDone={onDone} prefill={prefill} onContext={onContext} />;
  if (mode === "metric") return <MetricForm onDone={onDone} prefill={prefill} onContext={onContext} />;
  if (mode === "org") return <OrgForm onDone={onDone} />;
  if (mode === "contact") return <ContactForm onDone={onDone} prefill={prefill} onContext={onContext} />;
  return <DealForm onDone={onDone} prefill={prefill} onContext={onContext} />;
}

function TaskForm({ onDone, prefill, onContext }: { onDone: DoneFn; prefill: Prefill; onContext: CtxCb }) {
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects });
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const inv = useInvalidate();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState({
    project_id: prefill.project_id ?? "",
    title: "",
    status: "todo",
    priority: "medium",
    due_date: "",
    description: "",
    blocker_reason: "",
  });
  const [brandHint, setBrandHint] = useState<string>(prefill.brand_id ?? "all");
  const brandName = (id: string) =>
    brands.data?.find((b) => b.id === projects.data?.find((p) => p.id === id)?.brand_id)?.name ??
    "";

  const visibleProjects = (projects.data ?? []).filter(
    (p) => brandHint === "all" || p.brand_id === brandHint
  );

  const submit = async (again: boolean) => {
    if (!state.project_id || !state.title) {
      toast.error("Project and title required");
      return;
    }
    setPending(true);
    try {
      await m.createTask({
        project_id: state.project_id,
        title: state.title,
        status: state.status,
        priority: state.priority,
        due_date: state.due_date || null,
        description: state.description || null,
        blocker_reason: state.status === "blocked" ? state.blocker_reason || null : null,
      });
      inv(["tasks"]);
      const proj = projects.data?.find((p) => p.id === state.project_id);
      onContext({ brand_id: proj?.brand_id, project_id: state.project_id });
      toast.success("Task added");
      onDone({ again });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(false);
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-5">
          <L>Brand</L>
          <select
            className={selectCls}
            value={brandHint}
            onChange={(e) => {
              setBrandHint(e.target.value);
              setState((s) => ({ ...s, project_id: "" }));
            }}
          >
            <option value="all">All holdings</option>
            {(brands.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-7">
          <L>Project</L>
          <select
            className={selectCls}
            value={state.project_id}
            onChange={(e) => setState({ ...state, project_id: e.target.value })}
          >
            <option value="">Select project…</option>
            {visibleProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {brandHint === "all" && brandName(p.id) ? `${brandName(p.id)} · ` : ""}
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-7">
          <L>Title</L>
          <input
            className={inputCls}
            value={state.title}
            onChange={(e) => setState({ ...state, title: e.target.value })}
            placeholder="What needs to be done"
          />
        </div>
        <div className="col-span-5">
          <L>Due</L>
          <input
            type="date"
            className={inputCls}
            value={state.due_date}
            onChange={(e) => setState({ ...state, due_date: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>Status</L>
          <select
            className={selectCls}
            value={state.status}
            onChange={(e) => setState({ ...state, status: e.target.value })}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <L>Priority</L>
          <select
            className={selectCls}
            value={state.priority}
            onChange={(e) => setState({ ...state, priority: e.target.value })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.status === "blocked" && (
        <div>
          <L>Blocked reason</L>
          <input
            className={inputCls}
            value={state.blocker_reason}
            onChange={(e) => setState({ ...state, blocker_reason: e.target.value })}
          />
        </div>
      )}
      <div>
        <L>Description</L>
        <textarea
          className={areaCls}
          value={state.description}
          onChange={(e) => setState({ ...state, description: e.target.value })}
        />
      </div>
      <Actions pending={pending} label="Add Task" onAgain={() => submit(true)} />
    </form>
  );
}

function ProjectForm({ onDone, prefill, onContext }: { onDone: DoneFn; prefill: Prefill; onContext: CtxCb }) {
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const inv = useInvalidate();
  const [pending, setPending] = useState(false);
  const [s, setS] = useState({
    brand_id: prefill.brand_id ?? "",
    name: "",
    project_type: "",
    status: "planning",
    priority: "medium",
    due_date: "",
    description: "",
  });
  const submit = async (again: boolean) => {
    if (!s.brand_id || !s.name) {
      toast.error("Brand and name required");
      return;
    }
    setPending(true);
    try {
      const row = await m.createProject({
        brand_id: s.brand_id,
        name: s.name,
        project_type: s.project_type || null,
        status: s.status,
        priority: s.priority,
        due_date: s.due_date || null,
        description: s.description || null,
      });
      inv(["projects"]);
      onContext({ brand_id: s.brand_id, project_id: (row as any)?.id });
      toast.success("Project added");
      onDone({ again });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(false);
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-5">
          <L>Brand</L>
          <select
            className={selectCls}
            value={s.brand_id}
            onChange={(e) => setS({ ...s, brand_id: e.target.value })}
          >
            <option value="">Select…</option>
            {(brands.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-7">
          <L>Name</L>
          <input
            className={inputCls}
            value={s.name}
            onChange={(e) => setS({ ...s, name: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <L>Type</L>
          <input
            className={inputCls}
            value={s.project_type}
            placeholder="brand · ops · product…"
            onChange={(e) => setS({ ...s, project_type: e.target.value })}
          />
        </div>
        <div>
          <L>Status</L>
          <select
            className={selectCls}
            value={s.status}
            onChange={(e) => setS({ ...s, status: e.target.value })}
          >
            {PROJECT_STATUSES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div>
          <L>Priority</L>
          <select
            className={selectCls}
            value={s.priority}
            onChange={(e) => setS({ ...s, priority: e.target.value })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <L>Target date</L>
        <input
          type="date"
          className={inputCls}
          value={s.due_date}
          onChange={(e) => setS({ ...s, due_date: e.target.value })}
        />
      </div>
      <div>
        <L>Description</L>
        <textarea
          className={areaCls}
          value={s.description}
          onChange={(e) => setS({ ...s, description: e.target.value })}
        />
      </div>
      <Actions pending={pending} label="Add Project" onAgain={() => submit(true)} />
    </form>
  );
}

function ActivityForm({ onDone, prefill, onContext }: { onDone: DoneFn; prefill: Prefill; onContext: CtxCb }) {
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: q.organizations });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: q.contacts });
  const deals = useQuery({ queryKey: ["deals"], queryFn: q.deals });
  const inv = useInvalidate();
  const [pending, setPending] = useState(false);
  const [s, setS] = useState({
    brand_id: prefill.brand_id ?? "",
    organization_id: prefill.organization_id ?? "",
    contact_id: "",
    deal_id: "",
    activity_type: "note",
    subject: "",
    body: "",
    outcome: "",
    activity_at: "",
  });
  const submit = async (again: boolean) => {
    if (!s.subject) {
      toast.error("Subject required");
      return;
    }
    setPending(true);
    try {
      await m.createActivity({
        brand_id: s.brand_id || null,
        organization_id: s.organization_id || null,
        contact_id: s.contact_id || null,
        deal_id: s.deal_id || null,
        activity_type: s.activity_type,
        subject: s.subject,
        body: s.body || null,
        outcome: s.outcome || null,
        activity_at: s.activity_at
          ? new Date(s.activity_at).toISOString()
          : new Date().toISOString(),
      });
      inv(["activities"]);
      onContext({ brand_id: s.brand_id || undefined, organization_id: s.organization_id || undefined });
      toast.success("Activity logged");
      onDone({ again });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(false);
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>Brand</L>
          <select
            className={selectCls}
            value={s.brand_id}
            onChange={(e) => setS({ ...s, brand_id: e.target.value })}
          >
            <option value="">—</option>
            {(brands.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <L>Type</L>
          <select
            className={selectCls}
            value={s.activity_type}
            onChange={(e) => setS({ ...s, activity_type: e.target.value })}
          >
            {["note", "call", "email", "meeting", "task", "milestone"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <L>Subject</L>
        <input
          className={inputCls}
          value={s.subject}
          onChange={(e) => setS({ ...s, subject: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <L>Organization</L>
          <select
            className={selectCls}
            value={s.organization_id}
            onChange={(e) => setS({ ...s, organization_id: e.target.value })}
          >
            <option value="">—</option>
            {(orgs.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <L>Contact</L>
          <select
            className={selectCls}
            value={s.contact_id}
            onChange={(e) => setS({ ...s, contact_id: e.target.value })}
          >
            <option value="">—</option>
            {(contacts.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <L>Deal</L>
          <select
            className={selectCls}
            value={s.deal_id}
            onChange={(e) => setS({ ...s, deal_id: e.target.value })}
          >
            <option value="">—</option>
            {(deals.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>When</L>
          <input
            type="datetime-local"
            className={inputCls}
            value={s.activity_at}
            onChange={(e) => setS({ ...s, activity_at: e.target.value })}
          />
        </div>
        <div>
          <L>Outcome</L>
          <input
            className={inputCls}
            value={s.outcome}
            onChange={(e) => setS({ ...s, outcome: e.target.value })}
          />
        </div>
      </div>
      <div>
        <L>Notes</L>
        <textarea
          className={areaCls}
          value={s.body}
          onChange={(e) => setS({ ...s, body: e.target.value })}
        />
      </div>
      <Actions pending={pending} label="Log Activity" onAgain={() => submit(true)} />
    </form>
  );
}

function MetricForm({ onDone, prefill, onContext }: { onDone: DoneFn; prefill: Prefill; onContext: CtxCb }) {
  const channels = useQuery({ queryKey: ["channels"], queryFn: q.channels });
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const defs = useQuery({ queryKey: ["metricDefs"], queryFn: q.metricDefs });
  const inv = useInvalidate();
  const [pending, setPending] = useState(false);
  const [brandHint, setBrandHint] = useState<string>(prefill.brand_id ?? "all");
  const [s, setS] = useState({
    channel_id: "",
    metric_definition_id: "",
    value: "",
    observed_at: "",
    source: "",
    notes: "",
  });
  const visibleChannels = (channels.data ?? []).filter(
    (c) => brandHint === "all" || c.brand_id === brandHint
  );
  const submit = async (again: boolean) => {
    if (!s.channel_id || !s.metric_definition_id || !s.value) {
      toast.error("Channel, metric and value required");
      return;
    }
    setPending(true);
    try {
      await m.createObservation({
        channel_id: s.channel_id,
        metric_definition_id: s.metric_definition_id,
        value: Number(s.value),
        observed_at: s.observed_at
          ? new Date(s.observed_at).toISOString()
          : new Date().toISOString(),
        source: s.source || null,
        notes: s.notes || null,
      });
      inv(["obs"]);
      const ch = channels.data?.find((c) => c.id === s.channel_id);
      onContext({ brand_id: ch?.brand_id });
      toast.success("Observation recorded");
      onDone({ again });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(false);
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-5">
          <L>Brand</L>
          <select
            className={selectCls}
            value={brandHint}
            onChange={(e) => {
              setBrandHint(e.target.value);
              setS({ ...s, channel_id: "" });
            }}
          >
            <option value="all">All holdings</option>
            {(brands.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-7">
          <L>Channel</L>
          <select
            className={selectCls}
            value={s.channel_id}
            onChange={(e) => setS({ ...s, channel_id: e.target.value })}
          >
            <option value="">Select…</option>
            {visibleChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.channel_type})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-7">
          <L>Metric</L>
          <select
            className={selectCls}
            value={s.metric_definition_id}
            onChange={(e) => setS({ ...s, metric_definition_id: e.target.value })}
          >
            <option value="">Select…</option>
            {(defs.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.key})
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-5">
          <L>Value</L>
          <input
            type="number"
            step="any"
            className={inputCls}
            value={s.value}
            onChange={(e) => setS({ ...s, value: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <L>Observed at</L>
          <input
            type="datetime-local"
            className={inputCls}
            value={s.observed_at}
            onChange={(e) => setS({ ...s, observed_at: e.target.value })}
          />
        </div>
        <div>
          <L>Source</L>
          <input
            className={inputCls}
            value={s.source}
            placeholder="manual · api · scrape"
            onChange={(e) => setS({ ...s, source: e.target.value })}
          />
        </div>
      </div>
      <div>
        <L>Notes</L>
        <textarea
          className={areaCls}
          value={s.notes}
          onChange={(e) => setS({ ...s, notes: e.target.value })}
        />
      </div>
      <Actions pending={pending} label="Record" onAgain={() => submit(true)} />
    </form>
  );
}

function OrgForm({ onDone }: { onDone: DoneFn }) {
  const inv = useInvalidate();
  const [pending, setPending] = useState(false);
  const [s, setS] = useState({ name: "", website: "", industry: "", location: "", notes: "" });
  const submit = async (again: boolean) => {
    if (!s.name) return toast.error("Name required");
    setPending(true);
    try {
      await m.createOrganization({ ...s, website: s.website || null, industry: s.industry || null, location: s.location || null, notes: s.notes || null });
      inv(["organizations"]);
      toast.success("Organization added");
      onDone({ again });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); await submit(false); }}
      className="space-y-3"
    >
      <div>
        <L>Name</L>
        <input className={inputCls} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><L>Website</L><input className={inputCls} value={s.website} onChange={(e) => setS({ ...s, website: e.target.value })} /></div>
        <div><L>Industry</L><input className={inputCls} value={s.industry} onChange={(e) => setS({ ...s, industry: e.target.value })} /></div>
        <div><L>Location</L><input className={inputCls} value={s.location} onChange={(e) => setS({ ...s, location: e.target.value })} /></div>
      </div>
      <div><L>Notes</L><textarea className={areaCls} value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} /></div>
      <Actions pending={pending} label="Add Org" onAgain={() => submit(true)} />
    </form>
  );
}

function ContactForm({ onDone, prefill, onContext }: { onDone: DoneFn; prefill: Prefill; onContext: CtxCb }) {
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: q.organizations });
  const inv = useInvalidate();
  const [pending, setPending] = useState(false);
  const [s, setS] = useState({
    full_name: "",
    organization_id: prefill.organization_id ?? "",
    email: "",
    phone: "",
    title: "",
  });
  const submit = async (again: boolean) => {
    if (!s.full_name) return toast.error("Name required");
    setPending(true);
    try {
      await m.createContact({
        full_name: s.full_name,
        organization_id: s.organization_id || null,
        email: s.email || null,
        phone: s.phone || null,
        title: s.title || null,
      });
      inv(["contacts"]);
      onContext({ organization_id: s.organization_id || undefined });
      toast.success("Contact added");
      onDone({ again });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); await submit(false); }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div><L>Full name</L><input className={inputCls} value={s.full_name} onChange={(e) => setS({ ...s, full_name: e.target.value })} /></div>
        <div>
          <L>Organization</L>
          <select className={selectCls} value={s.organization_id} onChange={(e) => setS({ ...s, organization_id: e.target.value })}>
            <option value="">—</option>
            {(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><L>Title</L><input className={inputCls} value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></div>
        <div><L>Email</L><input className={inputCls} value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} /></div>
        <div><L>Phone</L><input className={inputCls} value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></div>
      </div>
      <Actions pending={pending} label="Add Contact" onAgain={() => submit(true)} />
    </form>
  );
}

function DealForm({ onDone, prefill, onContext }: { onDone: DoneFn; prefill: Prefill; onContext: CtxCb }) {
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: q.organizations });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: q.contacts });
  const inv = useInvalidate();
  const [pending, setPending] = useState(false);
  const [s, setS] = useState({
    name: "",
    brand_id: prefill.brand_id ?? "",
    organization_id: prefill.organization_id ?? "",
    primary_contact_id: "",
    stage: "new", value: "", currency: "USD", expected_close: "",
    next_action: "", next_action_due: "", notes: "",
  });
  const submit = async (again: boolean) => {
    if (!s.name) return toast.error("Deal name required");
    setPending(true);
    try {
      await m.createDeal({
        name: s.name,
        brand_id: s.brand_id || null,
        organization_id: s.organization_id || null,
        primary_contact_id: s.primary_contact_id || null,
        stage: s.stage,
        value: s.value ? Number(s.value) : null,
        currency: s.currency || null,
        expected_close: s.expected_close || null,
        next_action: s.next_action || null,
        next_action_due: s.next_action_due || null,
        notes: s.notes || null,
      });
      inv(["deals"]);
      onContext({ brand_id: s.brand_id || undefined, organization_id: s.organization_id || undefined });
      toast.success("Deal added");
      onDone({ again });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); await submit(false); }}
      className="space-y-3"
    >
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-7"><L>Name</L><input className={inputCls} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
        <div className="col-span-5">
          <L>Stage</L>
          <select className={selectCls} value={s.stage} onChange={(e) => setS({ ...s, stage: e.target.value })}>
            {DEAL_STAGES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <L>Brand</L>
          <select className={selectCls} value={s.brand_id} onChange={(e) => setS({ ...s, brand_id: e.target.value })}>
            <option value="">—</option>
            {(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <L>Organization</L>
          <select className={selectCls} value={s.organization_id} onChange={(e) => setS({ ...s, organization_id: e.target.value })}>
            <option value="">—</option>
            {(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <L>Contact</L>
          <select className={selectCls} value={s.primary_contact_id} onChange={(e) => setS({ ...s, primary_contact_id: e.target.value })}>
            <option value="">—</option>
            {(contacts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><L>Value</L><input type="number" className={inputCls} value={s.value} onChange={(e) => setS({ ...s, value: e.target.value })} /></div>
        <div><L>Currency</L><input className={inputCls} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></div>
        <div><L>Expected close</L><input type="date" className={inputCls} value={s.expected_close} onChange={(e) => setS({ ...s, expected_close: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><L>Next action</L><input className={inputCls} value={s.next_action} onChange={(e) => setS({ ...s, next_action: e.target.value })} /></div>
        <div><L>Next action due</L><input type="date" className={inputCls} value={s.next_action_due} onChange={(e) => setS({ ...s, next_action_due: e.target.value })} /></div>
      </div>
      <div><L>Notes</L><textarea className={areaCls} value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} /></div>
      <Actions pending={pending} label="Add Deal" onAgain={() => submit(true)} />
    </form>
  );
}