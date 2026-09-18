ALTER TABLE public.job_analysis
  ADD COLUMN IF NOT EXISTS programming_languages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS frameworks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cloud_platforms_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS databases_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS devops_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ml_ai_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS data_tools_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS leadership_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS citizenship_requirements_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sponsorship_wording_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ats_critical_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ats_useful_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ats_optional_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS years_experience_text text,
  ADD COLUMN IF NOT EXISTS stated_seniority text,
  ADD COLUMN IF NOT EXISTS industry_domain text,
  ADD COLUMN IF NOT EXISTS description_hash text,
  ADD COLUMN IF NOT EXISTS analysis_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS analysis_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.job_analysis
  ADD CONSTRAINT job_analysis_status_check
  CHECK (analysis_status IN ('completed', 'failed', 'pending', 'skipped'));

CREATE INDEX IF NOT EXISTS job_analysis_hash_idx ON public.job_analysis (description_hash);
CREATE INDEX IF NOT EXISTS job_analysis_status_idx ON public.job_analysis (analysis_status);

ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS required_skills_score integer,
  ADD COLUMN IF NOT EXISTS preferred_skills_score integer,
  ADD COLUMN IF NOT EXISTS responsibilities_score integer,
  ADD COLUMN IF NOT EXISTS keyword_score integer,
  ADD COLUMN IF NOT EXISTS work_style_score integer,
  ADD COLUMN IF NOT EXISTS link_verification_score integer,
  ADD COLUMN IF NOT EXISTS why_recommended_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gaps_summary text,
  ADD COLUMN IF NOT EXISTS learned_adjustment integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.learned_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  signal_kind text NOT NULL,
  signal_value text NOT NULL,
  positive_count integer NOT NULL DEFAULT 0,
  negative_count integer NOT NULL DEFAULT 0,
  adjustment integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, signal_kind, signal_value)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learned_preferences TO authenticated;
GRANT ALL ON public.learned_preferences TO service_role;
ALTER TABLE public.learned_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own learned preferences"
  ON public.learned_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.scheduler_settings (
  id text PRIMARY KEY DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT false,
  local_hour integer NOT NULL DEFAULT 6,
  timezone text NOT NULL DEFAULT 'Europe/London',
  cron_token text,
  last_triggered_at timestamptz,
  last_status text,
  last_detail text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.scheduler_settings TO service_role;
ALTER TABLE public.scheduler_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.scheduler_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;