-- Owner-only RLS for the legacy managed Lovable Cloud public tables.
-- Replaces the permissive `USING (true)` "operators manage ..." policies.
-- Run once in the managed project's SQL editor (the migration tool is
-- currently disabled for this project).

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

DO $$
DECLARE
  t text;
  p record;
  tables text[] := ARRAY[
    'activities','brands','channels','contacts','deals',
    'metric_definitions','metric_observations','organizations',
    'project_tasks','projects'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.has_role(auth.uid(), ''owner''::public.app_role)) '
      'WITH CHECK (public.has_role(auth.uid(), ''owner''::public.app_role))',
      'owner only ' || t, t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
