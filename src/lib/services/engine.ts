import {
  requiresUkCitizenship,
  classifyClearance,
  classifySponsorship,
  containsSkill,
} from "./screening.ts";
/**
 * Pure scoring / analysis engine. No Supabase, no UI, no I/O.
 *
 * Deterministic by design: the AI layer only ever supplies *facts extracted
 * from the advert* (skills, responsibilities, stated experience). Every number
 * below is computed here from those facts plus the candidate's own profile, so
 * a score can always be explained and reproduced.
 */

export type DbSponsorshipStatus =
  "confirmed" | "likely" | "possible" | "unclear" | "unlikely" | "no_sponsorship";

export type RecommendationTier =
  "apply_asap" | "strong_match" | "review" | "low_priority" | "hidden";

export interface EngineCandidate {
  skills: string[];
  yearsExperience: number;
  education: string | null;
  allowedSeniority: string[];
  preferredLocations: string[];
  preferredIndustries: string[];
  targetTitles: string[];
  minimumSalary: number;
  remotePreferences: string[];
  /** Role families the user follows, used for domain fit. */
  targetCategories?: string[];
  /** True when the user needs visa sponsorship now or in the future. */
  requiresSponsorship?: boolean;
}

export interface EngineJob {
  id: string;
  title: string;
  city: string | null;
  seniority: string | null;
  industry: string | null;
  roleCategory: string | null;
  remoteType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  /** null when the source does not publish a posting date. */
  postedAt: string | null;
  /** Used for recency only when posted_at is unknown. */
  discoveredAt?: string | null;
  requiredExperienceYears: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  description: string;
  liveStatus: string;
  sponsorshipStatus: DbSponsorshipStatus;
  sponsorshipConfidence: number;
  /** Rule-based eligibility outcome; restrictions override preference boosts. */
  eligibilityStatus?: "eligible" | "likely_eligible" | "review" | "ineligible";
  /** Hard blockers found in the posting (citizenship, clearance, licence, experience gap). */
  mandatoryBlockers?: string[];
  /** Vacancy demands British/UK citizenship. */
  citizenshipRequired?: boolean;
  /** Vacancy demands security clearance or vetting. */
  securityRestriction?: boolean;
  /* ---- facts from structured analysis; empty when not analysed yet ---- */
  responsibilities?: string[];
  atsCritical?: string[];
  technologies?: string[];
  educationRequirement?: string | null;
  statedSeniority?: string | null;
  leadershipExpectations?: string[];
  analysed?: boolean;
}

export interface EngineWeights {
  cvMatch: number;
  sponsorshipFit: number;
  seniorityFit: number;
  locationFit: number;
  recency: number;
  companyPriority: number;
  salaryFit: number;
  workStyleFit: number;
  linkVerification: number;
}

export const defaultEngineWeights: EngineWeights = {
  cvMatch: 40,
  sponsorshipFit: 20,
  seniorityFit: 10,
  locationFit: 8,
  recency: 8,
  companyPriority: 4,
  salaryFit: 4,
  workStyleFit: 3,
  linkVerification: 3,
};

const clamp = (n: number, min = 0) => Math.max(min, Math.min(100, Math.round(n)));
const norm = (s: string) => s.trim().toLowerCase();

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|inc|llc|gmbh|group|uk)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Loose skill comparison so "AWS Lambda" still credits "AWS". */
function skillHit(candidateSkills: string[], skill: string): "full" | "partial" | "none" {
  const target = norm(skill);
  if (!target) return "none";
  if (candidateSkills.some((own) => norm(own) === target)) return "full";
  for (const raw of candidateSkills) {
    const own = norm(raw);
    if (!own) continue;
    if (own === target) return "full";
    if (own.length >= 3 && (containsSkill(own, target) || containsSkill(target, own)))
      return "partial";
  }
  return "none";
}

/* ------------------------------------------------------------- seniority */

const LEVEL_ORDER = [
  "Internship",
  "Graduate",
  "Junior",
  "Associate",
  "Mid",
  "Senior",
  "Lead",
  "Principal",
  "Staff",
  "Manager",
  "Director",
] as const;

const LEVEL_INDEX: Record<string, number> = {
  internship: 0,
  intern: 0,
  placement: 0,
  graduate: 1,
  grad: 1,
  trainee: 1,
  apprentice: 1,
  entry: 1,
  junior: 2,
  associate: 3,
  mid: 4,
  midlevel: 4,
  intermediate: 4,
  senior: 5,
  lead: 6,
  principal: 7,
  staff: 7,
  manager: 8,
  head: 9,
  director: 9,
  vp: 10,
  chief: 10,
};

/** Maps any stated level wording to a comparable rung. Unknown stays null. */
export function levelIndexOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const v = norm(value).replace(/[^a-z ]/g, " ");
  for (const key of Object.keys(LEVEL_INDEX).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${key}\\b`).test(v)) return LEVEL_INDEX[key]!;
  }
  return null;
}

export { LEVEL_ORDER };

/* ---------------------------------------------------------------- match */

export interface MatchResult {
  cvMatchScore: number;
  /** Legacy blended skills score, kept so existing views keep working. */
  skillsScore: number;
  requiredSkillsScore: number;
  preferredSkillsScore: number;
  experienceScore: number;
  educationScore: number;
  seniorityScore: number;
  domainScore: number;
  responsibilitiesScore: number;
  keywordScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  partialSkills: string[];
  strengths: string[];
  risks: string[];
  whyRecommended: string[];
  gapsSummary: string;
  explanation: string;
}

interface SkillOutcome {
  score: number;
  matched: string[];
  partial: string[];
  missing: string[];
  /** null when the advert lists nothing, so the component stays "unknown". */
  known: boolean;
}

function scoreSkillSet(candidateSkills: string[], skills: string[]): SkillOutcome {
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  if (skills.length === 0) return { score: 65, matched, partial, missing, known: false };
  let earned = 0;
  for (const skill of skills) {
    const hit = skillHit(candidateSkills, skill);
    if (hit === "full") {
      earned += 1;
      matched.push(skill);
    } else if (hit === "partial") {
      earned += 0.6;
      partial.push(skill);
    } else {
      missing.push(skill);
    }
  }
  return { score: clamp((earned / skills.length) * 100), matched, partial, missing, known: true };
}

/** Parses the smallest number of years the advert actually asks for. */
export function requiredYears(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\d+/g);
  if (!m || m.length === 0) return null;
  return Math.min(...m.map(Number).filter((n) => n >= 0 && n <= 30));
}

function experienceComponent(candidateYears: number, needed: number | null) {
  if (needed === null) return { score: 70, note: "Advert does not state a number of years" };
  const gap = needed - candidateYears;
  if (gap <= 0) return { score: 100, note: `Meets the stated ${needed}+ years` };
  if (gap <= 1) return { score: 82, note: `About a year short of the stated ${needed} years` };
  if (gap <= 2) return { score: 62, note: `${gap} years short of the stated ${needed} years` };
  if (gap <= 3) return { score: 38, note: `${gap} years short of the stated ${needed} years` };
  return { score: 12, note: `Asks for ${needed} years, well above your ${candidateYears}` };
}

const DEGREE_LEVEL: Array<[RegExp, number]> = [
  [/\bphd|doctorate\b/i, 4],
  [/\bmsc|master|mphil|meng\b/i, 3],
  [/\bbsc|bachelor|beng|degree\b/i, 2],
  [/\ba[- ]?level|hnd|diploma|btec\b/i, 1],
];

function degreeLevel(text: string | null | undefined): number | null {
  if (!text) return null;
  for (const [re, level] of DEGREE_LEVEL) if (re.test(text)) return level;
  return null;
}

function seniorityComponent(candidate: EngineCandidate, job: EngineJob) {
  const allowed = candidate.allowedSeniority
    .map((s) => levelIndexOf(s))
    .filter((n): n is number => n !== null);
  const jobLevel = levelIndexOf(job.statedSeniority ?? job.seniority) ?? levelIndexOf(job.title);
  if (jobLevel === null || allowed.length === 0) {
    return { score: 65, note: "Advert does not state a clear level" };
  }
  const highest = Math.max(...allowed);
  const lowest = Math.min(...allowed);
  if (jobLevel >= lowest && jobLevel <= highest)
    return { score: 100, note: "Level matches what you target" };
  const distance = jobLevel > highest ? jobLevel - highest : lowest - jobLevel;
  if (jobLevel > highest) {
    // Too senior is penalised much harder than too junior.
    return {
      score: distance === 1 ? 55 : distance === 2 ? 25 : 8,
      note: `Level sits ${distance} rung${distance === 1 ? "" : "s"} above the levels you accept`,
    };
  }
  return {
    score: distance === 1 ? 80 : 60,
    note: "Level sits below the levels you target",
  };
}

/**
 * calculateMatchScore — CV vs job fit.
 *
 * Required skills 30, experience 20, seniority 15, responsibilities 10,
 * preferred skills 10, education 5, domain 5, advert keywords 5.
 */
export function calculateMatchScore(candidate: EngineCandidate, job: EngineJob): MatchResult {
  const required = scoreSkillSet(candidate.skills, job.requiredSkills);
  const preferred = scoreSkillSet(candidate.skills, job.preferredSkills);

  const experience = experienceComponent(
    candidate.yearsExperience,
    requiredYears(job.requiredExperienceYears),
  );
  const seniority = seniorityComponent(candidate, job);

  // Responsibilities and advert keywords are weak, text-matching signals: an
  // advert can describe work the candidate can do in words their CV never uses.
  // They are scored on a floored range so a wording mismatch nudges the result
  // instead of wiping out an otherwise good fit.
  const responsibilities = job.responsibilities ?? [];
  const responsibilitiesScore = responsibilities.length
    ? clamp(
        40 +
          (responsibilities.filter((r) =>
            candidate.skills.some((s) => norm(s).length > 2 && containsSkill(r, s)),
          ).length /
            responsibilities.length) *
            60,
      )
    : 65;

  const atsCritical = job.atsCritical ?? [];
  const keywordScore = atsCritical.length
    ? clamp(
        40 +
          (atsCritical.filter((k) => skillHit(candidate.skills, k) !== "none").length /
            atsCritical.length) *
            60,
      )
    : 65;

  const jobDegree = degreeLevel(job.educationRequirement);
  const ownDegree = degreeLevel(candidate.education);
  const educationScore =
    jobDegree === null
      ? 70
      : ownDegree === null
        ? 55
        : ownDegree >= jobDegree
          ? 100
          : jobDegree - ownDegree === 1
            ? 65
            : 35;

  const titleHit = candidate.targetTitles.some(
    (t) =>
      norm(t).length > 3 &&
      (norm(job.title).includes(norm(t)) || norm(t).includes(norm(job.title))),
  );
  const categoryHit = job.roleCategory
    ? (candidate.targetCategories ?? []).includes(job.roleCategory)
    : false;
  const industryHit = job.industry
    ? candidate.preferredIndustries.some(
        (i) => norm(i).length > 2 && norm(job.industry!).includes(norm(i)),
      )
    : false;
  const domainScore =
    categoryHit && (titleHit || industryHit)
      ? 100
      : categoryHit
        ? 85
        : titleHit
          ? 75
          : industryHit
            ? 65
            : 45;

  let cvMatchScore = clamp(
    required.score * 0.3 +
      experience.score * 0.2 +
      seniority.score * 0.15 +
      responsibilitiesScore * 0.1 +
      preferred.score * 0.1 +
      educationScore * 0.05 +
      domainScore * 0.05 +
      keywordScore * 0.05,
  );

  // A role whose essential requirements are mostly unmet can never read as a
  // strong CV match, however well the softer components score.
  const criticalGap = required.known && job.requiredSkills.length >= 3 && required.score < 35;
  if (criticalGap) cvMatchScore = Math.min(cvMatchScore, 62);
  if (seniority.score <= 25) cvMatchScore = Math.min(cvMatchScore, 60);

  const strengths: string[] = [];
  if (required.matched.length)
    strengths.push(`Covers the essential ${required.matched.slice(0, 3).join(", ")}`);
  if (preferred.matched.length)
    strengths.push(`Also has the nice-to-have ${preferred.matched.slice(0, 2).join(", ")}`);
  if (seniority.score === 100) strengths.push(seniority.note);
  if (experience.score >= 90) strengths.push(experience.note);
  if (responsibilitiesScore >= 70 && responsibilities.length)
    strengths.push(
      "Advert duties mention skills listed in your profile; work-history evidence still needs review",
    );
  if (strengths.length === 0) strengths.push("No strong evidence-backed strengths identified yet");

  const risks: string[] = [];
  if (required.partial.length)
    risks.push(`Only partial skill evidence for ${required.partial.slice(0, 3).join(", ")}`);
  if (required.missing.length)
    risks.push(`No evidence of ${required.missing.slice(0, 3).join(", ")}`);
  if (seniority.score < 100) risks.push(seniority.note);
  if (experience.score < 80) risks.push(experience.note);
  if ((job.leadershipExpectations ?? []).length)
    risks.push("Advert expects people-management or team ownership");
  if (!job.analysed) risks.push("Full description analysis has not run for this role yet");

  const whyRecommended: string[] = [];
  if (required.score >= 70)
    whyRecommended.push(
      `Essential skill similarity score: ${required.score}/100 (includes partial matches)`,
    );
  if (seniority.score === 100) whyRecommended.push("The level is one you target");
  if (categoryHit && job.roleCategory)
    whyRecommended.push(`${job.roleCategory} is one of your chosen role families`);
  if (job.sponsorshipStatus === "confirmed")
    whyRecommended.push("The advert itself mentions visa sponsorship");
  if (experience.score >= 90) whyRecommended.push("Your experience meets what the advert asks for");

  const gapNotes = [
    required.missing.length
      ? `Essential skills with no profile evidence: ${required.missing.slice(0, 5).join(", ")}.`
      : "",
    required.partial.length
      ? `Partial skill matches needing verification: ${required.partial.slice(0, 5).join(", ")}.`
      : "",
  ].filter(Boolean);
  const gapsSummary = gapNotes.length
    ? gapNotes.join(" ")
    : required.known
      ? "All extracted essential skills match profile skill labels; depth and other requirements still need verification."
      : "The advert does not list its essential skills explicitly; skill fit is unknown.";

  return {
    cvMatchScore,
    skillsScore: clamp(required.score * 0.75 + preferred.score * 0.25),
    requiredSkillsScore: required.score,
    preferredSkillsScore: preferred.score,
    experienceScore: clamp(experience.score),
    educationScore,
    seniorityScore: clamp(seniority.score),
    domainScore,
    responsibilitiesScore,
    keywordScore,
    matchedSkills: [...required.matched, ...preferred.matched],
    missingSkills: required.missing,
    partialSkills: [...required.partial, ...preferred.partial],
    strengths,
    risks,
    whyRecommended,
    gapsSummary,
    explanation:
      `${cvMatchScore}/100 from the advert's own wording. ` +
      (required.known
        ? `You evidence ${required.matched.length} of ${job.requiredSkills.length} essential requirements. `
        : "The advert lists no explicit essential skills. ") +
      `${experience.note}. ${seniority.note}.` +
      (criticalGap ? " Capped because most essential requirements are unmet." : ""),
  };
}

export const sponsorshipFitScore: Record<DbSponsorshipStatus, number> = {
  confirmed: 100,
  likely: 84,
  possible: 62,
  unclear: 42,
  unlikely: 18,
  no_sponsorship: 0,
};

/** Followed-company priority mapping. Adjust here only. */
export const companyPriorityScore = {
  high: 100,
  medium: 70,
  normal: 50,
  unfollowed: 40,
} as const;

export interface OpportunityResult {
  opportunityScore: number;
  sponsorshipFit: number;
  locationFit: number;
  salaryFit: number;
  recency: number;
  companyPriority: number;
  workStyleFit: number;
  linkVerification: number;
  learnedAdjustment: number;
  tier: RecommendationTier;
  reasons: string[];
}

/** Link verification is a scored component, configurable through weights. */
export const linkVerificationScore: Record<string, number> = {
  live: 100,
  possibly_live: 70,
  unknown: 50,
  broken: 10,
  expired: 0,
};

/** Bounded so learned behaviour can nudge ranking but never override rules. */
export const MAX_LEARNED_ADJUSTMENT = 6;

/**
 * calculateOpportunityScore — how worth acting on this job is right now.
 * Every component is normalised to 0-100 and combined with the user's weights.
 */
export function calculateOpportunityScore(
  candidate: EngineCandidate,
  job: EngineJob,
  match: MatchResult,
  weights: EngineWeights,
  companyPriority: keyof typeof companyPriorityScore,
  learnedAdjustment = 0,
): OpportunityResult {
  // Unknown posting date: fall back to when we discovered it, and never treat
  // the job as brand new just because the source withheld a date.
  const dateBasis = job.postedAt ?? job.discoveredAt ?? null;
  const daysOld = dateBasis
    ? Math.max(0, Math.round((Date.now() - new Date(dateBasis).getTime()) / 86_400_000))
    : null;
  // Gentler decay: an advert three weeks old is still worth applying to, so
  // freshness nudges the ranking rather than dominating it.
  const recency = daysOld === null ? 50 : clamp(100 - daysOld * 2.5, 20);

  const locationFit =
    job.remoteType === "Remote" ||
    candidate.preferredLocations.some(
      (l) => job.city && norm(job.city).includes(norm(l.replace(/ uk$/i, ""))),
    )
      ? 100
      : 55;

  const salaryFit =
    job.salaryMax === null
      ? 60
      : job.salaryMax >= candidate.minimumSalary
        ? 100
        : clamp((job.salaryMax / Math.max(1, candidate.minimumSalary)) * 70);

  const workStyleFit =
    candidate.remotePreferences.length === 0
      ? 70
      : candidate.remotePreferences.some((p) => norm(p) === norm(job.remoteType))
        ? 100
        : job.remoteType === "Remote"
          ? 85
          : 50;

  const sponsorshipFit = sponsorshipFitScore[job.sponsorshipStatus];
  const priorityScore = companyPriorityScore[companyPriority];
  const linkVerification = linkVerificationScore[job.liveStatus] ?? 50;

  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 100;
  let weighted =
    (match.cvMatchScore * weights.cvMatch +
      sponsorshipFit * weights.sponsorshipFit +
      match.seniorityScore * weights.seniorityFit +
      locationFit * weights.locationFit +
      recency * weights.recency +
      priorityScore * weights.companyPriority +
      salaryFit * weights.salaryFit +
      workStyleFit * weights.workStyleFit +
      linkVerification * weights.linkVerification) /
    total;

  const bounded = Math.max(
    -MAX_LEARNED_ADJUSTMENT,
    Math.min(MAX_LEARNED_ADJUSTMENT, Math.round(learnedAdjustment)),
  );
  weighted += bounded;

  const reasons = [...match.whyRecommended];
  if (linkVerification === 100) reasons.push("The application link was checked and is live");
  if (priorityScore >= 100) reasons.push("Employer is on your high-priority watchlist");
  if (recency >= 85 && daysOld !== null)
    reasons.push(`Posted ${daysOld} day${daysOld === 1 ? "" : "s"} ago`);
  if (bounded > 0) reasons.push("Similar roles you saved before nudged this up slightly");

  // Hard overrides stated by the posting outweigh every preference boost.
  const blockers = job.mandatoryBlockers ?? [];
  if (blockers.length > 0) weighted = weighted * Math.max(0.35, 1 - 0.25 * blockers.length);
  if (job.sponsorshipStatus === "no_sponsorship") weighted = Math.min(weighted, 45);
  if (job.liveStatus === "expired" || job.liveStatus === "broken") weighted = 0;

  let opportunityScore = clamp(weighted);
  let tier = tierFor(opportunityScore);

  // An ineligible vacancy can never be boosted into the top tiers.
  if (job.eligibilityStatus === "ineligible") {
    opportunityScore = Math.min(opportunityScore, 55);
    tier = tierFor(opportunityScore);
  } else if (job.eligibilityStatus === "review" && tier === "apply_asap") {
    tier = "strong_match";
  }
  // Nothing reaches the top tier while the essential requirements are unmet.
  if (tier === "apply_asap" && match.requiredSkillsScore < 50 && job.requiredSkills.length >= 3) {
    tier = "strong_match";
  }

  // Hard sponsorship safeguards. A very high CV match must never push a
  // vacancy the user is not permitted to take into Apply ASAP.
  if (candidate.requiresSponsorship) {
    const excluded =
      job.sponsorshipStatus === "no_sponsorship" ||
      job.citizenshipRequired === true ||
      job.securityRestriction === true;
    if (excluded && tier === "apply_asap") {
      tier = "strong_match";
      reasons.push(
        job.citizenshipRequired
          ? "Held back from Apply ASAP: the vacancy requires UK citizenship"
          : job.securityRestriction
            ? "Held back from Apply ASAP: the vacancy requires security clearance"
            : "Held back from Apply ASAP: the vacancy excludes visa sponsorship",
      );
    }
  }

  return {
    opportunityScore,
    sponsorshipFit,
    locationFit,
    salaryFit,
    recency,
    companyPriority: priorityScore,
    workStyleFit,
    linkVerification,
    learnedAdjustment: bounded,
    tier,
    reasons: [...new Set(reasons)].slice(0, 6),
  };
}

export function tierFor(score: number): RecommendationTier {
  if (score >= 80) return "apply_asap";
  if (score >= 70) return "strong_match";
  if (score >= 60) return "review";
  if (score >= 50) return "low_priority";
  return "hidden";
}

export interface SponsorshipResult {
  status: DbSponsorshipStatus;
  confidence: number;
  evidence: string[];
  warnings: string[];
}

/**
 * analyseSponsorship — rule-based signals only. Never asserts sponsorship is
 * guaranteed; always returns a status plus a confidence and its evidence.
 */
export function analyseSponsorshipRules(input: {
  description: string;
  requiredSkills: string[];
  companySponsorStatus: DbSponsorshipStatus;
  companyConfidence: number;
  salaryMax: number | null;
}): SponsorshipResult {
  const text = norm(`${input.description} ${input.requiredSkills.join(" ")}`);
  const evidence: string[] = [];
  const warnings: string[] = [];

  const sponsorship = classifySponsorship(input.description);
  const saysNo = sponsorship === "unavailable";
  const saysYes = sponsorship === "offered";
  const citizenship = requiresUkCitizenship(input.description);
  const clearance = classifyClearance(input.description).status === "required";

  if (saysNo) {
    evidence.push("Advert states sponsorship is not available");
    return { status: "no_sponsorship", confidence: 100, evidence, warnings };
  }
  if (citizenship) {
    evidence.push("Advert requires UK citizenship");
    warnings.push("Citizenship requirements normally rule out sponsorship");
    return { status: "no_sponsorship", confidence: 5, evidence, warnings };
  }
  if (clearance) {
    warnings.push(
      "Advert requires security clearance or clearance eligibility; excluded by your clearance preference",
    );
  }

  let status: DbSponsorshipStatus =
    input.companySponsorStatus === "confirmed" ? "possible" : input.companySponsorStatus;
  let confidence = input.companyConfidence;

  if (saysYes) {
    evidence.push("Advert explicitly mentions visa sponsorship");
    status = "confirmed";
    confidence = Math.max(confidence, 92);
  } else {
    warnings.push("Sponsorship is not explicitly confirmed in the advert");
    evidence.push(`Employer sponsorship signal: ${input.companySponsorStatus}`);
  }

  warnings.push(
    "Verify current visa salary rules, occupation code and employer eligibility; advertised salary alone does not establish visa eligibility.",
  );

  warnings.push("Sponsorship is an estimate — always confirm with the employer");

  return { status, confidence: clamp(confidence), evidence, warnings };
}

/** Deterministic first-pass duplicate key. */
export function duplicateKey(input: {
  companyId: string;
  title: string;
  city: string | null;
}): string {
  return `${input.companyId}|${normalizeTitle(input.title)}|${norm(input.city ?? "")}`;
}
