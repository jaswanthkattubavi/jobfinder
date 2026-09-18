/**
 * Structured analysis of stored vacancies.
 *
 * Runs after filtering, so money is never spent reasoning about a role the
 * user's own rules already excluded. Reuses a previous analysis whenever the
 * description has not changed (description hash), records failures instead of
 * storing partial output, and is bounded per run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyseJobDescription,
  aiAnalysisAvailable,
  AnalysisError,
  ANALYSIS_VERSION,
  type JobAnalysis,
} from "./ai-analysis.server";

type Db = SupabaseClient<any, "public", any>;

export interface AnalysisOutcome {
  analysed: number;
  reused: number;
  failures: number;
  skipped: number;
  pending: number;
  available: boolean;
}

const MIN_DESCRIPTION = 200;

function analysisRow(jobId: string, hash: string | null, a: JobAnalysis) {
  return {
    job_id: jobId,
    description_hash: hash,
    required_skills_json: a.requiredSkills,
    preferred_skills_json: a.preferredSkills,
    technologies_json: a.technologies,
    programming_languages_json: a.programmingLanguages,
    frameworks_json: a.frameworks,
    cloud_platforms_json: a.cloudPlatforms,
    databases_json: a.databases,
    devops_json: a.devopsTools,
    ml_ai_json: a.mlTools,
    data_tools_json: a.dataTools,
    responsibilities_json: a.responsibilities,
    leadership_json: a.leadershipExpectations,
    education_requirements_json: a.education ? [a.education] : [],
    domain_requirements_json: a.domains,
    keywords_json: [...a.atsCritical, ...a.atsUseful],
    ats_critical_json: a.atsCritical,
    ats_useful_json: a.atsUseful,
    ats_optional_json: a.atsOptional,
    security_requirements_json: a.securityRequirements,
    visa_language_json: a.visaLanguage,
    citizenship_requirements_json: a.citizenshipRequirements,
    sponsorship_wording_json: a.visaLanguage,
    years_experience_text: a.yearsExperience,
    stated_seniority: a.seniority,
    industry_domain: a.industryDomain,
    analysis_version: ANALYSIS_VERSION,
    analysis_status: "completed",
    analysis_error: null,
    analysed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function storeAnalysis(db: Db, jobId: string, hash: string | null, a: JobAnalysis) {
  await db.from("job_analysis").upsert(analysisRow(jobId, hash, a) as never, { onConflict: "job_id" });

  const skillRows = [
    ...a.requiredSkills.map((s) => ({ skill_name: s, requirement_type: "required" })),
    ...a.preferredSkills.map((s) => ({ skill_name: s, requirement_type: "preferred" })),
  ].map((s) => ({ job_id: jobId, ...s }));
  if (skillRows.length > 0) {
    await db.from("job_skills").upsert(skillRows as never, { onConflict: "job_id,skill_name,requirement_type" });
  }

  await db
    .from("jobs")
    .update({
      required_experience_years: a.yearsExperience,
      education_requirement: a.education,
      responsibilities: a.responsibilities.slice(0, 12),
      analysis_error: null,
    } as never)
    .eq("id", jobId);
}

/**
 * Analyses stored jobs that still need it.
 *
 * @param limit hard cap on AI calls for this run (cost control).
 */
export async function analyseStoredJobs(db: Db, limit: number): Promise<AnalysisOutcome> {
  const outcome: AnalysisOutcome = {
    analysed: 0,
    reused: 0,
    failures: 0,
    skipped: 0,
    pending: 0,
    available: aiAnalysisAvailable(),
  };

  // Everything retained and live, newest first. Ineligible roles are never
  // stored, so this set is exactly the vacancies the user may act on.
  const { data: jobRows } = await db
    .from("jobs")
    .select("id, title, description, description_hash, company_id, eligibility_status, is_demo")
    .eq("is_demo", false)
    .eq("is_active", true)
    .neq("eligibility_status", "ineligible")
    .order("discovered_at", { ascending: false })
    .limit(400);
  const jobs = (jobRows ?? []) as Array<Record<string, unknown>>;
  if (jobs.length === 0) return outcome;

  const { data: existingRows } = await db
    .from("job_analysis")
    .select("job_id, description_hash, analysis_version, analysis_status");
  const existing = new Map(
    ((existingRows ?? []) as Array<Record<string, unknown>>).map((r) => [r["job_id"] as string, r]),
  );

  // A hash we have already analysed for another vacancy can be reused verbatim.
  const { data: byHashRows } = await db
    .from("job_analysis")
    .select("*")
    .eq("analysis_status", "completed")
    .eq("analysis_version", ANALYSIS_VERSION)
    .not("description_hash", "is", null)
    .limit(600);
  const byHash = new Map<string, Record<string, unknown>>();
  for (const row of (byHashRows ?? []) as Array<Record<string, unknown>>) {
    byHash.set(row["description_hash"] as string, row);
  }

  const { data: companyRows } = await db.from("companies").select("id, name");
  const companyName = new Map(
    ((companyRows ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );

  let calls = 0;
  for (const job of jobs) {
    const jobId = job["id"] as string;
    const hash = (job["description_hash"] as string) ?? null;
    const description = (job["description"] as string) ?? "";
    const prior = existing.get(jobId);

    const upToDate =
      prior &&
      prior["analysis_status"] === "completed" &&
      prior["analysis_version"] === ANALYSIS_VERSION &&
      (prior["description_hash"] === hash || !hash);
    if (upToDate) continue;

    if (description.length < MIN_DESCRIPTION) {
      outcome.skipped += 1;
      await db.from("job_analysis").upsert(
        {
          job_id: jobId,
          description_hash: hash,
          analysis_version: ANALYSIS_VERSION,
          analysis_status: "skipped",
          analysis_error: "The source published too little description text to analyse.",
          analysed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "job_id" },
      );
      continue;
    }

    // Identical description already analysed elsewhere — copy, don't pay again.
    const reusable = hash ? byHash.get(hash) : undefined;
    if (reusable && (reusable["job_id"] as string) !== jobId) {
      const copy = { ...reusable } as Record<string, unknown>;
      delete copy["id"];
      copy["job_id"] = jobId;
      copy["updated_at"] = new Date().toISOString();
      await db.from("job_analysis").upsert(copy as never, { onConflict: "job_id" });
      outcome.reused += 1;
      continue;
    }

    if (!outcome.available || calls >= limit) {
      outcome.pending += 1;
      continue;
    }

    calls += 1;
    try {
      const analysis = await analyseJobDescription({
        title: job["title"] as string,
        companyName: companyName.get(job["company_id"] as string) ?? "Unknown",
        description,
      });
      await storeAnalysis(db, jobId, hash, analysis);
      if (hash) {
        const { data: stored } = await db.from("job_analysis").select("*").eq("job_id", jobId).maybeSingle();
        if (stored) byHash.set(hash, stored as Record<string, unknown>);
      }
      outcome.analysed += 1;
    } catch (err) {
      outcome.failures += 1;
      const message = err instanceof AnalysisError ? err.message : (err as Error).message;
      await db.from("job_analysis").upsert(
        {
          job_id: jobId,
          description_hash: hash,
          analysis_version: ANALYSIS_VERSION,
          analysis_status: "failed",
          analysis_error: message.slice(0, 400),
          analysed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "job_id" },
      );
      await db
        .from("jobs")
        .update({ analysis_error: message.slice(0, 400) } as never)
        .eq("id", jobId);
    }
  }

  return outcome;
}
