ALTER TABLE public.job_source_companies
  DROP CONSTRAINT IF EXISTS job_source_companies_provider_check;

ALTER TABLE public.job_source_companies
  ADD CONSTRAINT job_source_companies_provider_check
  CHECK (provider = ANY (ARRAY[
    'greenhouse','lever','ashby','smartrecruiters','workable','teamtailor',
    'recruitee','personio','workday','search_provider','unknown'
  ]));