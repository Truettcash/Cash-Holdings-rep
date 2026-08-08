/**
 * CASH HOLDINGS — decision graph system.
 * Every chart answers: what changed, why it matters, where attention goes next.
 * Calm, spacious, low-chrome. Rounded lines with animated draw-in.
 */
import { useMemo, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui-bits";

export type RangeKey = "7d" | "30d" | "90d" | "12m" | "all";

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "12m", label: "12M" },
  { value: "all", label: "ALL" },
];

export function rangeStart(range: RangeKey, now = new Date()): Date | null {
  const d = new Date(now);
  if (range === "7d") d.setDate(d.getDate() - 7);
  else if (range === "30d") d.setDate(d.getDate() - 30);
  else if (range === "90d") d.setDate(d.getDate() - 90);
  else if (range === "12m") d.setMonth(d.getMonth() - 12);
  else return null;
  return d;
}

export function RangeControl({
  value,
  onChange,
  options = RANGE_OPTIONS,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
  options?: { value: RangeKey; label: string }[];
}) {
  return <Segmented value={value} onChange={onChange} options={options} size="xs" />;
}

export type Point = { x: string | number; y: number | null; yPrev?: number | null };

const TEAL = "var(--teal)";
const GHOST = "var(--chart-ghost)";

function fmtNumber(n: number, unit?: string) {
  const abs = Math.abs(n);
  let out: string;
  if (abs >= 1_000_000) out = `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  else if (abs >= 1_000) out = `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  else out = Number.isInteger(n) ? String(n) : n.toFixed(1);
  if (unit === "usd") return `$${out}`;
  if (unit === "%") return `${out}%`;
  return out;
}

/** Unified calm dark hover readout, shared by all chart types. */
function ChartTooltip({ active, payload, label, unit, compareLabel }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2.5 min-w-[128px] motion-micro"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--edge)",
        boxShadow: "var(--chart-tooltip-shadow)",
      }}
    >
      <div className="mono-label !text-[8.5px] text-muted-foreground">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mt-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ background: p.dataKey === "yPrev" ? GHOST : TEAL }}
          />
          <span className="mono-label !text-[8.5px] flex-1 text-muted-foreground">
            {p.dataKey === "yPrev" ? (compareLabel ?? "PRIOR") : "NOW"}
          </span>
          <span className="tabular text-[12.5px] text-foreground">
            {p.value === null || p.value === undefined ? "—" : fmtNumber(Number(p.value), unit)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Real empty state — calm, centered, never feels like a broken chart. */
export function ChartEmpty({ label = "NO SIGNAL", hint }: { label?: string; hint?: string }) {
  return (
    <div className="h-full min-h-[140px] grid place-items-center text-center px-6 ch-fade-in">
      <div className="flex flex-col items-center gap-1.5">
        <div className="h-8 w-8 rounded-full surface-raised grid place-items-center mb-1">
          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        </div>
        <div className="mono-label !text-[9px] text-muted-foreground">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground/70 max-w-[220px]">{hint}</div>}
      </div>
    </div>
  );
}

/** Loading skeleton — used while chart data is being fetched. */
export function ChartSkeleton({
  height = 160,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full flex items-end gap-1.5 px-2 pb-2", className)} style={{ height }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-muted-foreground/10 motion-micro"
          style={{
            height: `${18 + Math.abs(Math.sin(i * 0.7)) * 70}%`,
            animationDelay: `${i * 20}ms`,
          }}
        />
      ))}
    </div>
  );
}

const AXIS_TICK = { fill: "var(--chart-tick)", fontSize: 9.5, fontFamily: "var(--font-mono)" };
const GRID_STROKE = "var(--chart-grid)";

/** Primary trend graph — area + line, optional comparison series. */
export function TrendChart({
  data,
  height = 160,
  unit,
  compare,
  compareLabel,
  baseline,
  emptyHint,
  className,
  loading,
}: {
  data: Point[];
  height?: number;
  unit?: string;
  compare?: boolean;
  compareLabel?: string;
  baseline?: number;
  emptyHint?: string;
  className?: string;
  loading?: boolean;
}) {
  const hasData = data.some((d) => d.y !== null && d.y !== undefined);
  const gradientId = useMemo(() => `ch-grad-${Math.random().toString(36).slice(2, 8)}`, []);

  if (loading) return <ChartSkeleton height={height} className={className} />;
  if (!hasData) return <ChartEmpty hint={emptyHint} />;

  return (
    <div className={cn("w-full ch-fade-in", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--teal)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="0" />
          <XAxis
            dataKey="x"
            tick={AXIS_TICK}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            width={38}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => fmtNumber(Number(v), unit)}
            domain={["auto", "auto"]}
          />
          {baseline !== undefined && (
            <ReferenceLine y={baseline} stroke="var(--chart-axis)" strokeDasharray="3 3" />
          )}
          <Tooltip
            content={<ChartTooltip unit={unit} compareLabel={compareLabel} />}
            cursor={{ stroke: "var(--chart-cursor)", strokeWidth: 1 }}
          />
          {compare && (
            <Area
              type="monotone"
              dataKey="yPrev"
              stroke={GHOST}
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="transparent"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
          <Area
            type="monotone"
            dataKey="y"
            stroke={TEAL}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3.5, fill: "var(--teal)", stroke: "var(--background)", strokeWidth: 2 }}
            isAnimationActive
            animationDuration={620}
            animationEasing="ease-out"
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Throughput / volume graph. */
export function VolumeChart({
  data,
  height = 140,
  unit,
  compare,
  compareLabel,
  emptyHint,
  loading,
}: {
  data: Point[];
  height?: number;
  unit?: string;
  compare?: boolean;
  compareLabel?: string;
  emptyHint?: string;
  loading?: boolean;
}) {
  const hasData = data.some((d) => (d.y ?? 0) !== 0);
  if (loading) return <ChartSkeleton height={height} />;
  if (!hasData) return <ChartEmpty hint={emptyHint} />;
  return (
    <div className="w-full ch-fade-in" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="x"
            tick={AXIS_TICK}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            width={34}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => fmtNumber(Number(v), unit)}
            allowDecimals={false}
          />
          <Tooltip
            content={<ChartTooltip unit={unit} compareLabel={compareLabel} />}
            cursor={{ fill: "var(--chart-bar-cursor)" }}
          />
          {compare && <Bar dataKey="yPrev" fill={GHOST} fillOpacity={0.3} radius={[3, 3, 0, 0]} />}
          <Bar
            dataKey="y"
            fill="var(--chart-bar)"
            radius={[3, 3, 0, 0]}
            isAnimationActive
            animationDuration={560}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Inline sparkline for row-level movement — no axes, no tooltip. */
export function Sparkline({
  values,
  height = 22,
  width = 72,
  tone = "teal",
}: {
  values: number[];
  height?: number;
  width?: number;
  tone?: "teal" | "muted";
}) {
  if (values.length < 2) return <span className="mono-label !text-[8.5px]">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 2) - 1;
    return [x, y] as const;
  });

  // Build a smooth monotone-ish path using simple catmull-rom -> bezier conversion.
  const path = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x.toFixed(1)},${y.toFixed(1)}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2;
    return `${acc} Q ${mx.toFixed(1)},${py.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }, "");

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke={tone === "teal" ? "var(--teal)" : GHOST}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Graph frame: title, question it answers, controls, body. */
export function GraphPanel({
  title,
  question,
  controls,
  children,
  className,
}: {
  title: string;
  question?: string;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface rounded-[12px] overflow-hidden ch-fade-in", className)}>
      <header className="flex items-center justify-between gap-3 px-4 h-11 edge-b">
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-foreground/85 truncate">{title}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">{controls}</div>
      </header>
      <div className="px-3 pt-4 pb-2">{children}</div>
      {question && <div className="px-4 pb-3 text-[11px] text-muted-foreground/75">{question}</div>}
    </section>
  );
}

export { fmtNumber };
