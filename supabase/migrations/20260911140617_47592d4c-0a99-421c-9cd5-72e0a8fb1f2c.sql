ALTER TABLE public.job_source_companies
  ADD COLUMN IF NOT EXISTS company_group text,
  ADD COLUMN IF NOT EXISTS official_domain text,
  ADD COLUMN IF NOT EXISTS discovery_method text,
  ADD COLUMN IF NOT EXISTS source_endpoint text,
  ADD COLUMN IF NOT EXISTS source_status text NOT NULL DEFAULT 'needs_configuration',
  ADD COLUMN IF NOT EXISTS needs_config_reason text,
  ADD COLUMN IF NOT EXISTS technology_jobs integer,
  ADD COLUMN IF NOT EXISTS new_jobs_last_scan integer,
  ADD COLUMN IF NOT EXISTS last_full_refresh_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS is_target_universe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_evidence text;

CREATE INDEX IF NOT EXISTS job_source_companies_user_group_idx
  ON public.job_source_companies (user_id, company_group);
CREATE INDEX IF NOT EXISTS job_source_companies_user_status_idx
  ON public.job_source_companies (user_id, source_status);
CREATE UNIQUE INDEX IF NOT EXISTS job_source_companies_user_company_uniq
  ON public.job_source_companies (user_id, lower(company_name));

CREATE TABLE IF NOT EXISTS public.company_monitor_state (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  registry_total integer NOT NULL DEFAULT 0,
  validation_cursor integer NOT NULL DEFAULT 0,
  validation_started_at timestamp with time zone,
  validation_completed_at timestamp with time zone,
  validation_status text NOT NULL DEFAULT 'not_started',
  last_full_scan_at timestamp with time zone,
  last_full_scan_trigger text,
  last_full_scan_status text,
  last_full_scan_detail text,
  last_scheduled_scan_at timestamp with time zone,
  jobs_fetched_last_scan integer NOT NULL DEFAULT 0,
  technology_jobs_last_scan integer NOT NULL DEFAULT 0,
  new_technology_jobs_last_scan integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_monitor_state TO authenticated;
GRANT ALL ON public.company_monitor_state TO service_role;

ALTER TABLE public.company_monitor_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own company monitor state"
  ON public.company_monitor_state FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER company_monitor_state_updated_at
  BEFORE UPDATE ON public.company_monitor_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();