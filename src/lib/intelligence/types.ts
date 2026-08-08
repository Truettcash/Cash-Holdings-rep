import type {
  Activity,
  Brand,
  Channel,
  Deal,
  MetricDefinition,
  MetricObservation,
  Project,
  Task,
} from "@/lib/data";
import type { EngagementEventRow, EngagementListRow } from "@/lib/engagements/types";
import type { IntegrationAccountSafe, IntegrationSyncRun } from "@/lib/integrations/types";

/**
 * Every intelligence module is a pure function over data already fetched by the
 * existing query helpers. Nothing here reads the database directly.
 */
export type IntelInput = {
  brands: Brand[];
  projects: Project[];
  tasks: Task[];
  deals: Deal[];
  activities: Activity[];
  channels: Channel[];
  metricDefs: MetricDefinition[];
  observations: MetricObservation[];
  engagements: EngagementListRow[];
  engagementEvents: EngagementEventRow[];
  bookingEvents: Pick<EngagementEventRow, "engagement_id" | "created_at">[];
  syncRuns: IntegrationSyncRun[];
  accounts: IntegrationAccountSafe[];
};

export const emptyIntelInput: IntelInput = {
  brands: [],
  projects: [],
  tasks: [],
  deals: [],
  activities: [],
  channels: [],
  metricDefs: [],
  observations: [],
  engagements: [],
  engagementEvents: [],
  bookingEvents: [],
  syncRuns: [],
  accounts: [],
};

/** Deep link target — restricted to real routes so navigation stays type-safe. */
export type IntelLink = {
  to:
    | "/"
    | "/command"
    | "/portfolio"
    | "/projects"
    | "/tasks"
    | "/crm"
    | "/engagements"
    | "/analytics"
    | "/integrations"
    | "/data-health";
  search?: Record<string, string>;
};

export const ms = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

export function isOpenTask(t: Task) {
  return t.status !== "completed" && t.status !== "archived";
}

export function isOverdue(t: Task, now = Date.now()) {
  return Boolean(t.due_date) && new Date(t.due_date as string).getTime() < now && isOpenTask(t);
}

export function within(iso: string | null | undefined, since: number, now = Date.now()) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= since && t <= now + ms.minute;
}