import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/domain";
import { dueBucket } from "@/lib/athrty/model";

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "muted" | "teal" | "warn" | "danger" | "success";
  className?: string;
}) {
  const toneClass = {
    neutral: "bg-[var(--surface-2)] text-foreground/85 border-edge",
    muted: "bg-transparent text-muted-foreground/70 border-edge/60",
    teal: "bg-teal-soft text-teal border-teal/30",
    warn: "bg-warn/12 text-warn border-warn/30",
    danger: "bg-danger/12 text-danger border-danger/30",
    success: "bg-success/12 text-success border-success/30",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 h-[18px] text-[10px] uppercase tracking-[0.08em]",
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dash() {
  return <span className="text-muted-foreground/45">—</span>;
}

export function Val({ children }: { children: ReactNode }) {
  if (children === null || children === undefined || children === "") return <Dash />;
  return <>{children}</>;
}

/** Due-date rendering shared by the table, the queue and the inspector. */
export function DueDate({ iso, showRelative }: { iso: string | null; showRelative?: boolean }) {
  const bucket = dueBucket(iso);
  if (bucket === "none") return <Dash />;
  const tone =
    bucket === "overdue"
      ? "text-danger"
      : bucket === "today"
        ? "text-warn"
        : "text-foreground/85";
  return (
    <span className={cn("tabular whitespace-nowrap", tone)}>
      {formatDate(iso)}
      {showRelative && bucket === "overdue" && (
        <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em]">overdue</span>
      )}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mono-label !text-[8.5px] !text-muted-foreground/60 pb-2 pt-1">{children}</div>
  );
}

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-[5px] border-b border-edge/40 last:border-0">
      <span className="text-[11px] text-muted-foreground/80 shrink-0">{label}</span>
      <span className="text-[12px] text-right leading-snug min-w-0 break-words">
        <Val>{value}</Val>
      </span>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  return (
    <div className="rounded-[10px] border border-danger/30 bg-danger/8 px-4 py-3">
      <div className="mono-label !text-[8.5px] !text-danger">DATA UNAVAILABLE</div>
      <p className="mt-1.5 text-[12px] text-muted-foreground break-words">{message}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 10, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy className="divide-y divide-edge/40">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 h-9">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-2.5 rounded bg-[var(--surface-2)] animate-pulse"
              style={{ width: `${6 + ((c * 37 + r * 13) % 12)}%`, animationDelay: `${r * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}