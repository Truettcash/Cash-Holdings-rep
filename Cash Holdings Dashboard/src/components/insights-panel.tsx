import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { Surface, EmptyState } from "@/components/ui-bits";
import {
  computeInsights,
  deterministicNarrative,
  formatInsightValue,
  type Insight,
  type NarratedInsight,
} from "@/lib/intelligence/insights";
import { narrateInsights } from "@/lib/intelligence/insights.functions";
import type { IntelInput } from "@/lib/intelligence/types";

/**
 * Insights are computed deterministically from production rows.
 * AI only rewords those computed numbers; if it is unavailable or drifts from
 * the evidence, the deterministic sentence is shown instead.
 */
export function useInsights(input: IntelInput, windowDays = 7) {
  const insights = useMemo(() => computeInsights(input, windowDays), [input, windowDays]);
  const narrate = useServerFn(narrateInsights);

  const payload = useMemo(
    () =>
      insights.map(({ link: _link, ...rest }) => ({
        ...rest,
        unit: rest.unit as string,
      })),
    [insights]
  );

  const fingerprint = useMemo(
    () => insights.map((i) => `${i.type}:${i.value}:${i.previous ?? "-"}`).join("|"),
    [insights]
  );

  const narration = useQuery({
    queryKey: ["insight-narratives", fingerprint],
    queryFn: () => narrate({ data: { insights: payload } }),
    enabled: insights.length > 0,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const narrated: NarratedInsight[] = insights.map((i) => {
    const match = narration.data?.narratives.find((n) => n.type === i.type);
    return match
      ? { ...i, headline: match.headline, narrative: match.narrative, narrated: true }
      : { ...i, narrative: deterministicNarrative(i), narrated: false };
  });

  return { insights: narrated, narrating: narration.isLoading };
}

function Delta({ i }: { i: Insight }) {
  if (i.change === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="h-3 w-3" /> no prior period
      </span>
    );
  }
  const up = i.change >= 0;
  const good = i.type === "overdue_work" ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px]",
        good ? "text-success" : "text-warn"
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(i.change).toFixed(1)}% vs prior {i.periodLabel.replace("last ", "")}
    </span>
  );
}

export function InsightsPanel({
  input,
  windowDays = 7,
  limit,
  title = "Insights",
}: {
  input: IntelInput;
  windowDays?: number;
  limit?: number;
  title?: string;
}) {
  const { insights, narrating } = useInsights(input, windowDays);
  const rows = limit ? insights.slice(0, limit) : insights;

  return (
    <Surface title={title} subtitle={narrating ? "Summarising…" : `Evidence from the ${insights.length ? insights[0]!.periodLabel : "last 7 days"}`}>
      {rows.length === 0 ? (
        <EmptyState
          title="Not enough activity yet"
          hint="Insights appear once engagements, work or syncs produce comparable periods."
        />
      ) : (
        <ul className="divide-y divide-edge/60">
          {rows.map((i) => (
            <li key={i.type} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[13px] font-medium truncate">{i.headline ?? i.title}</div>
                <div className="font-mono text-[13px] tabular-nums shrink-0">
                  {formatInsightValue(i)}
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">
                {i.narrative}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                <Delta i={i} />
                <span className="text-[10.5px] text-muted-foreground">
                  {i.records} record{i.records === 1 ? "" : "s"}
                </span>
                {i.confidence < 1 && (
                  <span className="text-[10.5px] text-warn">low confidence — thin sample</span>
                )}
                {i.affectedBrands.length > 0 && (
                  <span className="text-[10.5px] text-muted-foreground truncate">
                    {i.affectedBrands.slice(0, 3).join(", ")}
                  </span>
                )}
                <Link
                  to={i.link.to}
                  search={i.link.search as never}
                  className="text-[10.5px] text-teal hover:underline ml-auto"
                >
                  Open
                </Link>
              </div>
              <p className="text-[11px] text-foreground/70 mt-1.5">{i.recommendedAction}</p>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}