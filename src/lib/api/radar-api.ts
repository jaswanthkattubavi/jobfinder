/**
 * Repository layer. Every Supabase read/write for the app lives here so pages
 * and components never talk to the database directly.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Application,
  ApplicationStage,

  CandidateProfile,
  CandidateSkill,
  Company,
  FeedbackReason,
  Job,
  LinkStatus,
  NotificationPreference,
  RemoteStatus,
  RoleCategory,
  SavedJob,
  ScanRun,
  ScoringWeights,
  SearchPreferences,
  Seniority,
  SponsorshipStatus,
} from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workday: "Workday",
  search_provider: "Search API",
  company_careers: "Company Careers",
};

/** Presents a stored provider id in the same wording the UI uses elsewhere. */
function prettySource(value: string | null): string {
  if (!value) return "Job API";
  return SOURCE_LABELS[value.toLowerCase()] ?? value;
}



/* ------------------------------------------------------------------ mapping */

const sponsorshipToUi: Record<string, SponsorshipStatus> = {
  confirmed: "Confirmed",
  likely: "Likely",
  possible: "Possible",
  unclear: "Unclear",
  unlikely: "Unlikely",
  no_sponsorship: "No Sponsorship",
};

const linkToUi: Record<string, LinkStatus> = {
  live: "Live",
  possibly_live: "Possibly Live",
  expired: "Expired",
  broken: "Broken Link",
  unknown: "Unknown",
};

const stageToUi: Record<string, ApplicationStage> = {
  discovered: "Discovered",
  saved: "Saved",
  applied: "Applied",
  assessment: "Assessment",
  recruiter_screen: "Recruiter Screen",
  interview: "Interview",
  technical_interview: "Technical Interview",
  final_interview: "Final Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const stageToDb = (stage: ApplicationStage): string =>
  Object.entries(stageToUi).find(([, ui]) => ui === stage)?.[0] ?? "applied";

export const feedbackToDb = (reason: FeedbackReason): string =>
  ({
    Interested: "interested",
    "Not Interested": "not_interested",
    "Too Senior": "too_senior",
    "Wrong Role": "wrong_role",
    "No Sponsorship": "no_sponsorship",
    "Wrong Location": "wrong_location",
    "Already Seen": "already_seen",
    "Bad Company Fit": "bad_company_fit",
  })[reason];

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/* -------------------------------------------------------------- row shapes */

interface JobRow {
  id: string;
  company_id: string;
  title: string;
  role_category: string | null;
  city: string | null;
  country: string;
  location_text: string | null;
  remote_type: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  description: string | null;
  responsibilities: string[] | null;
  required_experience_years: string | null;
  education_requirement: string | null;
  seniority: string | null;
  industry: string | null;
  posted_at: string;
  discovered_at: string;
  application_deadline: string | null;
  source_name: string | null;
  source_url: string | null;
  canonical_apply_url: string | null;
  live_status: string;
  last_verified_at: string | null;
  verification_reason?: string | null;
  is_active: boolean;
  is_demo: boolean;
}

interface MatchRow {
  job_id: string;
  cv_match_score: number;
  opportunity_score: number;
  skills_score: number;
  required_skills_score?: number | null;
  preferred_skills_score?: number | null;
  responsibilities_score?: number | null;
  keyword_score?: number | null;
  experience_score: number;
  education_score: number;
  seniority_score: number;
  domain_score: number;
  matched_skills_json: unknown;
  missing_skills_json: unknown;
  partial_skills_json: unknown;
  strengths_json: unknown;
  risks_json: unknown;
  why_recommended_json?: unknown;
  gaps_summary?: string | null;
  learned_adjustment?: number | null;
  explanation: string | null;
  recommendation_tier: string;
}


export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  jobId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface CvVersionItem {
  id: string;
  name: string;
  storagePath: string;
  isPrimary: boolean;
  uploadedAt: string;
  /** "not_parsed" | "parsed" | "failed" — reported honestly in the UI. */
  parseStatus: string;
  parseError: string | null;
  parsedAt: string | null;
  hasParsedText: boolean;
}

export interface ApplicationEventItem {
  id: string;
  applicationId: string;
  eventType: string;
  previousValue: string | null;
  newValue: string | null;
  notes: string | null;
  createdAt: string;
}

export interface RadarSnapshot {
  jobs: Job[];
  companies: Company[];
  saved: SavedJob[];
  applications: Application[];
  applicationEvents: ApplicationEventItem[];
  scans: ScanRun[];
  profile: CandidateProfile;
  preferences: SearchPreferences;
  weights: ScoringWeights;
  notifications: NotificationItem[];
  notificationPreferences: NotificationPreference[];
  ignored: string[];
  feedback: Array<{ jobId: string; reason: FeedbackReason }>;
  cvVersions: CvVersionItem[];
  skillDetails: CandidateSkill[];
  onboardingCompleted: boolean;
  hasDemoData: boolean;
}

const feedbackToUi = (value: string): FeedbackReason =>
  (Object.entries({
    Interested: "interested",
    "Not Interested": "not_interested",
    "Too Senior": "too_senior",
    "Wrong Role": "wrong_role",
    "No Sponsorship": "no_sponsorship",
    "Wrong Location": "wrong_location",
    "Already Seen": "already_seen",
    "Bad Company Fit": "bad_company_fit",
  }).find(([, db]) => db === value)?.[0] ?? "Not Interested") as FeedbackReason;

const timeOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "—";

/* ------------------------------------------------------------------- loader */

export async function loadSnapshot(userId: string): Promise<RadarSnapshot> {
  const [
    profileRes,
    skillsRes,
    rolesRes,
    prefsRes,
    companiesRes,
    evidenceRes,
    jobsRes,
    jobSkillsRes,
    analysisRes,

    sponsorshipRes,
    matchesRes,
    savedRes,
    appsRes,
    eventsRes,
    scansRes,
    notifRes,
    notifPrefRes,
    feedbackRes,
    watchRes,
    cvRes,
  ] = await Promise.all([
    supabase.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("candidate_skills").select("*").eq("user_id", userId),
    supabase.from("role_preferences").select("*").eq("user_id", userId),
    supabase.from("search_preferences").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("companies").select("*").order("name"),
    supabase.from("company_sponsorship_evidence").select("*"),
    supabase.from("jobs").select("*").order("posted_at", { ascending: false }),
    supabase.from("job_skills").select("*"),
    supabase.from("job_analysis").select("*"),

    supabase.from("job_sponsorship_analysis").select("*"),
    supabase.from("job_matches").select("*").eq("user_id", userId),
    supabase.from("saved_jobs").select("*").eq("user_id", userId).order("saved_at", { ascending: false }),
    supabase.from("applications").select("*").eq("user_id", userId),
    supabase
      .from("application_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("scan_runs").select("*").order("started_at", { ascending: false }).limit(20),
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_feedback").select("*").eq("user_id", userId),
    supabase.from("company_watchlist").select("*").eq("user_id", userId),
    supabase.from("cv_versions").select("*").eq("user_id", userId).order("uploaded_at", { ascending: false }),
  ]);

  const firstError = [
    profileRes.error,
    prefsRes.error,
    companiesRes.error,
    jobsRes.error,
    matchesRes.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const profileRow = (profileRes.data ?? null) as Record<string, unknown> | null;
  const prefRow = (prefsRes.data ?? null) as Record<string, unknown> | null;
  const skillRows = (skillsRes.data ?? []) as Array<Record<string, unknown>>;
  const roleRows = (rolesRes.data ?? []) as Array<Record<string, unknown>>;
  const cvRows = (cvRes.data ?? []) as Array<Record<string, unknown>>;
  const companyRows = (companiesRes.data ?? []) as Array<Record<string, unknown>>;
  const jobRows = (jobsRes.data ?? []) as unknown as JobRow[];
  const jobSkillRows = (jobSkillsRes.data ?? []) as Array<Record<string, unknown>>;
  const sponsorshipRows = (sponsorshipRes.data ?? []) as Array<Record<string, unknown>>;
  const matchRows = (matchesRes.data ?? []) as unknown as MatchRow[];
  const savedRows = (savedRes.data ?? []) as Array<Record<string, unknown>>;
  const appRows = (appsRes.data ?? []) as Array<Record<string, unknown>>;
  const watchRows = (watchRes.data ?? []) as Array<Record<string, unknown>>;
  const feedbackRows = (feedbackRes.data ?? []) as Array<Record<string, unknown>>;

  const analysisRows = (analysisRes.data ?? []) as Array<Record<string, unknown>>;
  const analysisByJob = new Map(analysisRows.map((a) => [a["job_id"] as string, a]));
  const matchByJob = new Map(matchRows.map((m) => [m.job_id, m]));

  const sponsorshipByJob = new Map(sponsorshipRows.map((s) => [s["job_id"] as string, s]));
  const watchByCompany = new Map(watchRows.map((w) => [w["company_id"] as string, w]));
  const appByJob = new Map(appRows.map((a) => [a["job_id"] as string, a]));

  const skillsFor = (jobId: string, kind: "required" | "preferred") =>
    jobSkillRows
      .filter((s) => s["job_id"] === jobId && s["requirement_type"] === kind)
      .map((s) => s["skill_name"] as string);

  const jobs: Job[] = jobRows.map((row) => {
    const match = matchByJob.get(row.id);
    const analysis = analysisByJob.get(row.id);
    const sponsorship = sponsorshipByJob.get(row.id);


    return {
      id: row.id,
      companyId: row.company_id,
      title: row.title,
      roleCategory: (row.role_category ?? "Software Engineering") as RoleCategory,
      location: row.location_text ?? `${row.city ?? ""}, ${row.country}`,
      city: row.city ?? "",
      country: row.country,
      remote: row.remote_type as RemoteStatus,
      employmentType: row.employment_type,
      salaryMin: row.salary_min ?? undefined,
      salaryMax: row.salary_max ?? undefined,
      currency: row.currency,
      description: row.description ?? "",
      responsibilities: row.responsibilities ?? [],
      requiredSkills: skillsFor(row.id, "required"),
      preferredSkills: skillsFor(row.id, "preferred"),
      yearsExperience: row.required_experience_years ?? "—",
      education: row.education_requirement ?? "—",
      seniority: (row.seniority ?? "Junior") as Seniority,
      industry: row.industry ?? "—",
      datePosted: row.posted_at,
      dateDiscovered: row.discovered_at,
      deadline: row.application_deadline ?? undefined,
      source: prettySource(row.source_name) as Job["source"],
      originalUrl: row.source_url ?? "",
      applyUrl: row.canonical_apply_url ?? row.source_url ?? "",
      active: row.is_active,
      lastVerified: row.last_verified_at ?? row.discovered_at,
      linkStatus: linkToUi[row.live_status] ?? "Unknown",
      verificationReason: row.verification_reason ?? undefined,
      opportunityScore: match?.opportunity_score ?? 0,
      match: {
        overall: match?.cv_match_score ?? 0,
        skills: match?.skills_score ?? 0,
        requiredSkills: match?.required_skills_score ?? match?.skills_score ?? 0,
        preferredSkills: match?.preferred_skills_score ?? 0,
        responsibilities: match?.responsibilities_score ?? 0,
        keywords: match?.keyword_score ?? 0,
        experience: match?.experience_score ?? 0,
        education: match?.education_score ?? 0,
        seniority: match?.seniority_score ?? 0,
        domain: match?.domain_score ?? 0,
        matchedSkills: asStrings(match?.matched_skills_json),
        missingSkills: asStrings(match?.missing_skills_json),
        partialSkills: asStrings(match?.partial_skills_json),
        strengths: asStrings(match?.strengths_json),
        risks: asStrings(match?.risks_json),
        whyRecommended: asStrings(match?.why_recommended_json),
        gapsSummary: match?.gaps_summary ?? "",
        learnedAdjustment: match?.learned_adjustment ?? 0,
        explanation: match?.explanation ?? "Not scored yet — run a scan to score this role.",
      },
      sponsorship: (() => {
        const raw = sponsorship?.["evidence_json"];
        const items = Array.isArray(raw)
          ? raw
              .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
              .map((e) => ({
                kind: (e["kind"] as string) ?? "job_wording",
                source: ((e["source"] as string) === "company" ? "company" : "job") as "company" | "job",
                tone: ((e["tone"] as string) ?? "neutral") as "positive" | "negative" | "neutral",
                text: (e["text"] as string) ?? "",
                ...(e["snippet"] ? { snippet: e["snippet"] as string } : {}),
              }))
              .filter((e) => e.text)
          : [];
        const details = sponsorship?.["conclusion"] || items.length > 0
          ? {
              employerMatch: ((sponsorship?.["company_match_status"] as string) ?? "unknown") as
                | "matched"
                | "possible"
                | "not_found"
                | "unknown",
              matchedEntity: (sponsorship?.["company_matched_entity"] as string) ?? null,
              matchConfidence: (sponsorship?.["company_match_confidence"] as number) ?? null,
              jobWording: (sponsorship?.["job_wording_summary"] as string) ?? "",
              workAuthorisation: (sponsorship?.["work_authorisation_summary"] as string) ?? "",
              restriction: (sponsorship?.["restriction_summary"] as string) ?? "",
              conclusion: (sponsorship?.["conclusion"] as string) ?? "",
              items,
            }
          : undefined;
        return {
          status: sponsorshipToUi[(sponsorship?.["status"] as string) ?? "unclear"] ?? "Unclear",
          confidence: (sponsorship?.["confidence"] as number) ?? 0,
          evidence: items.length > 0 ? items.map((i) => i.text) : asStrings(sponsorship?.["evidence_json"]),
          warnings: asStrings(sponsorship?.["warnings_json"]),
          details,
        };
      })(),
      atsKeywords: (() => {
        const kw = [
          ...asStrings(analysis?.["ats_critical_json"]),
          ...asStrings(analysis?.["ats_useful_json"]),
          ...asStrings(analysis?.["keywords_json"]),
        ];
        return (kw.length ? kw : [...skillsFor(row.id, "required"), ...skillsFor(row.id, "preferred")]).slice(0, 10);
      })(),
      atsCritical: asStrings(analysis?.["ats_critical_json"]),
      atsUseful: asStrings(analysis?.["ats_useful_json"]),

      technologies: asStrings(analysis?.["technologies_json"]),
      analysisStatus: ((analysis?.["analysis_status"] as string) ?? (analysis ? "completed" : "none")) as Job["analysisStatus"],
      analysisError: (analysis?.["analysis_error"] as string) ?? undefined,
      demo: row.is_demo,

    };
  });

  const evidenceRows = (evidenceRes.data ?? []) as Array<Record<string, unknown>>;

  const companies: Company[] = companyRows.map((row) => {
    const id = row["id"] as string;
    const watch = watchByCompany.get(id);
    const companyJobs = jobs.filter((j) => j.companyId === id);
    const applied = companyJobs.filter((j) => appByJob.has(j.id)).length;
    const scored = companyJobs.filter((j) => j.match.overall > 0);
    const priority = (watch?.["priority"] as string) ?? "normal";
    const confidence = (row["sponsorship_confidence"] as number) ?? 0;
    const size = (row["company_size"] as string) ?? "";
    const tags: Company["tags"] = [];
    if (watch && priority === "high") tags.push("Priority");
    if (confidence >= 70) tags.push("Sponsorship Friendly");
    if (/^(1|8)\d?\d?[-–]/.test(size) || size.startsWith("80")) tags.push("Startup");
    if (size.includes("1000") || size.includes("500")) tags.push("Large Company");
    if (companyJobs.some((j) => Date.now() - new Date(j.datePosted).getTime() < 7 * 86_400_000))
      tags.push("Recently Hiring");
    if (applied > 0) tags.push("Previously Applied");

    return {
      id,
      name: row["name"] as string,
      logo: ((row["logo_url"] as string) ?? (row["name"] as string).slice(0, 2)).slice(0, 2).toUpperCase(),
      industry: (row["industry"] as string) ?? "—",
      size: size || "—",
      headquarters: (row["headquarters"] as string) ?? "—",
      ukLocations: (row["uk_locations"] as string[]) ?? [],
      sponsorshipStatus: sponsorshipToUi[(row["sponsor_register_status"] as string) ?? "unclear"] ?? "Unclear",
      sponsorshipConfidence: confidence,
      sponsorEvidence: evidenceRows
        .filter((e) => e["company_id"] === id)
        .map((e) => e["evidence_text"] as string),
      sponsorLicenceMatch: ((row["sponsor_licence_match_status"] as string) ?? "unknown") as
        | "matched"
        | "possible"
        | "not_found"
        | "unknown",
      matchedLegalEntity: (row["sponsor_register_matched_entity"] as string) ?? null,
      sponsorLicenceType: (row["sponsor_licence_type"] as string) ?? null,
      sponsorRegisterDate: (row["sponsor_register_data_date"] as string) ?? null,
      sponsorLastChecked: (row["sponsorship_last_checked"] as string) ?? null,
      openMatchingRoles: companyJobs.filter((j) => j.active).length,
      previousApplications: applied,
      averageMatchScore: scored.length
        ? Math.round(scored.reduce((sum, j) => sum + j.match.overall, 0) / scored.length)
        : 0,
      priority: priority === "high" ? "High" : priority === "medium" ? "Medium" : "Normal",
      followed: Boolean(watch),
      tags,
    };
  });

  const applications: Application[] = appRows.map((row) => ({
    id: row["id"] as string,
    jobId: row["job_id"] as string,
    stage: stageToUi[(row["stage"] as string) ?? "applied"] ?? "Applied",
    appliedOn: (row["applied_at"] as string) ?? undefined,
    cvVersion: (row["cv_version_name"] as string) ?? undefined,
    coverLetter: (row["cover_letter_name"] as string) ?? undefined,
    notes: (row["notes"] as string) ?? undefined,
    recruiter: (row["recruiter_name"] as string) ?? undefined,
    deadline: (row["next_step_date"] as string) ?? undefined,
    nextStep: (row["next_step"] as string) ?? undefined,
    interviewDate: (row["interview_date"] as string) ?? undefined,
    needsFollowUp: Boolean(row["needs_follow_up"]),
  }));

  const scans: ScanRun[] = ((scansRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row["id"] as string,
    date: row["started_at"] as string,
    startedAt: timeOf(row["started_at"] as string),
    finishedAt: timeOf((row["completed_at"] as string) ?? null),
    sources: (row["sources_checked"] as number) ?? 0,
    discovered: (row["jobs_discovered"] as number) ?? 0,
    newJobs: (row["jobs_new"] as number) ?? 0,
    duplicatesRemoved: (row["duplicates_removed"] as number) ?? 0,
    expired: (row["jobs_filtered"] as number) ?? 0,
    analysed: (row["jobs_analysed"] as number) ?? 0,
    strongMatches: (row["strong_matches"] as number) ?? 0,
    errors: asStrings(row["errors_json"]),
  }));

  const cat = (name: string) => skillRows.filter((s) => s["skill_category"] === name).map((s) => s["skill_name"] as string);

  const profile: CandidateProfile = {
    name: (profileRow?.["preferred_name"] as string) ?? (profileRow?.["display_name"] as string) ?? "there",
    headline: (profileRow?.["headline"] as string) ?? "",
    summary: (profileRow?.["summary"] as string) ?? "",
    targetRoles: roleRows.filter((r) => r["enabled"]).map((r) => r["role_category"] as RoleCategory),
    preferredLocations: (prefRow?.["preferred_locations"] as string[]) ?? [],
    remotePreference: ((prefRow?.["remote_preferences"] as string[]) ?? []) as RemoteStatus[],
    salaryExpectation: {
      min: (prefRow?.["minimum_salary"] as number) ?? 0,
      max: Math.round(((prefRow?.["minimum_salary"] as number) ?? 0) * 1.6),
    },
    industries: (prefRow?.["preferred_industries"] as string[]) ?? [],
    preferredSeniority: allowedSeniority(prefRow) as Seniority[],
    skills: skillRows.map((s) => s["skill_name"] as string),
    languages: cat("Language"),
    cloud: cat("Cloud"),
    databases: cat("Database"),
    mlSkills: cat("ML"),
    yearsExperience: Number(profileRow?.["years_experience"] ?? 0),
    education: (profileRow?.["education"] as string) ?? "",
    certifications: (profileRow?.["certifications"] as string[]) ?? [],
    workAuthorization: (profileRow?.["current_work_authorisation"] as string) ?? "Not set",
    visaType: (profileRow?.["current_visa_type"] as string) ?? "Not set",
    sponsorshipRequiredNow: Boolean(profileRow?.["sponsorship_required_now"]),
    sponsorshipRequiredLater: Boolean(profileRow?.["sponsorship_required_later"]),
    visaExpiry: (profileRow?.["visa_expiry_date"] as string) ?? null,
    workAuthNotes: (profileRow?.["work_authorisation_notes"] as string) ?? "",
    cvVersions: cvRows.map((c) => c["name"] as string),
  };

  const preferences: SearchPreferences = {
    targetTitles: (prefRow?.["target_titles"] as string[]) ?? [],
    excludedTitles: (prefRow?.["excluded_titles"] as string[]) ?? [],
    locations: (prefRow?.["preferred_locations"] as string[]) ?? [],
    remotePreference: ((prefRow?.["remote_preferences"] as string[]) ?? []) as RemoteStatus[],
    salaryMin: (prefRow?.["minimum_salary"] as number) ?? 0,
    jobAgeDays: (prefRow?.["max_job_age_days"] as number) ?? 7,
    minMatchScore: (prefRow?.["minimum_match_score"] as number) ?? 0,
    minOpportunityScore: (prefRow?.["minimum_opportunity_score"] as number) ?? 0,
    minSponsorshipConfidence: (prefRow?.["minimum_sponsorship_confidence"] as number) ?? 0,
    excludedIndustries: (prefRow?.["excluded_industries"] as string[]) ?? [],
    excludedCompanies: (prefRow?.["excluded_companies"] as string[]) ?? [],
    rejectCitizenshipRequired: Boolean(prefRow?.["reject_citizenship_required"]),
    rejectSecurityClearance: Boolean(prefRow?.["reject_security_clearance"]),
    rejectAboveSeniority: Boolean(prefRow?.["reject_above_seniority"]),
  };

  const rawWeights = (prefRow?.["scoring_weights"] ?? {}) as Partial<ScoringWeights>;
  const weights: ScoringWeights = {
    cvMatch: rawWeights.cvMatch ?? 40,
    sponsorshipFit: rawWeights.sponsorshipFit ?? 20,
    seniorityFit: rawWeights.seniorityFit ?? 10,
    locationFit: rawWeights.locationFit ?? 10,
    recency: rawWeights.recency ?? 10,
    companyPriority: rawWeights.companyPriority ?? 5,
    salaryFit: rawWeights.salaryFit ?? 5,
  };

  const np = (notifPrefRes.data ?? {}) as Record<string, unknown>;
  const notificationPreferences: NotificationPreference[] = [
    { category: "Daily Job Digest", channels: ["In-app"], enabled: Boolean(np["daily_digest"]) },
    { category: "Apply ASAP Job", channels: ["In-app"], enabled: Boolean(np["apply_asap_alerts"]) },
    { category: "High Sponsorship Match", channels: ["In-app"], enabled: Boolean(np["sponsorship_alerts"]) },
    { category: "New Job at Priority Company", channels: ["In-app"], enabled: Boolean(np["priority_company_alerts"]) },
    { category: "Saved Job Expiring", channels: ["In-app"], enabled: Boolean(np["saved_job_expiry_alerts"]) },
    { category: "Application Follow-up", channels: ["In-app"], enabled: Boolean(np["application_followups"]) },
    { category: "Interview Reminder", channels: ["In-app"], enabled: Boolean(np["interview_reminders"]) },
  ];

  return {
    jobs,
    companies,
    saved: savedRows.map((row) => ({
      jobId: row["job_id"] as string,
      folder: row["folder"] as string,
      savedOn: row["saved_at"] as string,
    })),
    applications,
    applicationEvents: ((eventsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row["id"] as string,
      applicationId: row["application_id"] as string,
      eventType: row["event_type"] as string,
      previousValue: (row["previous_value"] as string) ?? null,
      newValue: (row["new_value"] as string) ?? null,
      notes: (row["notes"] as string) ?? null,
      createdAt: row["created_at"] as string,
    })),
    scans,
    profile,
    preferences,
    weights,
    notifications: ((notifRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row["id"] as string,
      type: row["type"] as string,
      title: row["title"] as string,
      message: (row["message"] as string) ?? null,
      jobId: (row["job_id"] as string) ?? null,
      readAt: (row["read_at"] as string) ?? null,
      createdAt: row["created_at"] as string,
    })),
    notificationPreferences,
    ignored: feedbackRows
      .filter((f) => f["feedback_type"] !== "interested")
      .map((f) => f["job_id"] as string),
    feedback: feedbackRows.map((f) => ({
      jobId: f["job_id"] as string,
      reason: feedbackToUi(f["feedback_type"] as string),
    })),
    cvVersions: cvRows.map((row) => ({
      id: row["id"] as string,
      name: row["name"] as string,
      storagePath: row["storage_path"] as string,
      isPrimary: Boolean(row["is_primary"]),
      uploadedAt: row["uploaded_at"] as string,
      parseStatus: (row["parse_status"] as string) ?? "not_parsed",
      parseError: (row["parse_error"] as string) ?? null,
      parsedAt: (row["parsed_at"] as string) ?? null,
      hasParsedText: Boolean(row["parsed_text"]),
    })),
    skillDetails: skillRows.map((row) => ({
      id: row["id"] as string,
      name: row["skill_name"] as string,
      category: (row["skill_category"] as string) ?? "General",
      source: (row["source"] as string) ?? "user",
    })),
    onboardingCompleted: Boolean(profileRow?.["onboarding_completed"]),
    hasDemoData: jobs.some((j) => j.demo),
  };
}

function allowedSeniority(prefRow: Record<string, unknown> | null): string[] {
  const list: string[] = [];
  if (prefRow?.["include_graduate"] !== false) list.push("Graduate");
  if (prefRow?.["include_junior"] !== false) list.push("Junior");
  if (prefRow?.["include_associate"] !== false) list.push("Associate");
  if (prefRow?.["include_midlevel"] !== false) list.push("Mid");
  return list;
}

/* ---------------------------------------------------------------- mutations */

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export async function dbSaveJob(userId: string, jobId: string, folder: string) {
  const { error } = await supabase
    .from("saved_jobs")
    .upsert({ user_id: userId, job_id: jobId, folder }, { onConflict: "user_id,job_id" });
  fail(error);
}

export async function dbUnsaveJob(userId: string, jobId: string) {
  const { error } = await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", jobId);
  fail(error);
}

export async function dbSetFeedback(userId: string, jobId: string, reason: FeedbackReason) {
  const { error } = await supabase
    .from("user_feedback")
    .upsert(
      { user_id: userId, job_id: jobId, feedback_type: feedbackToDb(reason) },
      { onConflict: "user_id,job_id" },
    );
  fail(error);
}

export async function dbMarkApplied(userId: string, jobId: string, details: Partial<Application>) {
  const { data: existing } = await supabase
    .from("applications")
    .select("id, stage")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();

  const payload = {
    user_id: userId,
    job_id: jobId,
    stage: "applied",
    applied_at: new Date().toISOString(),
    cv_version_name: details.cvVersion ?? null,
    notes: details.notes ?? null,
    next_step: details.nextStep ?? null,
  };

  const { data, error } = await supabase
    .from("applications")
    .upsert(payload, { onConflict: "user_id,job_id" })
    .select("id")
    .single();
  fail(error);

  const applicationId = (data as { id: string }).id;
  await supabase.from("application_events").insert({
    application_id: applicationId,
    user_id: userId,
    event_type: existing ? "stage_change" : "created",
    previous_value: (existing as { stage?: string } | null)?.stage ?? null,
    new_value: "applied",
  });
  return applicationId;
}

export async function dbMoveStage(
  userId: string,
  applicationId: string,
  previous: ApplicationStage,
  stage: ApplicationStage,
) {
  const { error } = await supabase
    .from("applications")
    .update({ stage: stageToDb(stage) })
    .eq("id", applicationId)
    .eq("user_id", userId);
  fail(error);
  await supabase.from("application_events").insert({
    application_id: applicationId,
    user_id: userId,
    event_type: "stage_change",
    previous_value: stageToDb(previous),
    new_value: stageToDb(stage),
  });
}

export async function dbUpdateApplication(
  userId: string,
  applicationId: string,
  patch: Partial<Application>,
) {
  const payload: Record<string, unknown> = {};
  if (patch.notes !== undefined) payload["notes"] = patch.notes;
  if (patch.nextStep !== undefined) payload["next_step"] = patch.nextStep;
  if (patch.recruiter !== undefined) payload["recruiter_name"] = patch.recruiter;
  if (patch.cvVersion !== undefined) payload["cv_version_name"] = patch.cvVersion;
  if (patch.interviewDate !== undefined) payload["interview_date"] = patch.interviewDate;
  if (patch.needsFollowUp !== undefined) payload["needs_follow_up"] = patch.needsFollowUp;
  if (patch.stage !== undefined) payload["stage"] = stageToDb(patch.stage);
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase
    .from("applications")
    .update(payload as never)
    .eq("id", applicationId)
    .eq("user_id", userId);
  fail(error);
}

export async function dbToggleFollow(userId: string, companyId: string, followed: boolean) {
  if (followed) {
    const { error } = await supabase
      .from("company_watchlist")
      .delete()
      .eq("user_id", userId)
      .eq("company_id", companyId);
    fail(error);
  } else {
    const { error } = await supabase
      .from("company_watchlist")
      .upsert({ user_id: userId, company_id: companyId, priority: "high" }, { onConflict: "user_id,company_id" });
    fail(error);
  }
}

export async function dbUpdatePreferences(userId: string, patch: Partial<SearchPreferences>) {
  const payload: Record<string, unknown> = {};
  if (patch.targetTitles) payload["target_titles"] = patch.targetTitles;
  if (patch.excludedTitles) payload["excluded_titles"] = patch.excludedTitles;
  if (patch.locations) payload["preferred_locations"] = patch.locations;
  if (patch.remotePreference) payload["remote_preferences"] = patch.remotePreference;
  if (patch.salaryMin !== undefined) payload["minimum_salary"] = patch.salaryMin;
  if (patch.jobAgeDays !== undefined) payload["max_job_age_days"] = patch.jobAgeDays;
  if (patch.minMatchScore !== undefined) payload["minimum_match_score"] = patch.minMatchScore;
  if (patch.minOpportunityScore !== undefined) payload["minimum_opportunity_score"] = patch.minOpportunityScore;
  if (patch.minSponsorshipConfidence !== undefined)
    payload["minimum_sponsorship_confidence"] = patch.minSponsorshipConfidence;
  if (patch.excludedIndustries) payload["excluded_industries"] = patch.excludedIndustries;
  if (patch.excludedCompanies) payload["excluded_companies"] = patch.excludedCompanies;
  if (patch.rejectCitizenshipRequired !== undefined)
    payload["reject_citizenship_required"] = patch.rejectCitizenshipRequired;
  if (patch.rejectSecurityClearance !== undefined)
    payload["reject_security_clearance"] = patch.rejectSecurityClearance;
  if (patch.rejectAboveSeniority !== undefined)
    payload["reject_above_seniority"] = patch.rejectAboveSeniority;
  const { error } = await supabase
    .from("search_preferences")
    .upsert({ user_id: userId, ...payload }, { onConflict: "user_id" });
  fail(error);
}

export async function dbUpdateWeights(userId: string, weights: ScoringWeights) {
  const { error } = await supabase
    .from("search_preferences")
    .upsert(
      { user_id: userId, scoring_weights: weights as unknown as Record<string, number> },
      { onConflict: "user_id" },
    );
  fail(error);
}

export async function dbUpdateProfile(userId: string, patch: Partial<CandidateProfile>) {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload["preferred_name"] = patch.name;
  if (patch.headline !== undefined) payload["headline"] = patch.headline;
  if (patch.summary !== undefined) payload["summary"] = patch.summary;
  if (patch.yearsExperience !== undefined) payload["years_experience"] = patch.yearsExperience;
  if (patch.education !== undefined) payload["education"] = patch.education;
  if (patch.certifications !== undefined) payload["certifications"] = patch.certifications;
  if (patch.workAuthorization !== undefined) payload["current_work_authorisation"] = patch.workAuthorization;
  if (patch.visaType !== undefined) payload["current_visa_type"] = patch.visaType;
  if (patch.sponsorshipRequiredNow !== undefined)
    payload["sponsorship_required_now"] = patch.sponsorshipRequiredNow;
  if (patch.sponsorshipRequiredLater !== undefined)
    payload["sponsorship_required_later"] = patch.sponsorshipRequiredLater;
  if (patch.visaExpiry !== undefined) payload["visa_expiry_date"] = patch.visaExpiry || null;
  if (patch.workAuthNotes !== undefined) payload["work_authorisation_notes"] = patch.workAuthNotes || null;
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase
    .from("candidate_profiles")
    .upsert({ user_id: userId, ...payload }, { onConflict: "user_id" });
  fail(error);
}

export async function dbReplaceSkills(userId: string, skills: Array<{ name: string; category?: string }>) {
  await supabase.from("candidate_skills").delete().eq("user_id", userId);
  if (skills.length === 0) return;
  const { error } = await supabase.from("candidate_skills").insert(
    skills.map((s) => ({
      user_id: userId,
      skill_name: s.name,
      skill_category: s.category ?? "General",
      source: "onboarding",
    })),
  );
  fail(error);
}

export async function dbReplaceRoles(userId: string, roles: string[]) {
  await supabase.from("role_preferences").delete().eq("user_id", userId);
  if (roles.length === 0) return;
  const { error } = await supabase
    .from("role_preferences")
    .insert(roles.map((role) => ({ user_id: userId, role_category: role, enabled: true })));
  fail(error);
}

const notificationColumn: Record<string, string> = {
  "Daily Job Digest": "daily_digest",
  "Apply ASAP Job": "apply_asap_alerts",
  "High Sponsorship Match": "sponsorship_alerts",
  "New Job at Priority Company": "priority_company_alerts",
  "Saved Job Expiring": "saved_job_expiry_alerts",
  "Application Follow-up": "application_followups",
  "Interview Reminder": "interview_reminders",
};

export async function dbToggleNotification(userId: string, category: string, enabled: boolean) {
  const column = notificationColumn[category];
  if (!column) return;
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: userId, [column]: enabled } as never, { onConflict: "user_id" });
  fail(error);
}

export async function dbMarkNotificationsRead(userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  fail(error);
}

export async function dbCompleteOnboarding(userId: string) {
  const { error } = await supabase
    .from("candidate_profiles")
    .upsert({ user_id: userId, onboarding_completed: true }, { onConflict: "user_id" });
  fail(error);
}

/* ------------------------------------------------------------- CV storage */

const allowedCvTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function dbUploadCv(userId: string, file: File, name: string) {
  if (!allowedCvTypes.includes(file.type)) {
    throw new Error("Please upload a PDF or Word (.docx) file.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("That file is larger than 10 MB.");

  const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("cvs").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: existing } = await supabase.from("cv_versions").select("id").eq("user_id", userId);
  const { error } = await supabase.from("cv_versions").insert({
    user_id: userId,
    name,
    storage_path: path,
    is_primary: (existing ?? []).length === 0,
  });
  fail(error);
}

export async function dbRenameCv(userId: string, id: string, name: string) {
  const { error } = await supabase.from("cv_versions").update({ name }).eq("id", id).eq("user_id", userId);
  fail(error);
}

export async function dbSetPrimaryCv(userId: string, id: string) {
  await supabase.from("cv_versions").update({ is_primary: false }).eq("user_id", userId);
  const { error } = await supabase
    .from("cv_versions")
    .update({ is_primary: true })
    .eq("id", id)
    .eq("user_id", userId);
  fail(error);
}

export async function dbDeleteCv(userId: string, id: string, storagePath: string) {
  await supabase.storage.from("cvs").remove([storagePath]);
  const { error } = await supabase.from("cv_versions").delete().eq("id", id).eq("user_id", userId);
  fail(error);
}

/** Short-lived signed URL — CVs are never publicly readable. */
export async function dbCvSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from("cvs").createSignedUrl(storagePath, 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/* ------------------------------------------------- individual skill editing */

/** Add one skill by hand. Marked source "user" so CV re-reads never wipe it. */
export async function dbAddSkill(userId: string, name: string, category: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const { error } = await supabase.from("candidate_skills").insert({
    user_id: userId,
    skill_name: trimmed,
    skill_category: category,
    source: "user",
  });
  fail(error);
}

export async function dbDeleteSkill(userId: string, id: string) {
  const { error } = await supabase.from("candidate_skills").delete().eq("id", id).eq("user_id", userId);
  fail(error);
}

/**
 * Replace the file behind an existing CV version, keeping its name, its
 * primary flag and every application that references it. The old object is
 * removed only after the new one is stored.
 */
export async function dbReplaceCvFile(userId: string, id: string, file: File) {
  if (!allowedCvTypes.includes(file.type)) {
    throw new Error("Please upload a PDF or Word (.docx) file.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("That file is larger than 10 MB.");

  const { data: existing, error: readError } = await supabase
    .from("cv_versions")
    .select("id, storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) throw new Error("That CV could not be found.");

  const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("cvs").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase
    .from("cv_versions")
    .update({
      storage_path: path,
      parsed_text: null,
      parsed_profile_json: null,
      parse_status: "not_parsed",
      parse_error: null,
      parsed_at: null,
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    await supabase.storage.from("cvs").remove([path]);
    throw new Error(error.message);
  }
  await supabase.storage.from("cvs").remove([existing["storage_path"] as string]);
}

/** Upload a CV and return its new row id, so it can be read straight away. */
export async function dbUploadCvReturningId(userId: string, file: File, name: string) {
  if (!allowedCvTypes.includes(file.type)) {
    throw new Error("Please upload a PDF or Word (.docx) file.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("That file is larger than 10 MB.");

  const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("cvs").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: existing } = await supabase.from("cv_versions").select("id").eq("user_id", userId);
  const { data, error } = await supabase
    .from("cv_versions")
    .insert({
      user_id: userId,
      name,
      storage_path: path,
      is_primary: (existing ?? []).length === 0,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from("cvs").remove([path]);
    throw new Error(error.message);
  }
  return data.id as string;
}

/** Which seniority bands the radar accepts. Stored as flags on the prefs row. */
export async function dbUpdateSeniority(userId: string, levels: string[]) {
  const { error } = await supabase.from("search_preferences").upsert(
    {
      user_id: userId,
      include_graduate: levels.includes("Graduate"),
      include_junior: levels.includes("Junior"),
      include_associate: levels.includes("Associate"),
      include_midlevel: levels.includes("Mid"),
    },
    { onConflict: "user_id" },
  );
  fail(error);
}
