/**
 * Server-side match + opportunity scoring against stored jobs.
 *
 * Shared by the discovery scan and by background recalculation after a profile
 * change, so a profile edit never needs to re-fetch a single job.
 *
 * Every number here is deterministic. The AI layer only supplies facts taken
 * from the advert (skills, duties, stated experience); the weighting, the
 * penalties and the tier are computed in the pure engine.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateMatchScore,
  calculateOpportunityScore,
  defaultEngineWeights,
  type DbSponsorshipStatus,
  type EngineCandidate,
  type EngineJob,
  type EngineWeights,
} from "./engine";
import { adjustmentFor, aggregateSignals, type LearnedSignal, type LearningSignalKind } from "./learning";

type Db = SupabaseClient<any, "public", any>;

export interface ScoreOutcome {
  scored: number;
  strongMatches: number;
  applyAsap: number;
  realScored: number;
  notified: number;
  analysedCovered: number;
}

const CITIZENSHIP = /\b(must be a (uk|british) citizen|uk citizenship (is )?required|sole uk national)\b/i;
const CLEARANCE = /\b(security clearance|sc clearance|dv clearance|developed vetting)\b/i;
const LICENCE = /\b(must (hold|have) a (valid )?(professional )?licence|chartered status required)\b/i;

function mandatoryBlockers(description: string, requiredYears: string | null, candidateYears: number): string[] {
  const out: string[] = [];
  if (CITIZENSHIP.test(description)) out.push("UK citizenship required");
  if (CLEARANCE.test(description)) out.push("Security clearance required");
  if (LICENCE.test(description)) out.push("Professional licence required");
  const years = requiredYears ? Number(/\d+/.exec(requiredYears)?.[0] ?? 0) : 0;
  if (years > 0 && years - candidateYears >= 4) out.push(`Asks for ${years}+ years of experience`);
  return out;
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** Rebuilds the learned-behaviour signals from the user's own actions. */
export async function refreshLearnedPreferences(db: Db, userId: string): Promise<LearnedSignal[]> {
  const [feedbackRes, savedRes, appsRes, jobsRes, companiesRes] = await Promise.all([
    db.from("user_feedback").select("job_id, reason").eq("user_id", userId),
    db.from("saved_jobs").select("job_id").eq("user_id", userId),
    db.from("applications").select("job_id").eq("user_id", userId),
    db.from("jobs").select("id, company_id, role_category, seniority, remote_type, city"),
    db.from("companies").select("id, name"),
  ]);

  const jobs = new Map(
    ((jobsRes.data ?? []) as Array<Record<string, unknown>>).map((j) => [j["id"] as string, j]),
  );
  const companyName = new Map(
    ((companiesRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );

  const events: Array<{ kind: LearningSignalKind; value: string; positive: boolean }> = [];
  const push = (jobId: string, positive: boolean) => {
    const job = jobs.get(jobId);
    if (!job) return;
    const pairs: Array<[LearningSignalKind, string | null]> = [
      ["role_category", (job["role_category"] as string) ?? null],
      ["company", companyName.get(job["company_id"] as string) ?? null],
      ["seniority", (job["seniority"] as string) ?? null],
      ["remote_type", (job["remote_type"] as string) ?? null],
      ["city", (job["city"] as string) ?? null],
    ];
    for (const [kind, value] of pairs) if (value) events.push({ kind, value, positive });
  };

  for (const row of (savedRes.data ?? []) as Array<{ job_id: string }>) push(row.job_id, true);
  for (const row of (appsRes.data ?? []) as Array<{ job_id: string }>) push(row.job_id, true);
  for (const row of (feedbackRes.data ?? []) as Array<{ job_id: string; reason: string }>) {
    push(row.job_id, row.reason === "interested");
  }

  const signals = aggregateSignals(events);
  if (signals.length > 0) {
    await db.from("learned_preferences").upsert(
      signals.map((s) => ({
        user_id: userId,
        signal_kind: s.kind,
        signal_value: s.value,
        positive_count: s.positiveCount,
        negative_count: s.negativeCount,
        adjustment: s.adjustment,
        updated_at: new Date().toISOString(),
      })) as never,
      { onConflict: "user_id,signal_kind,signal_value" },
    );
  }
  return signals;
}

export async function scoreUserMatches(db: Db, userId: string): Promise<ScoreOutcome> {
  const learned = await refreshLearnedPreferences(db, userId).catch(() => [] as LearnedSignal[]);

  const [
    profileRes,
    skillsRes,
    prefsRes,
    rolesRes,
    jobsRes,
    jobSkillsRes,
    sponsorshipRes,
    watchRes,
    analysisRes,
    companiesRes,
    appliedRes,
  ] = await Promise.all([
    db.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("candidate_skills").select("skill_name").eq("user_id", userId),
    db.from("search_preferences").select("*").eq("user_id", userId).maybeSingle(),
    db.from("role_preferences").select("role_category, target_titles, enabled").eq("user_id", userId),
    db.from("jobs").select("*").eq("is_active", true).order("discovered_at", { ascending: false }).limit(1500),
    db.from("job_skills").select("job_id, skill_name, requirement_type"),
    db.from("job_sponsorship_analysis").select("job_id, status, confidence"),
    db.from("company_watchlist").select("company_id, priority").eq("user_id", userId),
    db
      .from("job_analysis")
      .select(
        "job_id, responsibilities_json, ats_critical_json, technologies_json, leadership_json, education_requirements_json, stated_seniority, years_experience_text, analysis_status",
      ),
    db.from("companies").select("id, name"),
    db.from("applications").select("job_id").eq("user_id", userId),
  ]);

  // A role the user has already applied to stays scored and visible, but it is
  // never presented as something to apply to today.
  const appliedJobIds = new Set(
    ((appliedRes.data ?? []) as Array<{ job_id: string | null }>)
      .map((a) => a.job_id)
      .filter((id): id is string => Boolean(id)),
  );

  const profile = (profileRes.data ?? {}) as Record<string, unknown>;
  const prefs = (prefsRes.data ?? {}) as Record<string, unknown>;
  const jobs = (jobsRes.data ?? []) as Array<Record<string, unknown>>;
  const jobSkills = (jobSkillsRes.data ?? []) as Array<Record<string, unknown>>;
  const sponsorship = (sponsorshipRes.data ?? []) as Array<Record<string, unknown>>;
  const watch = (watchRes.data ?? []) as Array<Record<string, unknown>>;
  const roles = (rolesRes.data ?? []) as Array<{ role_category: string; target_titles: string[]; enabled: boolean }>;
  const analyses = (analysisRes.data ?? []) as Array<Record<string, unknown>>;
  const companyNames = new Map(
    ((companiesRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );

  const allowedSeniority: string[] = [];
  if (prefs["include_graduate"] !== false) allowedSeniority.push("Graduate");
  if (prefs["include_junior"] !== false) allowedSeniority.push("Junior");
  if (prefs["include_associate"] !== false) allowedSeniority.push("Associate");
  if (prefs["include_midlevel"] !== false) allowedSeniority.push("Mid");

  const candidateYears = Number(profile["years_experience"] ?? 0);
  const candidate: EngineCandidate = {
    skills: ((skillsRes.data ?? []) as Array<{ skill_name: string }>).map((s) => s.skill_name),
    yearsExperience: candidateYears,
    education: (profile["education"] as string) ?? null,
    allowedSeniority,
    preferredLocations: (prefs["preferred_locations"] as string[]) ?? [],
    preferredIndustries: (prefs["preferred_industries"] as string[]) ?? [],
    targetTitles: [
      ...(((prefs["target_titles"] as string[]) ?? [])),
      ...roles.filter((r) => r.enabled).flatMap((r) => r.target_titles ?? []),
    ],
    minimumSalary: Number(prefs["minimum_salary"] ?? 0),
    remotePreferences: (prefs["remote_preferences"] as string[]) ?? [],
    targetCategories: roles.filter((r) => r.enabled).map((r) => r.role_category),
    requiresSponsorship:
      profile["sponsorship_required_now"] === true || profile["sponsorship_required_later"] === true,
  };

  const weights: EngineWeights = {
    ...defaultEngineWeights,
    ...((prefs["scoring_weights"] as Partial<EngineWeights> | undefined) ?? {}),
  };

  const sponsorshipByJob = new Map(
    sponsorship.map((s) => [
      s["job_id"] as string,
      {
        status: (s["status"] as DbSponsorshipStatus) ?? "unclear",
        confidence: Number(s["confidence"] ?? 0),
      },
    ]),
  );
  const analysisByJob = new Map(analyses.map((a) => [a["job_id"] as string, a]));
  const priorityByCompany = new Map(
    watch.map((w) => [w["company_id"] as string, (w["priority"] as string) ?? "normal"]),
  );
  const skillsFor = (jobId: string, kind: string) =>
    jobSkills.filter((s) => s["job_id"] === jobId && s["requirement_type"] === kind).map((s) => s["skill_name"] as string);

  const rows: Array<Record<string, unknown>> = [];
  const applyAsapJobs: Array<{ id: string; title: string; score: number; isDemo: boolean; company: string }> = [];
  let strongMatches = 0;
  let realScored = 0;
  let analysedCovered = 0;

  for (const job of jobs) {
    const id = job["id"] as string;
    const spons = sponsorshipByJob.get(id) ?? { status: "unclear" as DbSponsorshipStatus, confidence: 0 };
    const description = (job["description"] as string) ?? "";
    const analysis = analysisByJob.get(id);
    const analysed = Boolean(analysis) && analysis?.["analysis_status"] === "completed";
    if (analysed) analysedCovered += 1;
    const requiredYears =
      (analysis?.["years_experience_text"] as string) ?? (job["required_experience_years"] as string) ?? null;

    const engineJob: EngineJob = {
      id,
      title: job["title"] as string,
      city: (job["city"] as string) ?? null,
      seniority: (job["seniority"] as string) ?? null,
      industry: (job["industry"] as string) ?? null,
      roleCategory: (job["role_category"] as string) ?? null,
      remoteType: (job["remote_type"] as string) ?? "On-site",
      salaryMin: (job["salary_min"] as number) ?? null,
      salaryMax: (job["salary_max"] as number) ?? null,
      postedAt: (job["posted_at"] as string) ?? null,
      discoveredAt: (job["discovered_at"] as string) ?? null,
      requiredExperienceYears: requiredYears,
      requiredSkills: skillsFor(id, "required"),
      preferredSkills: skillsFor(id, "preferred"),
      description,
      liveStatus: (job["live_status"] as string) ?? "unknown",
      sponsorshipStatus: spons.status,
      sponsorshipConfidence: spons.confidence,
      eligibilityStatus: (job["eligibility_status"] as EngineJob["eligibilityStatus"]) ?? "review",
      mandatoryBlockers: mandatoryBlockers(description, requiredYears, candidateYears),
      citizenshipRequired: CITIZENSHIP.test(description),
      securityRestriction: CLEARANCE.test(description),
      responsibilities: asStrings(analysis?.["responsibilities_json"]).length
        ? asStrings(analysis?.["responsibilities_json"])
        : ((job["responsibilities"] as string[]) ?? []),
      atsCritical: asStrings(analysis?.["ats_critical_json"]),
      technologies: asStrings(analysis?.["technologies_json"]),
      leadershipExpectations: asStrings(analysis?.["leadership_json"]),
      educationRequirement:
        asStrings(analysis?.["education_requirements_json"])[0] ??
        ((job["education_requirement"] as string) ?? null),
      statedSeniority: (analysis?.["stated_seniority"] as string) ?? null,
      analysed,
    };

    const priority = priorityByCompany.get(job["company_id"] as string);
    const match = calculateMatchScore(candidate, engineJob);
    const learnedAdjustment = adjustmentFor(learned, {
      roleCategory: engineJob.roleCategory,
      companyName: companyNames.get(job["company_id"] as string) ?? null,
      seniority: engineJob.seniority,
      remoteType: engineJob.remoteType,
      city: engineJob.city,
    });
    const opportunity = calculateOpportunityScore(
      candidate,
      engineJob,
      match,
      weights,
      priority === "high" ? "high" : priority === "medium" ? "medium" : "normal",
      learnedAdjustment,
    );

    if (appliedJobIds.has(id) && opportunity.tier === "apply_asap") {
      opportunity.tier = "strong_match";
      opportunity.reasons = [...opportunity.reasons, "You have already applied to this role"];
    }

    const isDemo = job["is_demo"] === true;
    if (!isDemo) realScored += 1;
    if (opportunity.tier === "strong_match" || opportunity.tier === "apply_asap") strongMatches += 1;
    if (opportunity.tier === "apply_asap")
      applyAsapJobs.push({
        id,
        title: job["title"] as string,
        score: opportunity.opportunityScore,
        isDemo,
        company: companyNames.get(job["company_id"] as string) ?? "an employer",
      });

    rows.push({
      user_id: userId,
      job_id: id,
      cv_match_score: match.cvMatchScore,
      opportunity_score: opportunity.opportunityScore,
      skills_score: match.skillsScore,
      required_skills_score: match.requiredSkillsScore,
      preferred_skills_score: match.preferredSkillsScore,
      responsibilities_score: match.responsibilitiesScore,
      keyword_score: match.keywordScore,
      experience_score: match.experienceScore,
      education_score: match.educationScore,
      seniority_score: match.seniorityScore,
      domain_score: match.domainScore,
      sponsorship_fit_score: opportunity.sponsorshipFit,
      location_fit_score: opportunity.locationFit,
      salary_fit_score: opportunity.salaryFit,
      recency_score: opportunity.recency,
      company_priority_score: opportunity.companyPriority,
      work_style_score: opportunity.workStyleFit,
      link_verification_score: opportunity.linkVerification,
      learned_adjustment: opportunity.learnedAdjustment,
      matched_skills_json: match.matchedSkills,
      missing_skills_json: match.missingSkills,
      partial_skills_json: match.partialSkills,
      strengths_json: match.strengths,
      risks_json: match.risks,
      why_recommended_json: opportunity.reasons,
      gaps_summary: match.gapsSummary,
      explanation: match.explanation,
      recommendation_tier: opportunity.tier,
      calculated_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("job_matches")
      .upsert(rows.slice(i, i + 500) as never, { onConflict: "user_id,job_id" });
    if (error) throw new Error(error.message);
  }

  // Notify only about genuinely new top roles, never twice for the same job.
  let notified = 0;
  const realApplyAsap = applyAsapJobs.filter((j) => !j.isDemo);
  if (realApplyAsap.length > 0) {
    const { data: existing } = await db
      .from("notifications")
      .select("job_id")
      .eq("user_id", userId)
      .eq("type", "apply_asap");
    const already = new Set(((existing ?? []) as Array<{ job_id: string | null }>).map((n) => n.job_id));
    const fresh = realApplyAsap.filter((j) => !already.has(j.id)).slice(0, 8);
    if (fresh.length > 0) {
      await db.from("notifications").insert(
        fresh.map((j) => ({
          user_id: userId,
          type: "apply_asap",
          title: `Apply ASAP — ${j.title}`,
          message: `${j.company} · scored ${j.score}/100 against your CV and preferences.`,
          job_id: j.id,
        })) as never,
      );
      notified = fresh.length;
    }
  }

  return {
    scored: rows.length,
    strongMatches,
    applyAsap: applyAsapJobs.length,
    realScored,
    notified,
    analysedCovered,
  };
}
