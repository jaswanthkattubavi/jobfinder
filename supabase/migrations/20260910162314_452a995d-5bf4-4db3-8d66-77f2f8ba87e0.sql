-- 1. Employer job source configuration
CREATE TABLE public.job_source_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('greenhouse','lever','ashby','smartrecruiters','workday','search_provider')),
  provider_identifier text NOT NULL,
  careers_url text,
  enabled boolean NOT NULL DEFAULT true,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','medium','normal')),
  experimental boolean NOT NULL DEFAULT false,
  last_scan_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_job_count integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_identifier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_source_companies TO authenticated;
GRANT ALL ON public.job_source_companies TO service_role;
ALTER TABLE public.job_source_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_job_sources ON public.job_source_companies FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_job_source_companies_user ON public.job_source_companies(user_id, enabled);
CREATE TRIGGER t_job_source_companies_updated BEFORE UPDATE ON public.job_source_companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. UK sponsor register
CREATE TABLE public.sponsor_register_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_name text NOT NULL,
  normalized_name text NOT NULL,
  town_city text,
  county text,
  licence_type text,
  licence_rating text,
  route text,
  data_source text,
  register_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sponsor_register_entries TO authenticated;
GRANT ALL ON public.sponsor_register_entries TO service_role;
ALTER TABLE public.sponsor_register_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY sponsor_register_read ON public.sponsor_register_entries FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_sponsor_register_normalized ON public.sponsor_register_entries(normalized_name);

-- 3. Per-source scan observability
CREATE TABLE public.scan_source_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id uuid NOT NULL REFERENCES public.scan_runs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_identifier text,
  company_name text,
  status text NOT NULL CHECK (status IN ('success','failed','skipped','not_connected')),
  duration_ms integer NOT NULL DEFAULT 0,
  items_fetched integer NOT NULL DEFAULT 0,
  items_inserted integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  verification_failures integer NOT NULL DEFAULT 0,
  analysis_calls integer NOT NULL DEFAULT 0,
  analysis_failures integer NOT NULL DEFAULT 0,
  rate_limit_events integer NOT NULL DEFAULT 0,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scan_source_logs TO authenticated;
GRANT ALL ON public.scan_source_logs TO service_role;
ALTER TABLE public.scan_source_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_source_logs_read ON public.scan_source_logs FOR SELECT TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id);
CREATE INDEX idx_scan_source_logs_run ON public.scan_source_logs(scan_run_id);
CREATE INDEX idx_scan_source_logs_user ON public.scan_source_logs(user_id, created_at DESC);

-- 4. jobs: provenance, fingerprint, eligibility, verification
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS original_title text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS team text,
  ADD COLUMN IF NOT EXISTS workplace_type text,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_job_id text,
  ADD COLUMN IF NOT EXISTS eligibility_status text NOT NULL DEFAULT 'review'
    CHECK (eligibility_status IN ('eligible','likely_eligible','review','ineligible')),
  ADD COLUMN IF NOT EXISTS eligibility_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_reason text,
  ADD COLUMN IF NOT EXISTS description_hash text,
  ADD COLUMN IF NOT EXISTS analysis_error text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.jobs ALTER COLUMN posted_at DROP NOT NULL;
ALTER TABLE public.jobs ALTER COLUMN posted_at DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_fingerprint ON public.jobs(fingerprint) WHERE fingerprint IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_provider_job ON public.jobs(provider, provider_job_id)
  WHERE provider IS NOT NULL AND provider_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_discovered ON public.jobs(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_demo_active ON public.jobs(is_demo, is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_eligibility ON public.jobs(eligibility_status);

-- 5. companies: ATS config + sponsor register matching
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ats_provider text,
  ADD COLUMN IF NOT EXISTS ats_identifier text,
  ADD COLUMN IF NOT EXISTS sponsor_register_matched_entity text,
  ADD COLUMN IF NOT EXISTS sponsor_register_match_confidence integer,
  ADD COLUMN IF NOT EXISTS sponsor_register_match_method text,
  ADD COLUMN IF NOT EXISTS sponsor_licence_type text,
  ADD COLUMN IF NOT EXISTS sponsor_register_data_date date,
  ADD COLUMN IF NOT EXISTS source_reliability text,
  ADD COLUMN IF NOT EXISTS last_successful_scan_at timestamptz,
  ADD COLUMN IF NOT EXISTS scanning_enabled boolean NOT NULL DEFAULT false;

-- 6. preferences: custom queries + data visibility
ALTER TABLE public.search_preferences
  ADD COLUMN IF NOT EXISTS custom_queries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_visibility text NOT NULL DEFAULT 'real_only'
    CHECK (data_visibility IN ('real_only','demo_only','all')),
  ADD COLUMN IF NOT EXISTS show_filtered_jobs boolean NOT NULL DEFAULT false;

-- 7. scan_runs: warnings + richer counters
ALTER TABLE public.scan_runs DROP CONSTRAINT IF EXISTS scan_runs_status_check;
ALTER TABLE public.scan_runs ADD CONSTRAINT scan_runs_status_check
  CHECK (status IN ('running','completed','completed_with_warnings','failed','no_sources'));
ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS sources_succeeded integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sources_failed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jobs_updated integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jobs_verified integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jobs_expired integer NOT NULL DEFAULT 0;