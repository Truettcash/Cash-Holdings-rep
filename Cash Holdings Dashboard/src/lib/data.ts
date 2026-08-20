import { cashHoldingsSupabase as supabase } from "@/integrations/cash-holdings/client";

export type Brand = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  status: string;
  accent_color: string | null;
};

export type Project = {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  project_type: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  blocker_reason: string | null;
  completed_at: string | null;
  created_at: string;
};

export type Organization = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  location: string | null;
  notes: string | null;
};

export type Contact = {
  id: string;
  organization_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
};

export type Deal = {
  id: string;
  brand_id: string | null;
  organization_id: string | null;
  primary_contact_id: string | null;
  name: string;
  stage: string;
  value: number | null;
  currency: string | null;
  expected_close: string | null;
  next_action: string | null;
  next_action_due: string | null;
  notes: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  brand_id: string | null;
  organization_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  activity_type: string;
  subject: string;
  body: string | null;
  activity_at: string;
  outcome?: string | null;
  created_at?: string;
};

export type Channel = {
  id: string;
  brand_id: string;
  name: string;
  channel_type: string;
  handle: string | null;
  url: string | null;
  status: string;
};

export type MetricDefinition = {
  id: string;
  key: string;
  name: string;
  unit: string | null;
  category: string | null;
};

export type MetricObservation = {
  id: string;
  channel_id: string;
  metric_definition_id: string;
  value: number;
  observed_at: string;
  source: string | null;
};

// Use untyped client (Database type empty); cast results.
const sb = () => supabase as any;

async function ok<T>(p: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return (data ?? ([] as unknown as T)) as T;
}

export const q = {
  brands: () => ok<Brand[]>(sb().from("brands").select("*").order("name")),
  brandBySlug: (slug: string) =>
    ok<Brand>(sb().from("brands").select("*").eq("slug", slug).single()),
  projects: () =>
    ok<Project[]>(sb().from("projects").select("*").order("created_at", { ascending: false })),
  tasks: () =>
    ok<Task[]>(
      sb()
        .from("project_tasks")
        .select("*")
        .order("created_at", { ascending: false })
    ),
  tasksByProject: (projectId: string) =>
    ok<Task[]>(
      sb()
        .from("project_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
    ),
  organizations: () => ok<Organization[]>(sb().from("organizations").select("*").order("name")),
  contacts: () => ok<Contact[]>(sb().from("contacts").select("*").order("full_name")),
  deals: () =>
    ok<Deal[]>(sb().from("deals").select("*").order("created_at", { ascending: false })),
  activities: (limit = 50) =>
    ok<Activity[]>(
      sb().from("activities").select("*").order("activity_at", { ascending: false }).limit(limit)
    ),
  channels: () => ok<Channel[]>(sb().from("channels").select("*").order("name")),
  metricDefs: () => ok<MetricDefinition[]>(sb().from("metric_definitions").select("*").order("name")),
  observationsForChannels: (channelIds: string[]) =>
    channelIds.length === 0
      ? Promise.resolve([] as MetricObservation[])
      : ok<MetricObservation[]>(
          sb()
            .from("metric_observations")
            .select("*")
            .in("channel_id", channelIds)
            .order("observed_at", { ascending: false })
            .limit(1000)
        ),
};
