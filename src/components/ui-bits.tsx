import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------
   Executive surface primitives
   ------------------------------------------------------------------ */

export function Surface({
  children,
  className,
  raised,
  flush,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
  flush?: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        raised ? "surface-raised" : "surface",
        "rounded-[14px] overflow-hidden",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 h-12">
          <div className="min-w-0 flex items-baseline gap-2">
            {title && <h3 className="text-heading truncate">{title}</h3>}
            {subtitle && <span className="mono-label !text-[9px] truncate">{subtitle}</span>}
          </div>
          {action && <div className="shrink-0 flex items-center gap-1.5">{action}</div>}
        </header>
      )}
      <div className={flush ? "" : "px-5 pb-5 pt-0.5"}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Number counting — calm, once, respects reduced motion
   ------------------------------------------------------------------ */
export function CountUp({
  value,
  duration = 620,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const rounded = Math.round(shown);
  return <>{format ? format(shown) : rounded.toLocaleString()}</>;
}

/** Restrained KPI cell for the overview band. */
export function Kpi({
  label,
  value,
  delta,
  tone = "neutral",
  hint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  tone?: "neutral" | "teal" | "warn" | "danger" | "success";
  hint?: ReactNode;
  onClick?: () => void;
}) {
  const valueTone = {
    neutral: "text-foreground",
    teal: "text-teal",
    warn: "text-warn",
    danger: "text-danger",
    success: "text-success",
  }[tone];
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "group text-left px-5 py-4 min-w-0 surface-interactive lift-hover",
        onClick && "cursor-pointer",
      )}
    >
      <div className="mono-label !text-[8.5px] truncate">{label}</div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className={cn("tabular text-[25px] leading-none font-medium", valueTone)}>
          {value}
        </span>
        {delta && <span className="tabular text-[10.5px] text-muted-foreground">{delta}</span>}
      </div>
      {hint && (
        <div className="mt-2 text-[11px] text-muted-foreground/70 truncate motion-micro group-hover:text-muted-foreground">
          {hint}
        </div>
      )}
    </Comp>
  );
}

export function KpiBand({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "surface rounded-[14px] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y lg:divide-y-0",
        "[&>*]:border-edge divide-edge/60",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Segmented control — inline filters without admin-panel chrome. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md p-0.5 bg-[var(--surface-2)] border border-edge",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "motion-micro rounded px-2 font-sans uppercase tracking-[0.1em] whitespace-nowrap",
              size === "xs" ? "text-[9px] h-[18px]" : "text-[10px] h-[22px] px-2.5",
              active
                ? "bg-[var(--surface-selected)] text-foreground shadow-[0_0_0_1px_var(--edge-strong)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Dense metadata pair used inside briefs and detail panes. */
export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mono-label !text-[8.5px]">{label}</div>
      <div className={cn("mt-0.5 text-[12.5px] leading-snug break-words", mono && "tabular")}>
        {value ?? <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-7 rounded bg-[var(--surface-2)] animate-pulse"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function Panel({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cn("glass-panel rounded-lg", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
          <div className="min-w-0">
            {title && <h3 className="text-[13.5px] font-medium tracking-tight">{title}</h3>}
            {subtitle && <p className="mono-label mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 mb-4">
      <div>
        {eyebrow && <div className="mono-label !text-[9px] mb-1">{eyebrow}</div>}
        <h1 className="text-[20px] font-semibold tracking-tight leading-none">{title}</h1>
        {subtitle && (
          <p className="text-[12.5px] text-muted-foreground mt-1.5 max-w-prose">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass-panel rounded-lg px-4 py-3.5">
      <div className="mono-label">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-[26px] leading-none tabular-nums font-medium",
          accent && "text-teal",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-[12px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="mono-label">{title}</div>
      {hint && <div className="text-[12.5px] text-muted-foreground/80 mt-1.5">{hint}</div>}
    </div>
  );
}

export function StatusPill({
  status,
  tone = "neutral",
}: {
  status: string;
  tone?: "neutral" | "teal" | "warn" | "danger" | "success" | "muted";
}) {
  const toneClass = {
    neutral: "bg-accent text-foreground",
    teal: "bg-teal-soft text-teal border border-teal/30",
    warn: "bg-warn/12 text-warn border border-warn/30",
    danger: "bg-danger/12 text-danger border border-danger/30",
    success: "bg-success/12 text-success border border-success/30",
    muted: "bg-muted/60 text-muted-foreground",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-sans uppercase tracking-[0.1em]",
        toneClass,
      )}
    >
      <span className="h-1 w-1 rounded-full bg-current opacity-80" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function priorityTone(p: string): "muted" | "neutral" | "warn" | "danger" {
  if (p === "critical") return "danger";
  if (p === "high") return "warn";
  if (p === "medium") return "neutral";
  return "muted";
}

export function taskStatusTone(
  s: string,
): "muted" | "neutral" | "teal" | "warn" | "danger" | "success" {
  if (s === "blocked") return "danger";
  if (s === "in_progress") return "teal";
  if (s === "completed") return "success";
  if (s === "archived") return "muted";
  return "neutral";
}

export function dealStageTone(
  s: string,
): "muted" | "neutral" | "teal" | "warn" | "danger" | "success" {
  if (s === "won") return "success";
  if (s === "lost") return "danger";
  if (s === "negotiation" || s === "proposal_sent") return "teal";
  if (s === "nurture") return "muted";
  return "neutral";
}
