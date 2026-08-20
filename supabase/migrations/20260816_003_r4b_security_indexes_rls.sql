-- ============================================================================
-- R4B.2 — SECURITY / INDEXES / RLS
-- Purpose: enforce owner scoping and lifecycle consistency across the derived
-- intelligence layer. No production deploy. No ATHRTY intelligence rows.
-- ============================================================================

begin;

create unique index if not exists intelligence_evidence_refs_owner_canonical_uniq
  on public.intelligence_evidence_refs (owner_user_id, canonical_table, canonical_row_uuid)
  where canonical_table is not null and canonical_row_uuid is not null;

create index if not exists intelligence_evidence_refs_source_idx
  on public.intelligence_evidence_refs (owner_user_id, source_id, document_id, content_id, citation_id);

create index if not exists active_constructs_state_idx
  on public.active_constructs (owner_user_id, state, last_observed_at desc);

create index if not exists decisions_status_idx
  on public.decision_paths (owner_user_id, status, effective_from desc);

create index if not exists lessons_status_idx
  on public.lessons (owner_user_id, status, created_at desc);

alter table public.intelligence_evidence_refs enable row level security;
alter table public.intelligence_signals enable row level security;
alter table public.active_constructs enable row level security;
alter table public.signal_evidence enable row level security;
alter table public.construct_signals enable row level security;
alter table public.decision_paths enable row level security;
alter table public.decision_evidence enable row level security;
alter table public.outcomes enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_evidence enable row level security;

drop policy if exists "owner reads own intelligence evidence refs" on public.intelligence_evidence_refs;
drop policy if exists "owner inserts own intelligence evidence refs" on public.intelligence_evidence_refs;
drop policy if exists "owner updates own intelligence evidence refs" on public.intelligence_evidence_refs;
drop policy if exists "owner deletes own intelligence evidence refs" on public.intelligence_evidence_refs;
create policy "owner reads own intelligence evidence refs"
  on public.intelligence_evidence_refs for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own intelligence evidence refs"
  on public.intelligence_evidence_refs for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner updates own intelligence evidence refs"
  on public.intelligence_evidence_refs for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "owner deletes own intelligence evidence refs"
  on public.intelligence_evidence_refs for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own intelligence signals" on public.intelligence_signals;
drop policy if exists "owner inserts own intelligence signals" on public.intelligence_signals;
drop policy if exists "owner updates own intelligence signals" on public.intelligence_signals;
drop policy if exists "owner deletes own intelligence signals" on public.intelligence_signals;
create policy "owner reads own intelligence signals"
  on public.intelligence_signals for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own intelligence signals"
  on public.intelligence_signals for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner updates own intelligence signals"
  on public.intelligence_signals for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "owner deletes own intelligence signals"
  on public.intelligence_signals for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own signal evidence" on public.signal_evidence;
drop policy if exists "owner inserts own signal evidence" on public.signal_evidence;
drop policy if exists "owner deletes own signal evidence" on public.signal_evidence;
create policy "owner reads own signal evidence"
  on public.signal_evidence for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own signal evidence"
  on public.signal_evidence for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner deletes own signal evidence"
  on public.signal_evidence for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own constructs" on public.active_constructs;
drop policy if exists "owner inserts own constructs" on public.active_constructs;
drop policy if exists "owner updates own constructs" on public.active_constructs;
drop policy if exists "owner deletes own constructs" on public.active_constructs;
create policy "owner reads own constructs"
  on public.active_constructs for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own constructs"
  on public.active_constructs for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner updates own constructs"
  on public.active_constructs for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "owner deletes own constructs"
  on public.active_constructs for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own construct signals" on public.construct_signals;
drop policy if exists "owner inserts own construct signals" on public.construct_signals;
drop policy if exists "owner deletes own construct signals" on public.construct_signals;
create policy "owner reads own construct signals"
  on public.construct_signals for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own construct signals"
  on public.construct_signals for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner deletes own construct signals"
  on public.construct_signals for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own decision paths" on public.decision_paths;
drop policy if exists "owner inserts own decision paths" on public.decision_paths;
drop policy if exists "owner updates own decision paths" on public.decision_paths;
drop policy if exists "owner deletes own decision paths" on public.decision_paths;
create policy "owner reads own decision paths"
  on public.decision_paths for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own decision paths"
  on public.decision_paths for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner updates own decision paths"
  on public.decision_paths for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "owner deletes own decision paths"
  on public.decision_paths for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own decision evidence" on public.decision_evidence;
drop policy if exists "owner inserts own decision evidence" on public.decision_evidence;
drop policy if exists "owner deletes own decision evidence" on public.decision_evidence;
create policy "owner reads own decision evidence"
  on public.decision_evidence for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own decision evidence"
  on public.decision_evidence for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner deletes own decision evidence"
  on public.decision_evidence for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own outcomes" on public.outcomes;
drop policy if exists "owner inserts own outcomes" on public.outcomes;
drop policy if exists "owner updates own outcomes" on public.outcomes;
drop policy if exists "owner deletes own outcomes" on public.outcomes;
create policy "owner reads own outcomes"
  on public.outcomes for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own outcomes"
  on public.outcomes for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner updates own outcomes"
  on public.outcomes for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "owner deletes own outcomes"
  on public.outcomes for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own lessons" on public.lessons;
drop policy if exists "owner inserts own lessons" on public.lessons;
drop policy if exists "owner updates own lessons" on public.lessons;
drop policy if exists "owner deletes own lessons" on public.lessons;
create policy "owner reads own lessons"
  on public.lessons for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own lessons"
  on public.lessons for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner updates own lessons"
  on public.lessons for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "owner deletes own lessons"
  on public.lessons for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "owner reads own lesson evidence" on public.lesson_evidence;
drop policy if exists "owner inserts own lesson evidence" on public.lesson_evidence;
drop policy if exists "owner deletes own lesson evidence" on public.lesson_evidence;
create policy "owner reads own lesson evidence"
  on public.lesson_evidence for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own lesson evidence"
  on public.lesson_evidence for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner deletes own lesson evidence"
  on public.lesson_evidence for delete to authenticated
  using (owner_user_id = auth.uid());

commit;
