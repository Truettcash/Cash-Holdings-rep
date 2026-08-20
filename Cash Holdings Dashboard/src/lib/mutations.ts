import { cashHoldingsSupabase as supabase } from "@/integrations/cash-holdings/client";

const sb = () => supabase as any;

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await p;
    if (error) throw new Error(error.message ?? "Write failed");
    return data as T;
}

export type TaskInput = {
  project_id: string;
  title: string;
  status?: string;
  priority?: string;
  due_date?: string | null;
  description?: string | null;
  blocker_reason?: string | null;
};

export type ProjectInput = {
  brand_id: string;
  name: string;
  project_type?: string | null;
  status?: string;
  priority?: string;
  due_date?: string | null;
  description?: string | null;
};

export type ActivityInput = {
  brand_id?: string | null;
  organization_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
  activity_type: string;
  subject: string;
  body?: string | null;
  outcome?: string | null;
  activity_at?: string;
};

export type ObservationInput = {
  channel_id: string;
  metric_definition_id: string;
  value: number;
  observed_at?: string;
  source?: string | null;
  notes?: string | null;
};

export type OrganizationInput = {
  name: string;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  notes?: string | null;
};

export type ContactInput = {
  full_name: string;
  organization_id?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
};

export type DealInput = {
  name: string;
  brand_id?: string | null;
  organization_id?: string | null;
  primary_contact_id?: string | null;
  stage?: string;
  value?: number | null;
  currency?: string | null;
  expected_close?: string | null;
  next_action?: string | null;
  next_action_due?: string | null;
  notes?: string | null;
};

export const m = {
  createTask: (input: TaskInput) =>
    unwrap(sb().from("project_tasks").insert(input).select("*").single()),
  updateTask: (id: string, patch: Partial<TaskInput> & { completed_at?: string | null }) =>
    unwrap(sb().from("project_tasks").update(patch).eq("id", id).select("*").single()),
  completeTask: (id: string) =>
    unwrap(
      sb()
        .from("project_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single()
    ),
  createProject: (input: ProjectInput) =>
    unwrap(sb().from("projects").insert(input).select("*").single()),
  createActivity: (input: ActivityInput) =>
    unwrap(
      sb()
        .from("activities")
        .insert({ activity_at: new Date().toISOString(), ...input })
        .select("*")
        .single()
    ),
  createObservation: (input: ObservationInput) =>
    unwrap(
      sb()
        .from("metric_observations")
        .insert({ observed_at: new Date().toISOString(), ...input })
        .select("*")
        .single()
    ),
  createOrganization: (input: OrganizationInput) =>
    unwrap(sb().from("organizations").insert(input).select("*").single()),
  createContact: (input: ContactInput) =>
    unwrap(sb().from("contacts").insert(input).select("*").single()),
  createDeal: (input: DealInput) =>
    unwrap(sb().from("deals").insert(input).select("*").single()),
};