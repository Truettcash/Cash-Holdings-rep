-- ATHRTY commercial routing view hardening v1.
-- Preserve existing view definitions and grants while forcing caller-context
-- authorization/RLS evaluation through the underlying relations.

ALTER VIEW public.prospect_outreach_eligibility SET (security_invoker = true);
ALTER VIEW public.athrty_contractor_lead_page_candidates SET (security_invoker = true);
ALTER VIEW public.athrty_commercial_product_router SET (security_invoker = true);

-- Contract expectations after apply:
-- 1. All three views report security_invoker=true in pg_class.reloptions.
-- 2. Existing SELECT grants remain unchanged.
-- 3. Authenticated access is constrained by underlying owner-scoped RLS.
-- 4. Anonymous callers have no applicable underlying RLS policy and therefore
--    cannot inherit postgres-owner visibility through these views.
