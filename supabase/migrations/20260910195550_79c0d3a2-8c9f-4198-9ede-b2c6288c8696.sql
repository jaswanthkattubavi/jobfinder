ALTER TABLE public.job_source_companies
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'unvalidated',
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_error text,
  ADD COLUMN IF NOT EXISTS health text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS jobs_open integer,
  ADD COLUMN IF NOT EXISTS uk_jobs_open integer,
  ADD COLUMN IF NOT EXISTS relevant_jobs integer;

ALTER TABLE public.job_source_companies
  DROP CONSTRAINT IF EXISTS job_source_companies_validation_status_check;
ALTER TABLE public.job_source_companies
  ADD CONSTRAINT job_source_companies_validation_status_check
  CHECK (validation_status IN ('unvalidated','validated','failed'));

ALTER TABLE public.job_source_companies
  DROP CONSTRAINT IF EXISTS job_source_companies_health_check;
ALTER TABLE public.job_source_companies
  ADD CONSTRAINT job_source_companies_health_check
  CHECK (health IN ('unknown','healthy','warning','failed','disabled'));

CREATE INDEX IF NOT EXISTS job_source_companies_scan_order_idx
  ON public.job_source_companies (user_id, enabled, priority, last_scan_at);

CREATE TABLE IF NOT EXISTS public.company_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_alias)
);

GRANT SELECT ON public.company_aliases TO authenticated;
GRANT ALL ON public.company_aliases TO service_role;
ALTER TABLE public.company_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read company aliases"
  ON public.company_aliases FOR SELECT TO authenticated USING (true);