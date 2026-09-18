export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      application_events: {
        Row: {
          application_id: string
          created_at: string
          event_type: string
          id: string
          new_value: string | null
          notes: string | null
          previous_value: string | null
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          event_type: string
          id?: string
          new_value?: string | null
          notes?: string | null
          previous_value?: string | null
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          event_type?: string
          id?: string
          new_value?: string | null
          notes?: string | null
          previous_value?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string | null
          cover_letter_name: string | null
          created_at: string
          cv_version_id: string | null
          cv_version_name: string | null
          id: string
          interview_date: string | null
          job_id: string
          needs_follow_up: boolean
          next_step: string | null
          next_step_date: string | null
          notes: string | null
          outcome: string | null
          recruiter_name: string | null
          stage: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          cover_letter_name?: string | null
          created_at?: string
          cv_version_id?: string | null
          cv_version_name?: string | null
          id?: string
          interview_date?: string | null
          job_id: string
          needs_follow_up?: boolean
          next_step?: string | null
          next_step_date?: string | null
          notes?: string | null
          outcome?: string | null
          recruiter_name?: string | null
          stage?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          cover_letter_name?: string | null
          created_at?: string
          cv_version_id?: string | null
          cv_version_name?: string | null
          id?: string
          interview_date?: string | null
          job_id?: string
          needs_follow_up?: boolean
          next_step?: string | null
          next_step_date?: string | null
          notes?: string | null
          outcome?: string | null
          recruiter_name?: string | null
          stage?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_cv_version_id_fkey"
            columns: ["cv_version_id"]
            isOneToOne: false
            referencedRelation: "cv_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_jobs: {
        Row: {
          consecutive_failures: number
          enabled: boolean
          id: string
          last_detail: string | null
          last_run_at: string | null
          last_status: string | null
          last_success_at: string | null
          lease_until: string | null
          next_run_after: string | null
          pause_reason: string | null
          paused: boolean
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          enabled?: boolean
          id: string
          last_detail?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_success_at?: string | null
          lease_until?: string | null
          next_run_after?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          enabled?: boolean
          id?: string
          last_detail?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_success_at?: string | null
          lease_until?: string | null
          next_run_after?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      candidate_profiles: {
        Row: {
          career_level: string | null
          certifications: string[]
          country: string | null
          created_at: string
          current_visa_type: string | null
          current_work_authorisation: string | null
          display_name: string | null
          education: string | null
          headline: string | null
          id: string
          location: string | null
          minimum_salary: number
          onboarding_completed: boolean
          onboarding_step: number
          preferred_name: string | null
          preferred_remote_type: string[]
          salary_currency: string
          sponsorship_required_later: boolean
          sponsorship_required_now: boolean
          summary: string | null
          updated_at: string
          user_id: string
          visa_expiry_date: string | null
          work_authorisation_notes: string | null
          years_experience: number
        }
        Insert: {
          career_level?: string | null
          certifications?: string[]
          country?: string | null
          created_at?: string
          current_visa_type?: string | null
          current_work_authorisation?: string | null
          display_name?: string | null
          education?: string | null
          headline?: string | null
          id?: string
          location?: string | null
          minimum_salary?: number
          onboarding_completed?: boolean
          onboarding_step?: number
          preferred_name?: string | null
          preferred_remote_type?: string[]
          salary_currency?: string
          sponsorship_required_later?: boolean
          sponsorship_required_now?: boolean
          summary?: string | null
          updated_at?: string
          user_id: string
          visa_expiry_date?: string | null
          work_authorisation_notes?: string | null
          years_experience?: number
        }
        Update: {
          career_level?: string | null
          certifications?: string[]
          country?: string | null
          created_at?: string
          current_visa_type?: string | null
          current_work_authorisation?: string | null
          display_name?: string | null
          education?: string | null
          headline?: string | null
          id?: string
          location?: string | null
          minimum_salary?: number
          onboarding_completed?: boolean
          onboarding_step?: number
          preferred_name?: string | null
          preferred_remote_type?: string[]
          salary_currency?: string
          sponsorship_required_later?: boolean
          sponsorship_required_now?: boolean
          summary?: string | null
          updated_at?: string
          user_id?: string
          visa_expiry_date?: string | null
          work_authorisation_notes?: string | null
          years_experience?: number
        }
        Relationships: []
      }
      candidate_skills: {
        Row: {
          created_at: string
          id: string
          proficiency: string | null
          skill_category: string
          skill_name: string
          source: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          proficiency?: string | null
          skill_category?: string
          skill_name: string
          source?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          proficiency?: string | null
          skill_category?: string
          skill_name?: string
          source?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          ats_identifier: string | null
          ats_provider: string | null
          careers_url: string | null
          company_size: string | null
          created_at: string
          headquarters: string | null
          id: string
          industry: string | null
          is_demo: boolean
          last_successful_scan_at: string | null
          logo_url: string | null
          name: string
          normalized_name: string
          scanning_enabled: boolean
          source_reliability: string | null
          sponsor_licence_match_status: string
          sponsor_licence_type: string | null
          sponsor_register_data_date: string | null
          sponsor_register_match_confidence: number | null
          sponsor_register_match_method: string | null
          sponsor_register_matched_entity: string | null
          sponsor_register_status: string
          sponsorship_confidence: number
          sponsorship_last_checked: string | null
          uk_locations: string[]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          ats_identifier?: string | null
          ats_provider?: string | null
          careers_url?: string | null
          company_size?: string | null
          created_at?: string
          headquarters?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          last_successful_scan_at?: string | null
          logo_url?: string | null
          name: string
          normalized_name: string
          scanning_enabled?: boolean
          source_reliability?: string | null
          sponsor_licence_match_status?: string
          sponsor_licence_type?: string | null
          sponsor_register_data_date?: string | null
          sponsor_register_match_confidence?: number | null
          sponsor_register_match_method?: string | null
          sponsor_register_matched_entity?: string | null
          sponsor_register_status?: string
          sponsorship_confidence?: number
          sponsorship_last_checked?: string | null
          uk_locations?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          ats_identifier?: string | null
          ats_provider?: string | null
          careers_url?: string | null
          company_size?: string | null
          created_at?: string
          headquarters?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          last_successful_scan_at?: string | null
          logo_url?: string | null
          name?: string
          normalized_name?: string
          scanning_enabled?: boolean
          source_reliability?: string | null
          sponsor_licence_match_status?: string
          sponsor_licence_type?: string | null
          sponsor_register_data_date?: string | null
          sponsor_register_match_confidence?: number | null
          sponsor_register_match_method?: string | null
          sponsor_register_matched_entity?: string | null
          sponsor_register_status?: string
          sponsorship_confidence?: number
          sponsorship_last_checked?: string | null
          uk_locations?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      company_aliases: {
        Row: {
          alias: string
          company_id: string
          created_at: string
          id: string
          normalized_alias: string
          source: string | null
        }
        Insert: {
          alias: string
          company_id: string
          created_at?: string
          id?: string
          normalized_alias: string
          source?: string | null
        }
        Update: {
          alias?: string
          company_id?: string
          created_at?: string
          id?: string
          normalized_alias?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_monitor_state: {
        Row: {
          created_at: string
          jobs_fetched_last_scan: number
          last_full_scan_at: string | null
          last_full_scan_detail: string | null
          last_full_scan_status: string | null
          last_full_scan_trigger: string | null
          last_scheduled_scan_at: string | null
          new_technology_jobs_last_scan: number
          registry_total: number
          technology_jobs_last_scan: number
          updated_at: string
          user_id: string
          validation_completed_at: string | null
          validation_cursor: number
          validation_started_at: string | null
          validation_status: string
        }
        Insert: {
          created_at?: string
          jobs_fetched_last_scan?: number
          last_full_scan_at?: string | null
          last_full_scan_detail?: string | null
          last_full_scan_status?: string | null
          last_full_scan_trigger?: string | null
          last_scheduled_scan_at?: string | null
          new_technology_jobs_last_scan?: number
          registry_total?: number
          technology_jobs_last_scan?: number
          updated_at?: string
          user_id: string
          validation_completed_at?: string | null
          validation_cursor?: number
          validation_started_at?: string | null
          validation_status?: string
        }
        Update: {
          created_at?: string
          jobs_fetched_last_scan?: number
          last_full_scan_at?: string | null
          last_full_scan_detail?: string | null
          last_full_scan_status?: string | null
          last_full_scan_trigger?: string | null
          last_scheduled_scan_at?: string | null
          new_technology_jobs_last_scan?: number
          registry_total?: number
          technology_jobs_last_scan?: number
          updated_at?: string
          user_id?: string
          validation_completed_at?: string | null
          validation_cursor?: number
          validation_started_at?: string | null
          validation_status?: string
        }
        Relationships: []
      }
      company_sponsorship_evidence: {
        Row: {
          company_id: string
          confidence: number
          evidence_text: string
          evidence_type: string
          id: string
          observed_at: string
          source_url: string | null
        }
        Insert: {
          company_id: string
          confidence?: number
          evidence_text: string
          evidence_type: string
          id?: string
          observed_at?: string
          source_url?: string | null
        }
        Update: {
          company_id?: string
          confidence?: number
          evidence_text?: string
          evidence_type?: string
          id?: string
          observed_at?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_sponsorship_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_watchlist: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notifications_enabled: boolean
          priority: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notifications_enabled?: boolean
          priority?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notifications_enabled?: boolean
          priority?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_watchlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_versions: {
        Row: {
          id: string
          is_primary: boolean
          name: string
          parse_error: string | null
          parse_status: string
          parsed_at: string | null
          parsed_profile_json: Json | null
          parsed_text: string | null
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          id?: string
          is_primary?: boolean
          name: string
          parse_error?: string | null
          parse_status?: string
          parsed_at?: string | null
          parsed_profile_json?: Json | null
          parsed_text?: string | null
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          id?: string
          is_primary?: boolean
          name?: string
          parse_error?: string | null
          parse_status?: string
          parsed_at?: string | null
          parsed_profile_json?: Json | null
          parsed_text?: string | null
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_deliveries: {
        Row: {
          created_at: string
          dedupe_key: string | null
          error_text: string | null
          id: string
          kind: string
          provider: string | null
          provider_message_id: string | null
          recipient: string
          scan_run_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          error_text?: string | null
          id?: string
          kind: string
          provider?: string | null
          provider_message_id?: string | null
          recipient: string
          scan_run_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          error_text?: string | null
          id?: string
          kind?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string
          scan_run_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          created_at: string
          digest_enabled: boolean
          email_address: string | null
          include_apply_asap: boolean
          include_review: boolean
          include_strong: boolean
          minimum_opportunity: number
          only_when_new: boolean
          priority_alert_threshold: number
          priority_alerts: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_enabled?: boolean
          email_address?: string | null
          include_apply_asap?: boolean
          include_review?: boolean
          include_strong?: boolean
          minimum_opportunity?: number
          only_when_new?: boolean
          priority_alert_threshold?: number
          priority_alerts?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_enabled?: boolean
          email_address?: string | null
          include_apply_asap?: boolean
          include_review?: boolean
          include_strong?: boolean
          minimum_opportunity?: number
          only_when_new?: boolean
          priority_alert_threshold?: number
          priority_alerts?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_analysis: {
        Row: {
          analysed_at: string
          analysis_error: string | null
          analysis_status: string
          analysis_version: string
          ats_critical_json: Json
          ats_optional_json: Json
          ats_useful_json: Json
          citizenship_requirements_json: Json
          cloud_platforms_json: Json
          data_tools_json: Json
          databases_json: Json
          description_hash: string | null
          devops_json: Json
          domain_requirements_json: Json
          education_requirements_json: Json
          frameworks_json: Json
          id: string
          industry_domain: string | null
          job_id: string
          keywords_json: Json
          leadership_json: Json
          ml_ai_json: Json
          preferred_skills_json: Json
          programming_languages_json: Json
          required_skills_json: Json
          responsibilities_json: Json
          security_requirements_json: Json
          sponsorship_wording_json: Json
          stated_seniority: string | null
          technologies_json: Json
          updated_at: string
          visa_language_json: Json
          years_experience_text: string | null
        }
        Insert: {
          analysed_at?: string
          analysis_error?: string | null
          analysis_status?: string
          analysis_version?: string
          ats_critical_json?: Json
          ats_optional_json?: Json
          ats_useful_json?: Json
          citizenship_requirements_json?: Json
          cloud_platforms_json?: Json
          data_tools_json?: Json
          databases_json?: Json
          description_hash?: string | null
          devops_json?: Json
          domain_requirements_json?: Json
          education_requirements_json?: Json
          frameworks_json?: Json
          id?: string
          industry_domain?: string | null
          job_id: string
          keywords_json?: Json
          leadership_json?: Json
          ml_ai_json?: Json
          preferred_skills_json?: Json
          programming_languages_json?: Json
          required_skills_json?: Json
          responsibilities_json?: Json
          security_requirements_json?: Json
          sponsorship_wording_json?: Json
          stated_seniority?: string | null
          technologies_json?: Json
          updated_at?: string
          visa_language_json?: Json
          years_experience_text?: string | null
        }
        Update: {
          analysed_at?: string
          analysis_error?: string | null
          analysis_status?: string
          analysis_version?: string
          ats_critical_json?: Json
          ats_optional_json?: Json
          ats_useful_json?: Json
          citizenship_requirements_json?: Json
          cloud_platforms_json?: Json
          data_tools_json?: Json
          databases_json?: Json
          description_hash?: string | null
          devops_json?: Json
          domain_requirements_json?: Json
          education_requirements_json?: Json
          frameworks_json?: Json
          id?: string
          industry_domain?: string | null
          job_id?: string
          keywords_json?: Json
          leadership_json?: Json
          ml_ai_json?: Json
          preferred_skills_json?: Json
          programming_languages_json?: Json
          required_skills_json?: Json
          responsibilities_json?: Json
          security_requirements_json?: Json
          sponsorship_wording_json?: Json
          stated_seniority?: string | null
          technologies_json?: Json
          updated_at?: string
          visa_language_json?: Json
          years_experience_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_analysis_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_matches: {
        Row: {
          calculated_at: string
          company_priority_score: number
          cv_match_score: number
          domain_score: number
          education_score: number
          experience_score: number
          explanation: string | null
          gaps_summary: string | null
          id: string
          job_id: string
          keyword_score: number | null
          learned_adjustment: number
          link_verification_score: number | null
          location_fit_score: number
          matched_skills_json: Json
          missing_skills_json: Json
          opportunity_score: number
          partial_skills_json: Json
          preferred_skills_score: number | null
          recency_score: number
          recommendation_tier: string
          required_skills_score: number | null
          responsibilities_score: number | null
          risks_json: Json
          salary_fit_score: number
          seniority_score: number
          skills_score: number
          sponsorship_fit_score: number
          strengths_json: Json
          user_id: string
          why_recommended_json: Json
          work_style_score: number | null
        }
        Insert: {
          calculated_at?: string
          company_priority_score?: number
          cv_match_score?: number
          domain_score?: number
          education_score?: number
          experience_score?: number
          explanation?: string | null
          gaps_summary?: string | null
          id?: string
          job_id: string
          keyword_score?: number | null
          learned_adjustment?: number
          link_verification_score?: number | null
          location_fit_score?: number
          matched_skills_json?: Json
          missing_skills_json?: Json
          opportunity_score?: number
          partial_skills_json?: Json
          preferred_skills_score?: number | null
          recency_score?: number
          recommendation_tier?: string
          required_skills_score?: number | null
          responsibilities_score?: number | null
          risks_json?: Json
          salary_fit_score?: number
          seniority_score?: number
          skills_score?: number
          sponsorship_fit_score?: number
          strengths_json?: Json
          user_id: string
          why_recommended_json?: Json
          work_style_score?: number | null
        }
        Update: {
          calculated_at?: string
          company_priority_score?: number
          cv_match_score?: number
          domain_score?: number
          education_score?: number
          experience_score?: number
          explanation?: string | null
          gaps_summary?: string | null
          id?: string
          job_id?: string
          keyword_score?: number | null
          learned_adjustment?: number
          link_verification_score?: number | null
          location_fit_score?: number
          matched_skills_json?: Json
          missing_skills_json?: Json
          opportunity_score?: number
          partial_skills_json?: Json
          preferred_skills_score?: number | null
          recency_score?: number
          recommendation_tier?: string
          required_skills_score?: number | null
          responsibilities_score?: number | null
          risks_json?: Json
          salary_fit_score?: number
          seniority_score?: number
          skills_score?: number
          sponsorship_fit_score?: number
          strengths_json?: Json
          user_id?: string
          why_recommended_json?: Json
          work_style_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_skills: {
        Row: {
          id: string
          importance_weight: number
          job_id: string
          requirement_type: string
          skill_name: string
        }
        Insert: {
          id?: string
          importance_weight?: number
          job_id: string
          requirement_type: string
          skill_name: string
        }
        Update: {
          id?: string
          importance_weight?: number
          job_id?: string
          requirement_type?: string
          skill_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_skills_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_source_companies: {
        Row: {
          careers_url: string | null
          company_group: string | null
          company_id: string | null
          company_name: string
          consecutive_failures: number
          created_at: string
          discovery_method: string | null
          enabled: boolean
          experimental: boolean
          health: string
          id: string
          is_target_universe: boolean
          jobs_open: number | null
          last_attempt_at: string | null
          last_error: string | null
          last_full_refresh_at: string | null
          last_job_count: number | null
          last_scan_at: string | null
          last_success_at: string | null
          needs_config_reason: string | null
          new_jobs_last_scan: number | null
          notes: string | null
          official_domain: string | null
          priority: string
          provider: string
          provider_identifier: string
          relevant_jobs: number | null
          sector: string | null
          source_endpoint: string | null
          source_status: string
          source_url: string | null
          technology_jobs: number | null
          uk_jobs_open: number | null
          updated_at: string
          user_id: string
          validated_at: string | null
          validation_attempts: number
          validation_error: string | null
          validation_evidence: string | null
          validation_status: string
        }
        Insert: {
          careers_url?: string | null
          company_group?: string | null
          company_id?: string | null
          company_name: string
          consecutive_failures?: number
          created_at?: string
          discovery_method?: string | null
          enabled?: boolean
          experimental?: boolean
          health?: string
          id?: string
          is_target_universe?: boolean
          jobs_open?: number | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_full_refresh_at?: string | null
          last_job_count?: number | null
          last_scan_at?: string | null
          last_success_at?: string | null
          needs_config_reason?: string | null
          new_jobs_last_scan?: number | null
          notes?: string | null
          official_domain?: string | null
          priority?: string
          provider: string
          provider_identifier: string
          relevant_jobs?: number | null
          sector?: string | null
          source_endpoint?: string | null
          source_status?: string
          source_url?: string | null
          technology_jobs?: number | null
          uk_jobs_open?: number | null
          updated_at?: string
          user_id: string
          validated_at?: string | null
          validation_attempts?: number
          validation_error?: string | null
          validation_evidence?: string | null
          validation_status?: string
        }
        Update: {
          careers_url?: string | null
          company_group?: string | null
          company_id?: string | null
          company_name?: string
          consecutive_failures?: number
          created_at?: string
          discovery_method?: string | null
          enabled?: boolean
          experimental?: boolean
          health?: string
          id?: string
          is_target_universe?: boolean
          jobs_open?: number | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_full_refresh_at?: string | null
          last_job_count?: number | null
          last_scan_at?: string | null
          last_success_at?: string | null
          needs_config_reason?: string | null
          new_jobs_last_scan?: number | null
          notes?: string | null
          official_domain?: string | null
          priority?: string
          provider?: string
          provider_identifier?: string
          relevant_jobs?: number | null
          sector?: string | null
          source_endpoint?: string | null
          source_status?: string
          source_url?: string | null
          technology_jobs?: number | null
          uk_jobs_open?: number | null
          updated_at?: string
          user_id?: string
          validated_at?: string | null
          validation_attempts?: number
          validation_error?: string | null
          validation_evidence?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_source_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sources: {
        Row: {
          external_job_id: string | null
          first_seen_at: string
          id: string
          job_id: string
          last_seen_at: string
          source_name: string
          source_url: string | null
        }
        Insert: {
          external_job_id?: string | null
          first_seen_at?: string
          id?: string
          job_id: string
          last_seen_at?: string
          source_name: string
          source_url?: string | null
        }
        Update: {
          external_job_id?: string | null
          first_seen_at?: string
          id?: string
          job_id?: string
          last_seen_at?: string
          source_name?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_sources_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sponsorship_analysis: {
        Row: {
          analysed_at: string
          company_match_confidence: number | null
          company_match_status: string
          company_matched_entity: string | null
          conclusion: string | null
          confidence: number
          evidence_json: Json
          id: string
          job_id: string
          job_wording_summary: string | null
          restriction_summary: string | null
          status: string
          warnings_json: Json
          work_authorisation_summary: string | null
        }
        Insert: {
          analysed_at?: string
          company_match_confidence?: number | null
          company_match_status?: string
          company_matched_entity?: string | null
          conclusion?: string | null
          confidence?: number
          evidence_json?: Json
          id?: string
          job_id: string
          job_wording_summary?: string | null
          restriction_summary?: string | null
          status: string
          warnings_json?: Json
          work_authorisation_summary?: string | null
        }
        Update: {
          analysed_at?: string
          company_match_confidence?: number | null
          company_match_status?: string
          company_matched_entity?: string | null
          conclusion?: string | null
          confidence?: number
          evidence_json?: Json
          id?: string
          job_id?: string
          job_wording_summary?: string | null
          restriction_summary?: string | null
          status?: string
          warnings_json?: Json
          work_authorisation_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_sponsorship_analysis_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          analysis_error: string | null
          application_deadline: string | null
          canonical_apply_url: string | null
          city: string | null
          company_id: string
          country: string
          created_at: string
          currency: string
          department: string | null
          description: string | null
          description_hash: string | null
          discovered_at: string
          duplicate_of: string | null
          education_requirement: string | null
          eligibility_reasons: Json
          eligibility_status: string
          employment_type: string
          external_job_id: string | null
          fingerprint: string | null
          id: string
          industry: string | null
          is_active: boolean
          is_demo: boolean
          last_seen_at: string | null
          last_verified_at: string | null
          live_status: string
          location_text: string | null
          normalized_title: string
          original_title: string | null
          posted_at: string | null
          provider: string | null
          provider_job_id: string | null
          region: string | null
          remote_type: string
          required_experience_years: string | null
          responsibilities: string[]
          role_category: string | null
          salary_max: number | null
          salary_min: number | null
          seniority: string | null
          source_name: string | null
          source_url: string | null
          team: string | null
          title: string
          updated_at: string
          verification_reason: string | null
          workplace_type: string | null
        }
        Insert: {
          analysis_error?: string | null
          application_deadline?: string | null
          canonical_apply_url?: string | null
          city?: string | null
          company_id: string
          country?: string
          created_at?: string
          currency?: string
          department?: string | null
          description?: string | null
          description_hash?: string | null
          discovered_at?: string
          duplicate_of?: string | null
          education_requirement?: string | null
          eligibility_reasons?: Json
          eligibility_status?: string
          employment_type?: string
          external_job_id?: string | null
          fingerprint?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          is_demo?: boolean
          last_seen_at?: string | null
          last_verified_at?: string | null
          live_status?: string
          location_text?: string | null
          normalized_title: string
          original_title?: string | null
          posted_at?: string | null
          provider?: string | null
          provider_job_id?: string | null
          region?: string | null
          remote_type?: string
          required_experience_years?: string | null
          responsibilities?: string[]
          role_category?: string | null
          salary_max?: number | null
          salary_min?: number | null
          seniority?: string | null
          source_name?: string | null
          source_url?: string | null
          team?: string | null
          title: string
          updated_at?: string
          verification_reason?: string | null
          workplace_type?: string | null
        }
        Update: {
          analysis_error?: string | null
          application_deadline?: string | null
          canonical_apply_url?: string | null
          city?: string | null
          company_id?: string
          country?: string
          created_at?: string
          currency?: string
          department?: string | null
          description?: string | null
          description_hash?: string | null
          discovered_at?: string
          duplicate_of?: string | null
          education_requirement?: string | null
          eligibility_reasons?: Json
          eligibility_status?: string
          employment_type?: string
          external_job_id?: string | null
          fingerprint?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          is_demo?: boolean
          last_seen_at?: string | null
          last_verified_at?: string | null
          live_status?: string
          location_text?: string | null
          normalized_title?: string
          original_title?: string | null
          posted_at?: string | null
          provider?: string | null
          provider_job_id?: string | null
          region?: string | null
          remote_type?: string
          required_experience_years?: string | null
          responsibilities?: string[]
          role_category?: string | null
          salary_max?: number | null
          salary_min?: number | null
          seniority?: string | null
          source_name?: string | null
          source_url?: string | null
          team?: string | null
          title?: string
          updated_at?: string
          verification_reason?: string | null
          workplace_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      learned_preferences: {
        Row: {
          adjustment: number
          id: string
          negative_count: number
          positive_count: number
          signal_kind: string
          signal_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adjustment?: number
          id?: string
          negative_count?: number
          positive_count?: number
          signal_kind: string
          signal_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adjustment?: number
          id?: string
          negative_count?: number
          positive_count?: number
          signal_kind?: string
          signal_value?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          application_followups: boolean
          apply_asap_alerts: boolean
          browser_enabled: boolean
          created_at: string
          daily_digest: boolean
          digest_time: string
          email_enabled: boolean
          interview_reminders: boolean
          priority_company_alerts: boolean
          saved_job_expiry_alerts: boolean
          slack_enabled: boolean
          sponsorship_alerts: boolean
          telegram_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          application_followups?: boolean
          apply_asap_alerts?: boolean
          browser_enabled?: boolean
          created_at?: string
          daily_digest?: boolean
          digest_time?: string
          email_enabled?: boolean
          interview_reminders?: boolean
          priority_company_alerts?: boolean
          saved_job_expiry_alerts?: boolean
          slack_enabled?: boolean
          sponsorship_alerts?: boolean
          telegram_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          application_followups?: boolean
          apply_asap_alerts?: boolean
          browser_enabled?: boolean
          created_at?: string
          daily_digest?: boolean
          digest_time?: string
          email_enabled?: boolean
          interview_reminders?: boolean
          priority_company_alerts?: boolean
          saved_job_expiry_alerts?: boolean
          slack_enabled?: boolean
          sponsorship_alerts?: boolean
          telegram_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          message: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      role_preferences: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          priority_skills: string[]
          role_category: string
          target_titles: string[]
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          priority_skills?: string[]
          role_category: string
          target_titles?: string[]
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          priority_skills?: string[]
          role_category?: string
          target_titles?: string[]
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          folder: string
          id: string
          job_id: string
          notes: string | null
          saved_at: string
          user_id: string
        }
        Insert: {
          folder?: string
          id?: string
          job_id: string
          notes?: string | null
          saved_at?: string
          user_id: string
        }
        Update: {
          folder?: string
          id?: string
          job_id?: string
          notes?: string | null
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_results: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          result_type: string
          scan_run_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          result_type: string
          scan_run_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          result_type?: string
          scan_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_results_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_runs: {
        Row: {
          completed_at: string | null
          duplicates_removed: number
          errors_json: Json
          id: string
          is_demo: boolean
          jobs_analysed: number
          jobs_discovered: number
          jobs_expired: number
          jobs_filtered: number
          jobs_new: number
          jobs_updated: number
          jobs_verified: number
          sources_checked: number
          sources_failed: number
          sources_succeeded: number
          started_at: string
          status: string
          strong_matches: number
          trigger_type: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          duplicates_removed?: number
          errors_json?: Json
          id?: string
          is_demo?: boolean
          jobs_analysed?: number
          jobs_discovered?: number
          jobs_expired?: number
          jobs_filtered?: number
          jobs_new?: number
          jobs_updated?: number
          jobs_verified?: number
          sources_checked?: number
          sources_failed?: number
          sources_succeeded?: number
          started_at?: string
          status?: string
          strong_matches?: number
          trigger_type?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          duplicates_removed?: number
          errors_json?: Json
          id?: string
          is_demo?: boolean
          jobs_analysed?: number
          jobs_discovered?: number
          jobs_expired?: number
          jobs_filtered?: number
          jobs_new?: number
          jobs_updated?: number
          jobs_verified?: number
          sources_checked?: number
          sources_failed?: number
          sources_succeeded?: number
          started_at?: string
          status?: string
          strong_matches?: number
          trigger_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      scan_source_logs: {
        Row: {
          analysis_calls: number
          analysis_failures: number
          company_name: string | null
          created_at: string
          duplicates: number
          duration_ms: number
          error_text: string | null
          id: string
          items_fetched: number
          items_inserted: number
          items_updated: number
          provider: string
          provider_identifier: string | null
          rate_limit_events: number
          scan_run_id: string
          status: string
          user_id: string | null
          verification_failures: number
        }
        Insert: {
          analysis_calls?: number
          analysis_failures?: number
          company_name?: string | null
          created_at?: string
          duplicates?: number
          duration_ms?: number
          error_text?: string | null
          id?: string
          items_fetched?: number
          items_inserted?: number
          items_updated?: number
          provider: string
          provider_identifier?: string | null
          rate_limit_events?: number
          scan_run_id: string
          status: string
          user_id?: string | null
          verification_failures?: number
        }
        Update: {
          analysis_calls?: number
          analysis_failures?: number
          company_name?: string | null
          created_at?: string
          duplicates?: number
          duration_ms?: number
          error_text?: string | null
          id?: string
          items_fetched?: number
          items_inserted?: number
          items_updated?: number
          provider?: string
          provider_identifier?: string | null
          rate_limit_events?: number
          scan_run_id?: string
          status?: string
          user_id?: string | null
          verification_failures?: number
        }
        Relationships: [
          {
            foreignKeyName: "scan_source_logs_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_settings: {
        Row: {
          cron_token: string | null
          enabled: boolean
          id: string
          last_detail: string | null
          last_status: string | null
          last_triggered_at: string | null
          local_hour: number
          timezone: string
          updated_at: string
        }
        Insert: {
          cron_token?: string | null
          enabled?: boolean
          id?: string
          last_detail?: string | null
          last_status?: string | null
          last_triggered_at?: string | null
          local_hour?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          cron_token?: string | null
          enabled?: boolean
          id?: string
          last_detail?: string | null
          last_status?: string | null
          last_triggered_at?: string | null
          local_hour?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      search_preferences: {
        Row: {
          created_at: string
          custom_queries: string[]
          data_visibility: string
          excluded_companies: string[]
          excluded_industries: string[]
          excluded_keywords: string[]
          excluded_locations: string[]
          excluded_titles: string[]
          include_associate: boolean
          include_graduate: boolean
          include_junior: boolean
          include_midlevel: boolean
          max_job_age_days: number
          minimum_match_score: number
          minimum_opportunity_score: number
          minimum_salary: number
          minimum_sponsorship_confidence: number
          preferred_companies: string[]
          preferred_industries: string[]
          preferred_locations: string[]
          reject_above_seniority: boolean
          reject_citizenship_required: boolean
          reject_security_clearance: boolean
          remote_preferences: string[]
          scoring_weights: Json
          show_filtered_jobs: boolean
          target_titles: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_queries?: string[]
          data_visibility?: string
          excluded_companies?: string[]
          excluded_industries?: string[]
          excluded_keywords?: string[]
          excluded_locations?: string[]
          excluded_titles?: string[]
          include_associate?: boolean
          include_graduate?: boolean
          include_junior?: boolean
          include_midlevel?: boolean
          max_job_age_days?: number
          minimum_match_score?: number
          minimum_opportunity_score?: number
          minimum_salary?: number
          minimum_sponsorship_confidence?: number
          preferred_companies?: string[]
          preferred_industries?: string[]
          preferred_locations?: string[]
          reject_above_seniority?: boolean
          reject_citizenship_required?: boolean
          reject_security_clearance?: boolean
          remote_preferences?: string[]
          scoring_weights?: Json
          show_filtered_jobs?: boolean
          target_titles?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_queries?: string[]
          data_visibility?: string
          excluded_companies?: string[]
          excluded_industries?: string[]
          excluded_keywords?: string[]
          excluded_locations?: string[]
          excluded_titles?: string[]
          include_associate?: boolean
          include_graduate?: boolean
          include_junior?: boolean
          include_midlevel?: boolean
          max_job_age_days?: number
          minimum_match_score?: number
          minimum_opportunity_score?: number
          minimum_salary?: number
          minimum_sponsorship_confidence?: number
          preferred_companies?: string[]
          preferred_industries?: string[]
          preferred_locations?: string[]
          reject_above_seniority?: boolean
          reject_citizenship_required?: boolean
          reject_security_clearance?: boolean
          remote_preferences?: string[]
          scoring_weights?: Json
          show_filtered_jobs?: boolean
          target_titles?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sponsor_register_entries: {
        Row: {
          batch_id: string | null
          county: string | null
          created_at: string
          data_source: string | null
          id: string
          licence_rating: string | null
          licence_type: string | null
          normalized_name: string
          organisation_name: string
          register_date: string | null
          route: string | null
          town_city: string | null
        }
        Insert: {
          batch_id?: string | null
          county?: string | null
          created_at?: string
          data_source?: string | null
          id?: string
          licence_rating?: string | null
          licence_type?: string | null
          normalized_name: string
          organisation_name: string
          register_date?: string | null
          route?: string | null
          town_city?: string | null
        }
        Update: {
          batch_id?: string | null
          county?: string | null
          created_at?: string
          data_source?: string | null
          id?: string
          licence_rating?: string | null
          licence_type?: string | null
          normalized_name?: string
          organisation_name?: string
          register_date?: string | null
          route?: string | null
          town_city?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_register_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "sponsor_register_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_register_imports: {
        Row: {
          bytes_processed: number
          completed_at: string | null
          dataset_date: string | null
          error_text: string | null
          id: string
          method: string
          rows_imported: number
          source_name: string
          source_url: string | null
          started_at: string
          status: string
        }
        Insert: {
          bytes_processed?: number
          completed_at?: string | null
          dataset_date?: string | null
          error_text?: string | null
          id?: string
          method?: string
          rows_imported?: number
          source_name?: string
          source_url?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          bytes_processed?: number
          completed_at?: string | null
          dataset_date?: string | null
          error_text?: string | null
          id?: string
          method?: string
          rows_imported?: number
          source_name?: string
          source_url?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "owner" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "owner", "user"],
    },
  },
} as const
