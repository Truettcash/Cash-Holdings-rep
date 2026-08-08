/**
 * Shared analytics scope: the global brand filter (translated to the brand key
 * the RPCs expect) and a 30-day window. Every surface passes this so the query
 * cache is shared and the argument set stays identical across the app.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "@/lib/data";
import { useApp } from "@/lib/app-context";
import type { AnalyticsScope } from "./keys";

const WINDOW_DAYS = 30;

/** Stable to the hour so the query key does not change on every render. */
function windowBounds(days = WINDOW_DAYS) {
  const end = new Date();
  end.setMinutes(0, 0, 0);
  const start = new Date(end.getTime() - days * 86_400_000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function useAnalyticsScope(
  overrides: Partial<AnalyticsScope> = {},
): AnalyticsScope & { brandKey: string | null } {
  const { brandFilter } = useApp();
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands });

  const brandKey = useMemo(() => {
    if (brandFilter === "all") return null;
    return (brands.data ?? []).find((b) => b.id === brandFilter)?.slug ?? null;
  }, [brandFilter, brands.data]);

  const { startAt, endAt } = useMemo(() => windowBounds(), []);

  return {
    brandKey,
    startAt,
    endAt,
    granularity: "day",
    limit: 50,
    ...overrides,
  };
}