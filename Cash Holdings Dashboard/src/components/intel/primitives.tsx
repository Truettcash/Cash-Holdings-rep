import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { absoluteTime, relativeTime } from "@/lib/cash-intelligence/normalize";
import type { EvidenceRef, Epistemic, ReviewEvent } from "@/lib/cash-intelligence/types";
import { IntelServiceError } from "@/lib/cash-intelligence/service";

/**
 * The Cash Intelligence design system. Every screen composes these primitives
 * so the epistemic status of a value (observed / derived / candidate / unknown)
 * is always rendered the same way and candidates never read as fact.
 */

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("mono-label !text-[8.5px] !text-muted-foreground/60", className)}>
      {children}
    </span>
  );
}

export function Panel({
  title,
  meta,
  actions,
  children,
  className,
}: {
  title?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[10px] border border-edge bg-[var(--surface-1)]", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-edge/60 px-3.5 h-9">
          <div className="flex items-center gap-2 min-w-0">
            {title && <Mono>{title}</Mono>}
            {meta && <span className="text-[11px] text-muted-foreground/70 truncate">{meta}</span>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-3.5 py-3">{children}</div>
    </section>
  );
}

const EPISTEMIC_STYLE: Record<Epistemic, { label: string; className: string }> = {
  observed: { label: "OBSERVED", className: "text-foreground border-edge bg-[var(--surface-2)]" },
  derived: { label: "DERIVED", className: "text-teal border-teal/30 bg-teal-soft" },
  candidate: { label: "CANDIDATE", className: "text-warn border-warn/35 bg-warn/10" },
  unknown: {
    label: "UNKNOWN",
    className: "text-muted-foreground/70 border-edge/60 border-dashed bg-transparent",
  },
};

export function EpistemicTag({ kind, label }: { kind: Epistemic; label?: string }) {
  const s = EPISTEMIC_STYLE[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center h-[17px] rounded border px-1.5 text-[9px] uppercase tracking-[0.1em]",
        s.className,
      )}
    >
      {label ?? s.label}
    </span>
  );
}

/** A labelled block of facts whose epistemic status is explicit. */
export function Dimension({
  label,
  kind,
  items,
  emptyNote = "Not provided by the trace",
}: {
  label: string;
  kind: Epistemic;
  items: string[];
  emptyNote?: string;
}) {
  return (
    <div className="border-b border-edge/40 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        <Mono>{label}</Mono>
        <EpistemicTag kind={items.length ? kind : "unknown"} />
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground/60 italic">{emptyNote}</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((item, i) => (
            <li key={`${label}-${i}`} className="flex gap-2 text-[12px] leading-snug">
              <span className="text-muted-foreground/40 tabular select-none">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="flex items-start justify-between gap-4 border-b border-edge/40 py-[5px] last:border-0">
      <span className="shrink-0 text-[11px] text-muted-foreground/80">{label}</span>
      <span className="min-w-0 break-words text-right text-[12px] leading-snug">
        {empty ? <span className="text-muted-foreground/45">—</span> : value}
      </span>
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  unavailable,
}: {
  label: string;
  value: number | string | null;
  note?: string;
  unavailable?: boolean;
}) {
  return (
    <div className="border-edge border-l pl-3 first:border-l-0 first:pl-0">
      <Mono>{label}</Mono>
      <div
        className={cn(
          "mt-1 tabular text-[22px] leading-none font-medium tracking-tight",
          unavailable && "text-muted-foreground/40",
        )}
      >
        {unavailable ? "—" : (value ?? "—")}
      </div>
      {note && <div className="mt-1 text-[10.5px] text-muted-foreground/60">{note}</div>}
    </div>
  );
}

export function Confidence({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[11px] text-muted-foreground/50">confidence unknown</span>;
  }
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  const tone = pct >= 75 ? "bg-teal" : pct >= 45 ? "bg-warn" : "bg-muted-foreground/50";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1 w-16 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <span
          className={cn("block h-full rounded-full", tone)}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </span>
      <span className="tabular text-[11px] text-muted-foreground">{pct}%</span>
    </span>
  );
}

export function EvidenceRefList({
  refs,
  tone = "neutral",
  emptyNote = "No evidence attached",
}: {
  refs: EvidenceRef[];
  tone?: "neutral" | "counter";
  emptyNote?: string;
}) {
  if (refs.length === 0) {
    return <p className="text-[11px] text-muted-foreground/55 italic">{emptyNote}</p>;
  }
  return (
    <ul className="space-y-1">
      {refs.map((r, i) => (
        <li
          key={`${r.id ?? "ref"}-${i}`}
          className={cn(
            "flex items-start gap-2 rounded border px-2 py-1 text-[11.5px]",
            tone === "counter"
              ? "border-danger/30 bg-danger/8"
              : "border-edge bg-[var(--surface-2)]",
          )}
        >
          <span className="mono-label !text-[8px] !text-muted-foreground/60 pt-[3px]">
            {r.kind ?? "REF"}
          </span>
          <span className="min-w-0 break-words">
            {r.label ?? r.id ?? "—"}
            {r.label && r.id && (
              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/50">{r.id}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MissingState({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded border border-dashed border-edge px-2 py-1.5">
      <Mono>MISSING STATE</Mono>
      <ul className="mt-1 space-y-0.5">
        {items.map((m, i) => (
          <li key={i} className="text-[11.5px] text-muted-foreground">
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** SOURCE → DOCUMENT → CONTENT → EVIDENCE REF lineage. */
export function ProvenanceChain({
  steps,
}: {
  steps: { label: string; value: string | null; kind?: Epistemic }[];
}) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.label} className="relative pl-4">
          <span
            className={cn(
              "absolute left-0 top-[7px] h-1.5 w-1.5 rounded-full",
              s.value ? "bg-teal" : "bg-muted-foreground/30",
            )}
          />
          {i < steps.length - 1 && (
            <span className="absolute left-[2.5px] top-[15px] bottom-0 w-px bg-edge" />
          )}
          <div className="pb-2.5">
            <div className="flex items-center gap-2">
              <Mono>{s.label}</Mono>
              {s.kind && <EpistemicTag kind={s.value ? s.kind : "unknown"} />}
            </div>
            <div className="mt-0.5 break-words text-[12px]">
              {s.value ?? <span className="text-muted-foreground/45">not resolved</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AuditEventRow({ event }: { event: ReviewEvent }) {
  return (
    <div className="flex items-start gap-3 border-b border-edge/40 py-2 last:border-0">
      <span className="mono-label !text-[8.5px] !text-teal w-[132px] shrink-0 pt-[3px]">
        {event.action ?? "EVENT"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px]">{event.targetRef ?? "—"}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground/75">
          {[event.targetType, event.scope, event.lifecycleState].filter(Boolean).join(" · ") || "—"}
        </div>
        {event.reason && (
          <p className="mt-1 text-[11.5px] text-muted-foreground break-words">{event.reason}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-[11px] text-muted-foreground">
          {relativeTime(event.createdAt)}
        </div>
        <div className="tabular text-[10px] text-muted-foreground/50">
          {absoluteTime(event.createdAt)}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, note }: { title: string; note?: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-edge px-4 py-8 text-center">
      <div className="text-[12.5px]">{title}</div>
      {note && <p className="mx-auto mt-1 max-w-[46ch] text-[11.5px] text-muted-foreground/70">{note}</p>}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-7 animate-pulse rounded bg-[var(--surface-2)]"
          style={{ animationDelay: `${i * 45}ms` }}
        />
      ))}
    </div>
  );
}

/** Distinguishes "backend does not expose this" from "read failed". */
export function ServiceState({ error, label }: { error: unknown; label: string }) {
  const svc = error instanceof IntelServiceError ? error : null;
  const unsupported = svc?.code === "UNSUPPORTED_OPERATION";
  const unreachable = svc?.code === "UNREACHABLE";
  const auth = svc?.code === "AUTH_REQUIRED" || svc?.code === "FORBIDDEN";
  const heading = unsupported
    ? "NOT EXPOSED BY SERVICE"
    : unreachable
      ? "SERVICE UNREACHABLE"
      : auth
        ? "NOT AUTHORIZED"
        : "READ FAILED";
  const note = unsupported
    ? `${label} is not exposed by the deployed read contract. Nothing is inferred locally.`
    : unreachable
      ? `${label} could not be reached from this origin. The Edge Function CORS allow-list must include this origin.`
      : auth
        ? `${label} requires an authorized owner session.`
        : (svc?.detail ?? (error instanceof Error ? error.message : "Unknown error"));
  return (
    <div
      className={cn(
        "rounded-[10px] border px-3.5 py-3",
        unsupported ? "border-edge border-dashed" : "border-danger/30 bg-danger/8",
      )}
    >
      <div
        className={cn(
          "mono-label !text-[8.5px]",
          unsupported ? "!text-muted-foreground/70" : "!text-danger",
        )}
      >
        {heading}
      </div>
      <p className="mt-1 break-words text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}

export function Button({
  children,
  onClick,
  tone = "quiet",
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "quiet" | "primary" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const toneClass = {
    quiet: "border-edge bg-[var(--surface-2)] text-foreground hover:bg-[var(--surface-3)]",
    primary: "border-teal/40 bg-teal-soft text-teal hover:bg-teal/20",
    danger: "border-danger/35 bg-danger/10 text-danger hover:bg-danger/18",
  }[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "motion-micro inline-flex h-7 items-center gap-1.5 rounded-[7px] border px-2.5 text-[11.5px]",
        toneClass,
        disabled && "cursor-not-allowed opacity-45",
        className,
      )}
    >
      {children}
    </button>
  );
}