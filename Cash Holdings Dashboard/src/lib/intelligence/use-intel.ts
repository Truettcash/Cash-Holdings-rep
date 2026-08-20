import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "@/lib/data";
import { bookingEventsQuery, engagementsQuery } from "@/lib/engagements/queries";
import { integrationAccountsQuery, integrationSyncRunsQuery } from "@/lib/integrations/queries";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import { queryOptions } from "@tanstack/react-query";
import type { EngagementEventRow } from "@/lib/engagements/types";
import { emptyIntelInput, type IntelInput } from "./types";

/** Recent engagement history across all engagements (feeds brief + insights). */
export const recentEngagementEventsQuery = (limit = 200) =>
  queryOptions({
    queryKey: ["engagement-events", "recent", limit] as const,
    queryFn: async (): Promise<EngagementEventRow[]> => {
      const { data, error } = await cashHoldingsSupabase
        .from("engagement_events")
        .select("id,engagement_id,event_type,created_at,source,metadata")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as EngagementEventRow[];
    },
  });

/**
 * One shared read of everything the intelligence layer derives from.
 * All keys match the existing queries, so the cache is shared with every
 * other workspace — no duplicate network traffic.
 */
export function useIntel(options: { enabled?: boolean } = {}) {
  // `enabled: false` is how a surface switches this raw-table aggregation off
  // once its modular RPC has cut over — the two never run in parallel.
  const enabled = options.enabled ?? true;
  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands, enabled });
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects, enabled });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: q.tasks, enabled });
  const deals = useQuery({ queryKey: ["deals"], queryFn: q.deals, enabled });
  const activities = useQuery({
    queryKey: ["activities", 50],
    queryFn: () => q.activities(50),
    enabled,
  });
  const engagements = useQuery({ ...engagementsQuery({}), enabled });
  const engagementEvents = useQuery({ ...recentEngagementEventsQuery(), enabled });
  const bookingEvents = useQuery({ ...bookingEventsQuery(), enabled });
  const syncRuns = useQuery({ ...integrationSyncRunsQuery(undefined, 50), enabled });
  const accounts = useQuery({ ...integrationAccountsQuery(), enabled });

  const input = useMemo<IntelInput>(
    () => ({
      ...emptyIntelInput,
      brands: brands.data ?? [],
      projects: projects.data ?? [],
      tasks: tasks.data ?? [],
      deals: deals.data ?? [],
      activities: activities.data ?? [],
      engagements: engagements.data ?? [],
      engagementEvents: engagementEvents.data ?? [],
      bookingEvents: bookingEvents.data ?? [],
      syncRuns: syncRuns.data ?? [],
      accounts: accounts.data ?? [],
    }),
    [
      brands.data,
      projects.data,
      tasks.data,
      deals.data,
      activities.data,
      engagements.data,
      engagementEvents.data,
      bookingEvents.data,
      syncRuns.data,
      accounts.data,
    ]
  );

  const loading =
    enabled &&
    (brands.isLoading ||
      projects.isLoading ||
      tasks.isLoading ||
      deals.isLoading ||
      engagements.isLoading);

  return { input, loading };
}

const LAST_VISIT_KEY = "ch.lastVisit";

/** "Since your last visit" window — falls back to the last 24 hours. */
export function readLastVisit(now = Date.now()) {
  try {
    const raw = localStorage.getItem(LAST_VISIT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed < now) {
      // Never open a window narrower than 6 hours or wider than 14 days.
      return Math.min(Math.max(parsed, now - 14 * 86_400_000), now - 6 * 3_600_000);
    }
  } catch {
    /* no-op */
  }
  return now - 86_400_000;
}

export function touchLastVisit(now = Date.now()) {
  try {
    localStorage.setItem(LAST_VISIT_KEY, String(now));
  } catch {
    /* no-op */
  }
}