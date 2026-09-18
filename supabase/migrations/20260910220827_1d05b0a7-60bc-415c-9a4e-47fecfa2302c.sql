ALTER TABLE public.candidate_profiles
  ADD COLUMN IF NOT EXISTS visa_expiry_date date,
  ADD COLUMN IF NOT EXISTS work_authorisation_notes text;

ALTER TABLE public.cv_versions
  ADD COLUMN IF NOT EXISTS parse_status text NOT NULL DEFAULT 'not_parsed',
  ADD COLUMN IF NOT EXISTS parse_error text,
  ADD COLUMN IF NOT EXISTS parsed_at timestamptz;