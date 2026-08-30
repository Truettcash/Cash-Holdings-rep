import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Brain,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  Command,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useJarvis } from "@/lib/jarvis/context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mission-control")({
  head: () => ({
    meta: [
      { title: "Jarvis Mission Control — Cash Holdings" },
      {
        name: "description",
        content: "Conversational operating surface for Jarvis, functional agents, meetings, activity and human judgment.",
      },
    ],
  }),
  component: MissionControl,
});

type FunctionState = "core" | "registered" | "architecting";

type FunctionCard = {
  name: string;
  role: string;
  state: FunctionState;
  detail: string;
  icon: typeof Bot;
};

const FUNCTIONS: FunctionCard[] = [
  {
    name: "Jarvis",
    role: "Executive control plane",
    state: "core",
    detail: "Conversation, context, synthesis, routing and human escalation.",
    icon: Sparkles,
  },
  {
    name: "Cash Operator",
    role: "Governed operating reads",
    state: "registered",
    detail: "Brand, project, pipeline, activity and state evidence.",
    icon: ShieldCheck,
  },
  {
    name: "Intelligence",
    role: "Change and constraint detection",
    state: "registered",
    detail: "State comparison, findings, memory and decision evidence.",
    icon: Brain,
  },
  {
    name: "Sales",
    role: "Revenue function",
    state: "architecting",
    detail: "Lead qualification, discovery, follow-up, pipeline and proposals.",
    icon: Users,
  },
  {
    name: "Secretary",
    role: "Executive operations",
    state: "architecting",
    detail: "Inbox, calendar, meeting preparation, routing and follow-through.",
    icon: CalendarClock,
  },
  {
    name: "Delivery",
    role: "Project execution",
    state: "architecting",
    detail: "Approved scope to build, validation, review and handoff.",
    icon: BriefcaseBusiness,
  },
  {
    name: "Finance",
    role: "Capital and transaction control",
    state: "architecting",
    detail: "Pricing, receivables, margin, cash exposure and approvals.",
    icon: CircleDollarSign,
  },
];

const MEETINGS = [
  ["Executive Daily", "What requires judgment today?"],
  ["Revenue Review", "Where is money entering or leaking?"],
  ["Delivery Review", "What are we obligated to deliver?"],
  ["Operations Review", "What is stuck, late, missing or ownerless?"],
  ["Board", "Where should capital, time and attention go?"],
] as const;

const QUICK_PROMPTS = [
  "What changed across the holdings?",
  "What requires my judgment?",
  "What is going on with ATHRTY CRM?",
  "Prepare the next ATHRTY revenue review.",
];

function stateLabel(state: FunctionState) {
  if (state === "core") return "CORE";
  if (state === "registered") return "REGISTERED";
  return "ARCHITECTING";
}

function MissionControl() {
  const jarvis = useJarvis();
  const [prompt, setPrompt] = useState("");

  const activity = useMemo(
    () =>
      [...jarvis.turns]
        .reverse()
        .flatMap((turn) => {
          const rows = [
            {
              id: `${turn.id}-operator`,
              actor: "Operator",
              at: turn.at,
              text: turn.prompt,
              pending: false,
            },
          ];
          if (turn.pending) {
            rows.push({
              id: `${turn.id}-jarvis-pending`,
              actor: "Jarvis",
              at: turn.at,
              text: "Working through governed context and evidence…",
              pending: true,
            });
          } else if (turn.answer) {
            rows.push({
              id: `${turn.id}-jarvis`,
              actor: "Jarvis",
              at: turn.at,
              text: turn.answer.summary,
              pending: false,
            });
          } else if (turn.error) {
            rows.push({
              id: `${turn.id}-jarvis-error`,
              actor: "Jarvis",
              at: turn.at,
              text: turn.error,
              pending: false,
            });
          }
          return rows;
        })
        .slice(0, 12),
    [jarvis.turns],
  );

  async function submit(nextPrompt = prompt) {
    const value = nextPrompt.trim();
    if (!value || jarvis.busy) return;
    setPrompt("");
    await jarvis.ask(value);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[14px] border border-edge bg-[var(--surface-1)] overflow-hidden">
        <div className="grid xl:grid-cols-[1.2fr_0.8fr]">
          <div className="p-5 sm:p-7 xl:border-r border-edge">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mono-label !text-[8px] !text-teal">JARVIS / MISSION CONTROL</div>
                <h1 className="mt-2 text-[24px] sm:text-[30px] leading-tight tracking-[-0.035em]">
                  Operating interface for the holding company.
                </h1>
                <p className="mt-2 max-w-2xl text-[12.5px] sm:text-[13px] leading-6 text-muted-foreground">
                  Conversation is the command surface. Functions own bounded capabilities. Cash owns state. Human judgment remains explicit.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 rounded-[9px] border border-edge px-3 h-9">
                <span className={cn("h-1.5 w-1.5 rounded-full", jarvis.busy ? "bg-warn" : "bg-success")} />
                <span className="mono-label !text-[8px]">{jarvis.busy ? "WORKING" : "READY"}</span>
              </div>
            </div>

            <div className="mt-6 rounded-[12px] border border-edge bg-canvas p-3 sm:p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Command className="h-3.5 w-3.5" />
                <span className="mono-label !text-[8px]">ASK JARVIS</span>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Ask what changed, convene a meeting, inspect a brand, or surface decisions…"
                className="mt-3 min-h-[92px] w-full resize-none bg-transparent text-[15px] leading-6 outline-none placeholder:text-muted-foreground/45"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-[10px] text-muted-foreground">Enter to send · Shift+Enter for a new line</div>
                <button
                  onClick={() => void submit()}
                  disabled={jarvis.busy || !prompt.trim()}
                  className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-foreground px-3 text-[11px] text-background disabled:opacity-40"
                >
                  <Send className="h-3 w-3" />
                  Send
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item}
                  onClick={() => void submit(item)}
                  disabled={jarvis.busy}
                  className="rounded-full border border-edge px-3 py-1.5 text-[10.5px] text-muted-foreground hover:text-foreground hover:bg-[var(--surface-2)] motion-micro disabled:opacity-40"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 sm:p-7 bg-[var(--surface-2)]/35">
            <div className="flex items-center justify-between">
              <div>
                <div className="mono-label !text-[8px] !text-muted-foreground">HUMAN JUDGMENT</div>
                <div className="mt-1 text-[15px]">Decision queue</div>
              </div>
              <ShieldCheck className="h-4 w-4 text-teal" />
            </div>
            <div className="mt-5 rounded-[10px] border border-dashed border-edge px-4 py-7 text-center">
              <div className="text-[12.5px]">No structured decision objects yet.</div>
              <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                This surface is reserved for proposals, scope changes, capital moves and customer commitments that require approval.
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {["APPROVE", "MODIFY", "REJECT"].map((label) => (
                <div key={label} className="rounded-[8px] border border-edge px-2 py-2 text-center mono-label !text-[7.5px] !text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid xl:grid-cols-[1.35fr_0.65fr] gap-5">
        <div className="rounded-[14px] border border-edge bg-[var(--surface-1)] overflow-hidden">
          <header className="flex items-center justify-between px-5 h-12 border-b border-edge">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-teal" />
              <span className="text-[13px]">Organization</span>
            </div>
            <span className="mono-label !text-[8px] !text-muted-foreground">FUNCTION REGISTRY</span>
          </header>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {FUNCTIONS.map((fn) => {
              const Icon = fn.icon;
              return (
                <article key={fn.name} className="min-h-[166px] border-b border-r border-edge p-4 last:border-r-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-[8px] border border-edge bg-canvas">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className={cn(
                      "mono-label !text-[7px] rounded-full border px-2 py-1",
                      fn.state === "core" && "!text-success border-success/30",
                      fn.state === "registered" && "!text-teal border-teal/30",
                      fn.state === "architecting" && "!text-muted-foreground border-edge",
                    )}>
                      {stateLabel(fn.state)}
                    </span>
                  </div>
                  <div className="mt-4 text-[13px]">{fn.name}</div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">{fn.role}</div>
                  <p className="mt-3 text-[10.5px] leading-5 text-muted-foreground/85">{fn.detail}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="rounded-[14px] border border-edge bg-[var(--surface-1)] overflow-hidden">
          <header className="flex items-center justify-between px-5 h-12 border-b border-edge">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-teal" />
              <span className="text-[13px]">Live activity</span>
            </div>
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          </header>
          <div className="max-h-[520px] overflow-y-auto">
            {activity.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-[12px]">No session activity yet.</div>
                <div className="mt-1 text-[10.5px] leading-5 text-muted-foreground">
                  Ask Jarvis something above. Real conversation turns will appear here rather than simulated agent motion.
                </div>
              </div>
            ) : (
              activity.map((row) => (
                <div key={row.id} className="border-b border-edge px-5 py-3.5 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full", row.actor === "Jarvis" ? "bg-teal" : "bg-foreground/40")} />
                      <span className="mono-label !text-[7.5px]">{row.actor.toUpperCase()}</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground tabular">
                      {new Date(row.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                  <div className={cn("mt-2 text-[11px] leading-5", row.pending ? "text-muted-foreground" : "text-foreground/85")}>
                    {row.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-edge bg-[var(--surface-1)] overflow-hidden">
        <header className="flex items-center justify-between px-5 h-12 border-b border-edge">
          <div>
            <div className="text-[13px]">Meeting architecture</div>
            <div className="text-[10px] text-muted-foreground">Different rooms, evidence packets and decision rights.</div>
          </div>
          <CalendarClock className="h-4 w-4 text-teal" />
        </header>
        <div className="grid md:grid-cols-5">
          {MEETINGS.map(([name, question]) => (
            <button
              key={name}
              onClick={() => void submit(`Prepare the ${name} meeting. ${question}`)}
              disabled={jarvis.busy}
              className="min-h-[132px] border-b md:border-b-0 md:border-r border-edge p-4 text-left hover:bg-[var(--surface-2)] motion-micro disabled:opacity-40 last:border-r-0"
            >
              <div className="mono-label !text-[7px] !text-teal">CONVENE</div>
              <div className="mt-3 text-[12px]">{name}</div>
              <div className="mt-2 text-[10.5px] leading-5 text-muted-foreground">{question}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
