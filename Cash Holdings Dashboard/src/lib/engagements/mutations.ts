import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import type { EngagementEventMetadata, EngagementEventRow, Json } from "./types";

type WriteResult = { data: unknown; error: { message: string } | null };

async function run(builder: PromiseLike<WriteResult>) {
  const { error } = await builder;
  if (error) throw new Error(error.message);
}

async function currentActor(): Promise<string | null> {
  const { data } = await cashHoldingsSupabase.auth.getUser();
  return data.user?.email ?? data.user?.id ?? null;
}

/** Append-only history write. Never overwrites existing events. */
export async function appendEngagementEvent(input: {
  engagementId: string;
  eventType: string;
  metadata?: EngagementEventMetadata;
}): Promise<void> {
  const actor = await currentActor();
  await run(
    cashHoldingsSupabase.from("engagement_events").insert({
      engagement_id: input.engagementId,
      event_type: input.eventType,
      source: "operator_console",
      metadata: { ...(input.metadata ?? {}), actor } as Record<string, Json>,
    } as never) as unknown as PromiseLike<WriteResult>
  );
}

async function patchEngagement(id: string, patch: Record<string, Json>) {
  await run(
    cashHoldingsSupabase
      .from("engagements")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", id) as unknown as PromiseLike<WriteResult>
  );
}

export async function updateEngagementStatus(input: {
  id: string;
  status: string;
  previousStatus: string | null;
  note?: string | null;
}) {
  if (input.status === input.previousStatus) return;
  await patchEngagement(input.id, { status: input.status });
  await appendEngagementEvent({
    engagementId: input.id,
    eventType: "status_changed",
    metadata: { field: "status", from: input.previousStatus, to: input.status, note: input.note ?? null },
  });
}

export async function updateEngagementPipelineStage(input: {
  id: string;
  pipelineStage: string;
  previousStage: string | null;
  note?: string | null;
}) {
  if (input.pipelineStage === input.previousStage) return;
  await patchEngagement(input.id, { pipeline_stage: input.pipelineStage });
  await appendEngagementEvent({
    engagementId: input.id,
    eventType: "pipeline_stage_changed",
    metadata: {
      field: "pipeline_stage",
      from: input.previousStage,
      to: input.pipelineStage,
      note: input.note ?? null,
    },
  });
}

/**
 * Operator annotations (internal note, next action, follow-up date, assignment) are
 * stored as history events — the shared intake table has no operator columns and
 * this pass must not add any.
 */
export async function addEngagementNote(input: { id: string; note: string }) {
  await appendEngagementEvent({
    engagementId: input.id,
    eventType: "note_added",
    metadata: { note: input.note },
  });
}

export async function setEngagementNextAction(input: {
  id: string;
  nextAction: string;
  followUpDate?: string | null;
}) {
  await appendEngagementEvent({
    engagementId: input.id,
    eventType: "next_action_set",
    metadata: { next_action: input.nextAction, follow_up_date: input.followUpDate ?? null },
  });
}

export async function setEngagementFollowUp(input: { id: string; followUpDate: string }) {
  await appendEngagementEvent({
    engagementId: input.id,
    eventType: "follow_up_scheduled",
    metadata: { follow_up_date: input.followUpDate },
  });
}

export async function assignEngagement(input: { id: string; assignedTo: string }) {
  await appendEngagementEvent({
    engagementId: input.id,
    eventType: "assignment_changed",
    metadata: { assigned_to: input.assignedTo },
  });
}

/** Latest operator annotation of a given kind, read back out of history. */
export function latestEventMetadata(
  events: EngagementEventRow[],
  eventType: string
): EngagementEventMetadata | null {
  const match = [...events]
    .filter((e) => e.event_type === eventType)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  return match?.metadata ?? null;
}