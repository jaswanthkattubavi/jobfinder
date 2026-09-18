CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.candidate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  preferred_name text,
  headline text,
  summary text,
  location text,
  country text DEFAULT 'United Kingdom',
  career_level text,
  current_work_authorisation text,
  current_visa_type text,
  sponsorship_required_now boolean NOT NULL DEFAULT false,
  sponsorship_required_later boolean NOT NULL DEFAULT false,
  preferred_remote_type text[] NOT NULL DEFAULT ARRAY['Hybrid','Remote'],
  years_experience numeric NOT NULL DEFAULT 0,
  education text,
  certifications text[] NOT NULL DEFAULT '{}',
  minimum_salary integer NOT NULL DEFAULT 0,
  salary_currency text NOT NULL DEFAULT 'GBP',
  onboarding_completed boolean NOT NULL DEFAULT false,
  onboarding_step integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_profiles TO authenticated;
GRANT ALL ON public.candidate_profiles TO service_role;
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_profile ON public.candidate_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_candidate_profiles_updated BEFORE UPDATE ON public.candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.candidate_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  skill_category text NOT NULL DEFAULT 'General',
  proficiency text,
  years_experience numeric,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_skills TO authenticated;
GRANT ALL ON public.candidate_skills TO service_role;
ALTER TABLE public.candidate_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_skills ON public.candidate_skills FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_candidate_skills_user ON public.candidate_skills(user_id);

CREATE TABLE public.role_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_category text NOT NULL,
  target_titles text[] NOT NULL DEFAULT '{}',
  priority_skills text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  weight integer NOT NULL DEFAULT 50 CHECK (weight BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_preferences TO authenticated;
GRANT ALL ON public.role_preferences TO service_role;
ALTER TABLE public.role_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_role_prefs ON public.role_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_role_prefs_updated BEFORE UPDATE ON public.role_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.search_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  target_titles text[] NOT NULL DEFAULT '{}',
  excluded_titles text[] NOT NULL DEFAULT '{}',
  preferred_locations text[] NOT NULL DEFAULT '{}',
  excluded_locations text[] NOT NULL DEFAULT '{}',
  preferred_industries text[] NOT NULL DEFAULT '{}',
  excluded_industries text[] NOT NULL DEFAULT '{}',
  preferred_companies text[] NOT NULL DEFAULT '{}',
  excluded_companies text[] NOT NULL DEFAULT '{}',
  remote_preferences text[] NOT NULL DEFAULT ARRAY['Hybrid','Remote'],
  minimum_match_score integer NOT NULL DEFAULT 70 CHECK (minimum_match_score BETWEEN 0 AND 100),
  minimum_opportunity_score integer NOT NULL DEFAULT 60 CHECK (minimum_opportunity_score BETWEEN 0 AND 100),
  minimum_sponsorship_confidence integer NOT NULL DEFAULT 40 CHECK (minimum_sponsorship_confidence BETWEEN 0 AND 100),
  max_job_age_days integer NOT NULL DEFAULT 7 CHECK (max_job_age_days BETWEEN 1 AND 90),
  minimum_salary integer NOT NULL DEFAULT 0,
  excluded_keywords text[] NOT NULL DEFAULT '{}',
  reject_citizenship_required boolean NOT NULL DEFAULT true,
  reject_security_clearance boolean NOT NULL DEFAULT true,
  reject_above_seniority boolean NOT NULL DEFAULT true,
  include_graduate boolean NOT NULL DEFAULT true,
  include_junior boolean NOT NULL DEFAULT true,
  include_associate boolean NOT NULL DEFAULT true,
  include_midlevel boolean NOT NULL DEFAULT true,
  scoring_weights jsonb NOT NULL DEFAULT '{"cvMatch":40,"sponsorshipFit":20,"seniorityFit":10,"locationFit":10,"recency":10,"companyPriority":5,"salaryFit":5}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_preferences TO authenticated;
GRANT ALL ON public.search_preferences TO service_role;
ALTER TABLE public.search_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_search_prefs ON public.search_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_search_prefs_updated BEFORE UPDATE ON public.search_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  logo_url text,
  website_url text,
  careers_url text,
  industry text,
  company_size text,
  headquarters text,
  uk_locations text[] NOT NULL DEFAULT '{}',
  sponsor_register_status text NOT NULL DEFAULT 'unclear'
    CHECK (sponsor_register_status IN ('confirmed','likely','possible','unclear','unlikely','no_sponsorship')),
  sponsorship_confidence integer NOT NULL DEFAULT 0 CHECK (sponsorship_confidence BETWEEN 0 AND 100),
  sponsorship_last_checked timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_read ON public.companies FOR SELECT TO authenticated USING (true);
CREATE TRIGGER t_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.company_sponsorship_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  evidence_text text NOT NULL,
  source_url text,
  confidence integer NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  observed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_sponsorship_evidence TO authenticated;
GRANT ALL ON public.company_sponsorship_evidence TO service_role;
ALTER TABLE public.company_sponsorship_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_read ON public.company_sponsorship_evidence FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_evidence_company ON public.company_sponsorship_evidence(company_id);

CREATE TABLE public.company_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','medium','normal')),
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_watchlist TO authenticated;
GRANT ALL ON public.company_watchlist TO service_role;
ALTER TABLE public.company_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_watchlist ON public.company_watchlist FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_watchlist_user ON public.company_watchlist(user_id);

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_job_id text,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  normalized_title text NOT NULL,
  role_category text,
  city text,
  region text,
  country text NOT NULL DEFAULT 'United Kingdom',
  location_text text,
  remote_type text NOT NULL DEFAULT 'Hybrid' CHECK (remote_type IN ('Remote','Hybrid','On-site')),
  employment_type text NOT NULL DEFAULT 'Full-time',
  salary_min integer,
  salary_max integer,
  currency text NOT NULL DEFAULT 'GBP',
  description text,
  responsibilities text[] NOT NULL DEFAULT '{}',
  required_experience_years text,
  education_requirement text,
  seniority text,
  industry text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  application_deadline timestamptz,
  source_name text,
  source_url text,
  canonical_apply_url text,
  live_status text NOT NULL DEFAULT 'unknown'
    CHECK (live_status IN ('live','possibly_live','expired','broken','unknown')),
  last_verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  duplicate_of uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, normalized_title, city)
);
GRANT SELECT ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_read ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_jobs_posted ON public.jobs(posted_at DESC);
CREATE INDEX idx_jobs_live ON public.jobs(live_status);
CREATE INDEX idx_jobs_company ON public.jobs(company_id);
CREATE TRIGGER t_jobs_updated BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  external_job_id text,
  source_url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, source_name, external_job_id)
);
GRANT SELECT ON public.job_sources TO authenticated;
GRANT ALL ON public.job_sources TO service_role;
ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_sources_read ON public.job_sources FOR SELECT TO authenticated USING (true);

CREATE TABLE public.job_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  requirement_type text NOT NULL CHECK (requirement_type IN ('required','preferred')),
  importance_weight numeric NOT NULL DEFAULT 1,
  UNIQUE (job_id, skill_name, requirement_type)
);
GRANT SELECT ON public.job_skills TO authenticated;
GRANT ALL ON public.job_skills TO service_role;
ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_skills_read ON public.job_skills FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_job_skills_job ON public.job_skills(job_id);

CREATE TABLE public.job_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  required_skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferred_skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  technologies_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  responsibilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  education_requirements_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  domain_requirements_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  keywords_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  security_requirements_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  visa_language_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  analysis_version text NOT NULL DEFAULT 'rules-v1',
  analysed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_analysis TO authenticated;
GRANT ALL ON public.job_analysis TO service_role;
ALTER TABLE public.job_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_analysis_read ON public.job_analysis FOR SELECT TO authenticated USING (true);

CREATE TABLE public.job_sponsorship_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('confirmed','likely','possible','unclear','unlikely','no_sponsorship')),
  confidence integer NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  analysed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_sponsorship_analysis TO authenticated;
GRANT ALL ON public.job_sponsorship_analysis TO service_role;
ALTER TABLE public.job_sponsorship_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_sponsorship_read ON public.job_sponsorship_analysis FOR SELECT TO authenticated USING (true);

CREATE TABLE public.job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  cv_match_score integer NOT NULL DEFAULT 0 CHECK (cv_match_score BETWEEN 0 AND 100),
  opportunity_score integer NOT NULL DEFAULT 0 CHECK (opportunity_score BETWEEN 0 AND 100),
  skills_score integer NOT NULL DEFAULT 0,
  experience_score integer NOT NULL DEFAULT 0,
  education_score integer NOT NULL DEFAULT 0,
  seniority_score integer NOT NULL DEFAULT 0,
  domain_score integer NOT NULL DEFAULT 0,
  sponsorship_fit_score integer NOT NULL DEFAULT 0,
  location_fit_score integer NOT NULL DEFAULT 0,
  salary_fit_score integer NOT NULL DEFAULT 0,
  recency_score integer NOT NULL DEFAULT 0,
  company_priority_score integer NOT NULL DEFAULT 0,
  matched_skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  partial_skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  strengths_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text,
  recommendation_tier text NOT NULL DEFAULT 'review'
    CHECK (recommendation_tier IN ('apply_asap','strong_match','review','low_priority','hidden')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_matches TO authenticated;
GRANT ALL ON public.job_matches TO service_role;
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_matches ON public.job_matches FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_matches_user_score ON public.job_matches(user_id, opportunity_score DESC);

CREATE TABLE public.saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  folder text NOT NULL DEFAULT 'Apply Tonight',
  notes text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_jobs TO authenticated;
GRANT ALL ON public.saved_jobs TO service_role;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_saved ON public.saved_jobs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_saved_user ON public.saved_jobs(user_id);

CREATE TABLE public.cv_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  storage_path text NOT NULL,
  parsed_text text,
  parsed_profile_json jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_versions TO authenticated;
GRANT ALL ON public.cv_versions TO service_role;
ALTER TABLE public.cv_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_cvs ON public.cv_versions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_cv_user ON public.cv_versions(user_id);

CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'applied' CHECK (stage IN
    ('discovered','saved','applied','assessment','recruiter_screen','interview',
     'technical_interview','final_interview','offer','rejected','withdrawn')),
  applied_at timestamptz,
  cv_version_id uuid REFERENCES public.cv_versions(id) ON DELETE SET NULL,
  cv_version_name text,
  cover_letter_name text,
  recruiter_name text,
  notes text,
  next_step text,
  next_step_date timestamptz,
  interview_date timestamptz,
  needs_follow_up boolean NOT NULL DEFAULT false,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_applications ON public.applications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_applications_user_stage ON public.applications(user_id, stage);
CREATE TRIGGER t_applications_updated BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_value text,
  new_value text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_app_events ON public.application_events FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_app_events_app ON public.application_events(application_id, created_at DESC);

CREATE TABLE public.scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual','scheduled','demo')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','no_sources')),
  sources_checked integer NOT NULL DEFAULT 0,
  jobs_discovered integer NOT NULL DEFAULT 0,
  jobs_new integer NOT NULL DEFAULT 0,
  duplicates_removed integer NOT NULL DEFAULT 0,
  jobs_filtered integer NOT NULL DEFAULT 0,
  jobs_analysed integer NOT NULL DEFAULT 0,
  strong_matches integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  errors_json jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT ON public.scan_runs TO authenticated;
GRANT ALL ON public.scan_runs TO service_role;
ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_runs_read ON public.scan_runs FOR SELECT TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id);
CREATE INDEX idx_scan_runs_started ON public.scan_runs(started_at DESC);

CREATE TABLE public.scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id uuid NOT NULL REFERENCES public.scan_runs(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  result_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scan_results TO authenticated;
GRANT ALL ON public.scan_results TO service_role;
ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_results_read ON public.scan_results FOR SELECT TO authenticated USING (true);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_notifications ON public.notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_digest boolean NOT NULL DEFAULT true,
  apply_asap_alerts boolean NOT NULL DEFAULT true,
  sponsorship_alerts boolean NOT NULL DEFAULT true,
  priority_company_alerts boolean NOT NULL DEFAULT true,
  saved_job_expiry_alerts boolean NOT NULL DEFAULT true,
  application_followups boolean NOT NULL DEFAULT true,
  interview_reminders boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT false,
  browser_enabled boolean NOT NULL DEFAULT true,
  telegram_enabled boolean NOT NULL DEFAULT false,
  slack_enabled boolean NOT NULL DEFAULT false,
  digest_time time NOT NULL DEFAULT '06:15',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_notif_prefs ON public.notification_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_notif_prefs_updated BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN
    ('interested','not_interested','too_senior','wrong_role','no_sponsorship',
     'wrong_location','already_seen','bad_company_fit')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_feedback TO authenticated;
GRANT ALL ON public.user_feedback TO service_role;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_feedback ON public.user_feedback FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_feedback_user ON public.user_feedback(user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.candidate_profiles (user_id, display_name, preferred_name)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
          COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.search_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "cv_read_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cv_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cv_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "cv_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cvs' AND auth.uid()::text = (storage.foldername(name))[1]);

INSERT INTO public.companies (id, name, normalized_name, logo_url, industry, company_size, headquarters, uk_locations, sponsor_register_status, sponsorship_confidence, sponsorship_last_checked, is_demo) VALUES
 ('00000000-0000-4000-8000-0000000000c1','Northwind Labs','northwind labs','NL','AI Research Platform','250-500','London, UK',ARRAY['London','Manchester'],'confirmed',96,now(),true),
 ('00000000-0000-4000-8000-0000000000c2','Halcyon Data','halcyon data','HD','Data Infrastructure','80-150','Bristol, UK',ARRAY['Bristol','Remote UK'],'likely',78,now(),true),
 ('00000000-0000-4000-8000-0000000000c3','Verity Payments','verity payments','VP','Fintech','1000+','London, UK',ARRAY['London','Leeds'],'possible',61,now(),true),
 ('00000000-0000-4000-8000-0000000000c4','Beacon Cloud','beacon cloud','BC','Cloud Platform','500-1000','Reading, UK',ARRAY['Reading','London','Remote UK'],'likely',82,now(),true),
 ('00000000-0000-4000-8000-0000000000c5','Orbital Health','orbital health','OH','Health Tech','150-250','Cambridge, UK',ARRAY['Cambridge'],'unclear',44,now(),true),
 ('00000000-0000-4000-8000-0000000000c6','Ironclad Defence Systems','ironclad defence systems','ID','Defence','1000+','Portsmouth, UK',ARRAY['Portsmouth'],'no_sponsorship',8,now(),true);

INSERT INTO public.company_sponsorship_evidence (company_id, evidence_type, evidence_text, confidence) VALUES
 ('00000000-0000-4000-8000-0000000000c1','sponsor_register','Appears on the UK register of licensed sponsors (demo record)',96),
 ('00000000-0000-4000-8000-0000000000c1','advert_language','Job description states visa sponsorship is available',94),
 ('00000000-0000-4000-8000-0000000000c2','sponsor_register','Sponsor licence found for parent entity (demo record)',78),
 ('00000000-0000-4000-8000-0000000000c3','history','Large employer with prior international hires (demo record)',61),
 ('00000000-0000-4000-8000-0000000000c4','sponsor_register','Sponsor licence on record (demo record)',82),
 ('00000000-0000-4000-8000-0000000000c5','none','No sponsor licence evidence found yet (demo record)',44),
 ('00000000-0000-4000-8000-0000000000c6','advert_language','Advert requires UK citizenship and security clearance (demo record)',8);

INSERT INTO public.jobs (id, external_job_id, company_id, title, normalized_title, role_category, city, country, location_text, remote_type, salary_min, salary_max, description, responsibilities, required_experience_years, education_requirement, seniority, industry, posted_at, discovered_at, source_name, source_url, canonical_apply_url, live_status, last_verified_at, is_demo) VALUES
 ('00000000-0000-4000-8000-0000000000f1','demo-j1','00000000-0000-4000-8000-0000000000c1','Machine Learning Engineer','machine learning engineer','Machine Learning','London','United Kingdom','London, United Kingdom','Hybrid',55000,70000,'DEMO record. Northwind Labs is hiring a Machine Learning Engineer to build and ship production ML systems. Visa sponsorship is available for this role.',ARRAY['Build and deploy production ML models','Own features end to end','Improve reliability and testing'],'1-3 years','Bachelor''s degree in a technical subject','Junior','AI Research Platform',now(),now(),'Greenhouse','https://demo.jobs.example/northwind-labs/j1','https://demo.jobs.example/northwind-labs/j1/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000f2','demo-j2','00000000-0000-4000-8000-0000000000c4','Cloud Solutions Engineer (Graduate)','cloud solutions engineer (graduate)','Cloud Engineering','Reading','United Kingdom','Reading, United Kingdom','Hybrid',42000,52000,'DEMO record. Beacon Cloud graduate scheme for cloud solutions engineers working with customers on AWS migrations.',ARRAY['Support customer cloud migrations','Automate infrastructure with Terraform','Document delivery patterns'],'0-1 years','Bachelor''s degree in a technical subject','Graduate','Cloud Platform',now(),now(),'Workday','https://demo.jobs.example/beacon-cloud/j2','https://demo.jobs.example/beacon-cloud/j2/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000f3','demo-j3','00000000-0000-4000-8000-0000000000c2','Data Engineer','data engineer','Data Engineering','Remote UK','United Kingdom','Remote, United Kingdom','Remote',50000,62000,'DEMO record. Halcyon Data is hiring a Data Engineer to build batch and streaming pipelines.',ARRAY['Build and maintain data pipelines','Model data with dbt','Improve pipeline reliability'],'1-3 years','Bachelor''s degree in a technical subject','Junior','Data Infrastructure',now() - interval '1 day',now() - interval '1 day','Lever','https://demo.jobs.example/halcyon-data/j3','https://demo.jobs.example/halcyon-data/j3/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000f4','demo-j4','00000000-0000-4000-8000-0000000000c1','MLOps Engineer','mlops engineer','MLOps','London','United Kingdom','London, United Kingdom','Hybrid',58000,72000,'DEMO record. Northwind Labs is hiring an MLOps Engineer to own model deployment and monitoring. We can sponsor Skilled Worker visas.',ARRAY['Own CI/CD for ML services','Monitor models in production','Automate infrastructure'],'1-3 years','Bachelor''s degree in a technical subject','Associate','AI Research Platform',now() - interval '2 days',now() - interval '2 days','Greenhouse','https://demo.jobs.example/northwind-labs/j4','https://demo.jobs.example/northwind-labs/j4/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000f5','demo-j5','00000000-0000-4000-8000-0000000000c3','Data Scientist','data scientist','Data Science','London','United Kingdom','London, United Kingdom','Hybrid',52000,65000,'DEMO record. Verity Payments is hiring a Data Scientist for fraud and risk analytics.',ARRAY['Build predictive models','Run experiments','Present findings to stakeholders'],'1-3 years','Bachelor''s degree in a technical subject','Junior','Fintech',now() - interval '2 days',now() - interval '2 days','Company Careers','https://demo.jobs.example/verity-payments/j5','https://demo.jobs.example/verity-payments/j5/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000f6','demo-j6','00000000-0000-4000-8000-0000000000c2','Analytics Engineer','analytics engineer','Data Analytics','Bristol','United Kingdom','Bristol, United Kingdom','Hybrid',45000,55000,'DEMO record. Halcyon Data is hiring an Analytics Engineer to own the semantic layer.',ARRAY['Model data with dbt','Own reporting datasets','Improve data quality'],'1-3 years','Bachelor''s degree in a technical subject','Junior','Data Infrastructure',now() - interval '3 days',now() - interval '3 days','Ashby','https://demo.jobs.example/halcyon-data/j6','https://demo.jobs.example/halcyon-data/j6/apply','possibly_live',now(),true),
 ('00000000-0000-4000-8000-0000000000f7','demo-j7','00000000-0000-4000-8000-0000000000c4','Backend Software Engineer','backend software engineer','Backend Engineering','London','United Kingdom','London, United Kingdom','Hybrid',50000,65000,'DEMO record. Beacon Cloud is hiring a Backend Software Engineer for platform APIs.',ARRAY['Build and operate APIs','Improve service reliability','Write tests and docs'],'1-3 years','Bachelor''s degree in a technical subject','Junior','Cloud Platform',now() - interval '4 days',now() - interval '4 days','SmartRecruiters','https://demo.jobs.example/beacon-cloud/j7','https://demo.jobs.example/beacon-cloud/j7/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000f8','demo-j8','00000000-0000-4000-8000-0000000000c5','AI Product Associate','ai product associate','AI Product','Cambridge','United Kingdom','Cambridge, United Kingdom','On-site',40000,50000,'DEMO record. Orbital Health is hiring an AI Product Associate to shape clinical AI features.',ARRAY['Run product discovery','Define requirements','Analyse product usage'],'0-1 years','Bachelor''s degree','Graduate','Health Tech',now() - interval '5 days',now() - interval '5 days','Company Careers','https://demo.jobs.example/orbital-health/j8','https://demo.jobs.example/orbital-health/j8/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000f9','demo-j9','00000000-0000-4000-8000-0000000000c3','Platform Engineer','platform engineer','Platform Engineering','Leeds','United Kingdom','Leeds, United Kingdom','Hybrid',48000,60000,'DEMO record. Verity Payments is hiring a Platform Engineer for internal developer platform work.',ARRAY['Operate Kubernetes platforms','Automate delivery','Improve observability'],'1-3 years','Bachelor''s degree in a technical subject','Junior','Fintech',now() - interval '6 days',now() - interval '6 days','Job API','https://demo.jobs.example/verity-payments/j9','https://demo.jobs.example/verity-payments/j9/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000fa','demo-j10','00000000-0000-4000-8000-0000000000c1','AI Engineer (LLM Applications)','ai engineer (llm applications)','AI Engineering','London','United Kingdom','London, United Kingdom','Hybrid',60000,75000,'DEMO record. Northwind Labs is hiring an AI Engineer for LLM application work. Visa sponsorship offered.',ARRAY['Build retrieval-augmented applications','Evaluate model quality','Ship LLM features to production'],'1-3 years','Bachelor''s degree in a technical subject','Associate','AI Research Platform',now() - interval '1 day',now() - interval '1 day','Greenhouse','https://demo.jobs.example/northwind-labs/j10','https://demo.jobs.example/northwind-labs/j10/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000fb','demo-j11','00000000-0000-4000-8000-0000000000c6','Software Engineer (Cleared)','software engineer (cleared)','Software Engineering','Portsmouth','United Kingdom','Portsmouth, United Kingdom','On-site',45000,58000,'DEMO record. Ironclad Defence Systems requires UK citizenship and security clearance for this role. No visa sponsorship is available.',ARRAY['Develop embedded software','Work within cleared environments'],'1-3 years','Bachelor''s degree in a technical subject','Junior','Defence',now() - interval '4 days',now() - interval '4 days','Company Careers','https://demo.jobs.example/ironclad/j11','https://demo.jobs.example/ironclad/j11/apply','live',now(),true),
 ('00000000-0000-4000-8000-0000000000fc','demo-j12','00000000-0000-4000-8000-0000000000c5','Solutions Engineer','solutions engineer','Solutions Engineering','Cambridge','United Kingdom','Cambridge, United Kingdom','Hybrid',NULL,NULL,'DEMO record. Orbital Health is hiring a Solutions Engineer for customer-facing delivery.',ARRAY['Run technical demos','Support customer onboarding'],'1-3 years','Bachelor''s degree','Associate','Health Tech',now() - interval '7 days',now() - interval '7 days','Search API','https://demo.jobs.example/orbital-health/j12','https://demo.jobs.example/orbital-health/j12/apply','unknown',NULL,true);

INSERT INTO public.job_sources (job_id, source_name, external_job_id, source_url)
SELECT id, source_name, external_job_id, source_url FROM public.jobs WHERE is_demo = true;

INSERT INTO public.job_skills (job_id, skill_name, requirement_type)
SELECT j.job_id::uuid, s.skill, j.kind FROM (VALUES
 ('00000000-0000-4000-8000-0000000000f1', ARRAY['Python','PyTorch','Docker','AWS','SQL'], 'required'),
 ('00000000-0000-4000-8000-0000000000f1', ARRAY['Spark','MLflow','Kubernetes'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000f2', ARRAY['AWS','Python','Terraform','Linux'], 'required'),
 ('00000000-0000-4000-8000-0000000000f2', ARRAY['Azure','Kubernetes'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000f3', ARRAY['Python','SQL','Airflow'], 'required'),
 ('00000000-0000-4000-8000-0000000000f3', ARRAY['Spark','Kafka','dbt'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000f4', ARRAY['Python','Docker','CI/CD','Kubernetes'], 'required'),
 ('00000000-0000-4000-8000-0000000000f4', ARRAY['Terraform','MLflow'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000f5', ARRAY['Python','SQL','Statistics'], 'required'),
 ('00000000-0000-4000-8000-0000000000f5', ARRAY['Databricks','A/B testing'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000f6', ARRAY['SQL','dbt','Python'], 'required'),
 ('00000000-0000-4000-8000-0000000000f6', ARRAY['Looker'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000f7', ARRAY['Python','PostgreSQL','Docker'], 'required'),
 ('00000000-0000-4000-8000-0000000000f7', ARRAY['Go','AWS'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000f8', ARRAY['Analytics','Communication'], 'required'),
 ('00000000-0000-4000-8000-0000000000f8', ARRAY['SQL'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000f9', ARRAY['Linux','Docker','CI/CD'], 'required'),
 ('00000000-0000-4000-8000-0000000000f9', ARRAY['Kubernetes','Ansible'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000fa', ARRAY['Python','LLMs','FastAPI','AWS'], 'required'),
 ('00000000-0000-4000-8000-0000000000fa', ARRAY['Kafka','Vector databases'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000fb', ARRAY['C++','Security clearance','UK citizenship'], 'required'),
 ('00000000-0000-4000-8000-0000000000fb', ARRAY['Embedded systems'], 'preferred'),
 ('00000000-0000-4000-8000-0000000000fc', ARRAY['SQL','Communication'], 'required'),
 ('00000000-0000-4000-8000-0000000000fc', ARRAY['Snowflake'], 'preferred')
) AS j(job_id, skills, kind), unnest(j.skills) AS s(skill);

INSERT INTO public.job_sponsorship_analysis (job_id, status, confidence, evidence_json, warnings_json) VALUES
 ('00000000-0000-4000-8000-0000000000f1','confirmed',96,'["Company appears on the UK register of licensed sponsors (demo record)","Advert states Skilled Worker visas can be sponsored","Salary is above the general threshold"]','[]'),
 ('00000000-0000-4000-8000-0000000000f2','likely',82,'["Sponsor licence on record (demo record)","Graduate scheme historically open to visa holders"]','["Sponsorship is not explicitly confirmed in the advert"]'),
 ('00000000-0000-4000-8000-0000000000f3','likely',78,'["Sponsor licence found for parent entity (demo record)","Salary compatible with sponsorship thresholds"]','["Remote-UK contracts can complicate sponsorship"]'),
 ('00000000-0000-4000-8000-0000000000f4','confirmed',94,'["Licensed sponsor (demo record)","Advert mentions visa support"]','[]'),
 ('00000000-0000-4000-8000-0000000000f5','possible',61,'["Large employer with prior international hires (demo record)","Advert is silent on sponsorship"]','["Confirm sponsorship with the recruiter before applying"]'),
 ('00000000-0000-4000-8000-0000000000f6','likely',74,'["Sponsor licence on record (demo record)"]','["Advert does not mention sponsorship"]'),
 ('00000000-0000-4000-8000-0000000000f7','likely',80,'["Licensed sponsor (demo record)","Role eligible for the Skilled Worker route"]','[]'),
 ('00000000-0000-4000-8000-0000000000f8','unclear',44,'["No sponsor licence evidence found yet (demo record)"]','["Low-confidence assessment — verify before applying"]'),
 ('00000000-0000-4000-8000-0000000000f9','possible',58,'["Prior international hires (demo record)"]','["Advert is silent on sponsorship"]'),
 ('00000000-0000-4000-8000-0000000000fa','confirmed',95,'["Licensed sponsor (demo record)","Advert offers visa sponsorship"]','[]'),
 ('00000000-0000-4000-8000-0000000000fb','no_sponsorship',6,'["Advert requires UK citizenship (demo record)","Security clearance required"]','["Excluded by eligibility rules"]'),
 ('00000000-0000-4000-8000-0000000000fc','unclear',41,'["No evidence gathered yet (demo record)"]','["Job link could not be verified"]');

INSERT INTO public.job_analysis (job_id, required_skills_json, preferred_skills_json, keywords_json, security_requirements_json, visa_language_json)
SELECT j.id,
  COALESCE((SELECT jsonb_agg(s.skill_name) FROM public.job_skills s WHERE s.job_id = j.id AND s.requirement_type = 'required'), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(s.skill_name) FROM public.job_skills s WHERE s.job_id = j.id AND s.requirement_type = 'preferred'), '[]'::jsonb),
  '[]'::jsonb,
  CASE WHEN j.description ILIKE '%clearance%' THEN '["Security clearance required"]'::jsonb ELSE '[]'::jsonb END,
  CASE WHEN j.description ILIKE '%sponsorship is available%' OR j.description ILIKE '%sponsorship offered%' OR j.description ILIKE '%can sponsor%'
       THEN '["Advert mentions visa sponsorship"]'::jsonb
       WHEN j.description ILIKE '%no visa sponsorship%' THEN '["Advert states no visa sponsorship"]'::jsonb
       ELSE '[]'::jsonb END
FROM public.jobs j WHERE j.is_demo = true;