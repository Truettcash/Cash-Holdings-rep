-- ATHRTY production RLS posture snapshot.
-- Recovery-only. This records observed policy intent; do not apply blindly to production.

-- Owner-scoped prospect / design surfaces.
ALTER TABLE public.prospect_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY prospect_profiles_owner ON public.prospect_profiles
AS PERMISSIVE FOR ALL TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

ALTER TABLE public.prospect_account_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY prospect_account_models_owner ON public.prospect_account_models
AS PERMISSIVE FOR ALL TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

ALTER TABLE public.prospect_outreach_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY prospect_outreach_policies_owner ON public.prospect_outreach_policies
AS PERMISSIVE FOR ALL TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

ALTER TABLE public.prospect_outreach_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY prospect_outreach_queue_owner ON public.prospect_outreach_queue
AS PERMISSIVE FOR ALL TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

ALTER TABLE public.prospect_response_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY prospect_response_events_owner ON public.prospect_response_events
AS PERMISSIVE FOR ALL TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

ALTER TABLE public.athrty_design_critiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY athrty_design_critiques_owner_all ON public.athrty_design_critiques
AS PERMISSIVE FOR ALL TO authenticated
USING ((SELECT auth.uid()) = owner_user_id)
WITH CHECK ((SELECT auth.uid()) = owner_user_id);

ALTER TABLE public.athrty_design_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY athrty_design_skills_owner_all ON public.athrty_design_skills
AS PERMISSIVE FOR ALL TO authenticated
USING ((SELECT auth.uid()) = owner_user_id)
WITH CHECK ((SELECT auth.uid()) = owner_user_id);

ALTER TABLE public.athrty_site_learning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY athrty_site_learning_events_owner_all ON public.athrty_site_learning_events
AS PERMISSIVE FOR ALL TO authenticated
USING ((SELECT auth.uid()) = owner_user_id)
WITH CHECK ((SELECT auth.uid()) = owner_user_id);

ALTER TABLE public.athrty_site_learning_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY athrty_site_learning_patterns_owner_all ON public.athrty_site_learning_patterns
AS PERMISSIVE FOR ALL TO authenticated
USING ((SELECT auth.uid()) = owner_user_id)
WITH CHECK ((SELECT auth.uid()) = owner_user_id);

-- Core CRM surfaces are role-gated through has_role(auth.uid(),'owner').
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select organizations" ON public.organizations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner insert organizations" ON public.organizations FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner update organizations" ON public.organizations FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner delete organizations" ON public.organizations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select contacts" ON public.contacts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner update contacts" ON public.contacts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner delete contacts" ON public.contacts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select engagements" ON public.engagements FOR SELECT TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner insert engagements" ON public.engagements FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner update engagements" ON public.engagements FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner delete engagements" ON public.engagements FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select engagement_events" ON public.engagement_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner insert engagement_events" ON public.engagement_events FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner update engagement_events" ON public.engagement_events FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner delete engagement_events" ON public.engagement_events FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select brands" ON public.brands FOR SELECT TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner insert brands" ON public.brands FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner update brands" ON public.brands FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
CREATE POLICY "owner delete brands" ON public.brands FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner'::app_role));

-- Internal service/RPC-controlled tables observed with RLS enabled but no authenticated policies in pg_policies.
-- This is intentional posture capture, not a recommendation to add permissive policies.
ALTER TABLE public.prospect_preview_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athrty_site_qa_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athrty_event_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athrty_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athrty_lifecycle_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athrty_transition_policies ENABLE ROW LEVEL SECURITY;
