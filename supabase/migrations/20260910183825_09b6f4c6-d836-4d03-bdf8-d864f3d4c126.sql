CREATE TABLE public.sponsor_register_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url text,
  source_name text NOT NULL DEFAULT 'GOV.UK Register of Worker and Temporary Worker licensed sponsors',
  dataset_date date,
  method text NOT NULL DEFAULT 'automatic' CHECK (method IN ('automatic','manual')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  rows_imported integer NOT NULL DEFAULT 0,
  bytes_processed bigint NOT NULL DEFAULT 0,
  error_text text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.sponsor_register_imports TO authenticated;
GRANT ALL ON public.sponsor_register_imports TO service_role;
ALTER TABLE public.sponsor_register_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read sponsor import history"
  ON public.sponsor_register_imports FOR SELECT TO authenticated USING (true);

ALTER TABLE public.sponsor_register_entries
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.sponsor_register_imports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sponsor_register_batch ON public.sponsor_register_entries (batch_id);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sponsor_licence_match_status text NOT NULL DEFAULT 'unknown'
    CHECK (sponsor_licence_match_status IN ('matched','possible','not_found','unknown'));

ALTER TABLE public.job_sponsorship_analysis
  ADD COLUMN IF NOT EXISTS company_match_status text NOT NULL DEFAULT 'unknown'
    CHECK (company_match_status IN ('matched','possible','not_found','unknown')),
  ADD COLUMN IF NOT EXISTS company_matched_entity text,
  ADD COLUMN IF NOT EXISTS company_match_confidence integer,
  ADD COLUMN IF NOT EXISTS job_wording_summary text,
  ADD COLUMN IF NOT EXISTS work_authorisation_summary text,
  ADD COLUMN IF NOT EXISTS restriction_summary text,
  ADD COLUMN IF NOT EXISTS conclusion text;