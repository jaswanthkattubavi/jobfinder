-- Roles (admin/owner access for the diagnostics console)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','owner','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Email digest preferences
CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_enabled boolean NOT NULL DEFAULT false,
  email_address text,
  only_when_new boolean NOT NULL DEFAULT true,
  include_apply_asap boolean NOT NULL DEFAULT true,
  include_strong boolean NOT NULL DEFAULT true,
  include_review boolean NOT NULL DEFAULT false,
  minimum_opportunity integer NOT NULL DEFAULT 60,
  priority_alerts boolean NOT NULL DEFAULT true,
  priority_alert_threshold integer NOT NULL DEFAULT 85,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_preferences TO authenticated;
GRANT ALL ON public.email_preferences TO service_role;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own email preferences" ON public.email_preferences;
CREATE POLICY "Users manage their own email preferences" ON public.email_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Email delivery events (queued / sent / failed / skipped)
CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  recipient text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'queued',
  provider text,
  provider_message_id text,
  scan_run_id uuid,
  dedupe_key text UNIQUE,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT SELECT ON public.email_deliveries TO authenticated;
GRANT ALL ON public.email_deliveries TO service_role;
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read their own email deliveries" ON public.email_deliveries;
CREATE POLICY "Users read their own email deliveries" ON public.email_deliveries
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS email_deliveries_user_created_idx ON public.email_deliveries (user_id, created_at DESC);

-- Background automation jobs (sponsor refresh, health check): state, locking, pausing
CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_status text,
  last_detail text,
  next_run_after timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.automation_jobs TO authenticated;
GRANT ALL ON public.automation_jobs TO service_role;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users can read automation job state" ON public.automation_jobs;
CREATE POLICY "Signed-in users can read automation job state" ON public.automation_jobs
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.automation_jobs (id, last_status, last_detail)
VALUES ('sponsor_register_refresh', NULL, 'Never run yet'),
       ('health_check', NULL, 'Never run yet')
ON CONFLICT (id) DO NOTHING;