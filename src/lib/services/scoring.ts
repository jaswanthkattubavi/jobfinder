import { requiresUkCitizenship, classifyClearance } from "./screening.ts";
import type {
  CandidateProfile,
  Job,
  MatchAnalysis,
  ScoringWeights,
  SearchPreferences,
} from "../types";

// Scoring service. Deterministic, testable, and free of UI concerns so the real
// AI-backed implementation can replace the internals without touching pages.

export type Priority = "Apply ASAP" | "Strong Match" | "Review" | "Low Priority" | "Hidden";

export function classifyOpportunity(score: number): Priority {
  // Kept in step with tierFor() in the server engine.
  if (score >= 80) return "Apply ASAP";
  if (score >= 70) return "Strong Match";
  if (score >= 60) return "Review";
  if (score >= 50) return "Low Priority";
  return "Hidden";
}

const sponsorshipWeight: Record<Job["sponsorship"]["status"], number> = {
  Confirmed: 100,
  Likely: 84,
  Possible: 62,
  Unclear: 42,
  Unlikely: 18,
  "No Sponsorship": 0,
};

export function calculateMatchScore(match: MatchAnalysis): number {
  const parts = [
    { value: match.skills, weight: 0.35 },
    { value: match.experience, weight: 0.25 },
    { value: match.seniority, weight: 0.15 },
    { value: match.education, weight: 0.1 },
    { value: match.domain, weight: 0.15 },
  ];
  return Math.round(parts.reduce((sum, p) => sum + p.value * p.weight, 0));
}

interface OpportunityInput {
  job: Job;
  profile: CandidateProfile;
  weights: ScoringWeights;
  companyPriority: "High" | "Medium" | "Normal";
}

export function calculateOpportunityScore({
  job,
  profile,
  weights,
  companyPriority,
}: OpportunityInput): number {
  const daysOld = Math.max(
    0,
    Math.round((Date.now() - new Date(job.datePosted).getTime()) / 86_400_000),
  );

  const locationFit = profile.preferredLocations.some(
    (l) =>
      job.city.toLowerCase().includes(l.toLowerCase().replace(" uk", "")) ||
      job.remote === "Remote",
  )
    ? 100
    : 55;

  const seniorityFit = profile.preferredSeniority.includes(job.seniority) ? 100 : 45;
  const recency = Math.max(0, 100 - daysOld * 10);
  const salaryFit =
    job.salaryMax === undefined ? 60 : job.salaryMax >= profile.salaryExpectation.min ? 100 : 50;
  const priorityFit = companyPriority === "High" ? 100 : companyPriority === "Medium" ? 75 : 55;
  const linkFactor =
    job.linkStatus === "Live" ? 1 : job.linkStatus === "Possibly Live" ? 0.97 : 0.9;

  const total =
    (job.match.overall * weights.cvMatch +
      sponsorshipWeight[job.sponsorship.status] * weights.sponsorshipFit +
      seniorityFit * weights.seniorityFit +
      locationFit * weights.locationFit +
      recency * weights.recency +
      priorityFit * weights.companyPriority +
      salaryFit * weights.salaryFit) /
    Object.values(weights).reduce((a, b) => a + b, 0);

  return Math.round(Math.min(100, total * linkFactor));
}

export interface FilterResult {
  passed: boolean;
  reasons: string[];
}

/** Cheap rule-based filtering that runs before any expensive AI analysis. */
export function filterJob(job: Job, prefs: SearchPreferences): FilterResult {
  const reasons: string[] = [];
  const text = `${job.title} ${job.description} ${job.requiredSkills.join(" ")}`.toLowerCase();

  if (job.country !== "United Kingdom") reasons.push("Outside the United Kingdom");
  if (prefs.rejectCitizenshipRequired && requiresUkCitizenship(text))
    reasons.push("Requires UK citizenship");
  if (prefs.rejectSecurityClearance && classifyClearance(text).status === "required")
    reasons.push("Requires security clearance");
  if (prefs.excludedTitles.some((t) => job.title.toLowerCase().includes(t.toLowerCase())))
    reasons.push("Title excluded in your settings");
  if (prefs.excludedIndustries.includes(job.industry)) reasons.push("Industry excluded");
  if (prefs.excludedCompanies.includes(job.companyId)) reasons.push("Company excluded");
  if (!job.active) reasons.push("Vacancy no longer active");
  if (job.salaryMax !== undefined && job.salaryMax < prefs.salaryMin)
    reasons.push("Below your salary floor");
  if (job.sponsorship.confidence < prefs.minSponsorshipConfidence)
    reasons.push("Sponsorship confidence below threshold");
  if (job.match.overall < prefs.minMatchScore) reasons.push("CV match below threshold");

  return { passed: reasons.length === 0, reasons };
}

export function isFresh(job: Job, days: number): boolean {
  return Date.now() - new Date(job.datePosted).getTime() <= days * 86_400_000;
}
