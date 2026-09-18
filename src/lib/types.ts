// Core domain types for Job Radar AI. Shared by the service layer and the UI.

export type RemoteStatus = "Remote" | "Hybrid" | "On-site";

export type RoleCategory =
  | "Data Science"
  | "Machine Learning"
  | "AI Engineering"
  | "MLOps"
  | "Data Engineering"
  | "Software Engineering"
  | "Backend Engineering"
  | "Cloud Engineering"
  | "Solutions Engineering"
  | "Solutions Architecture"
  | "AI Product"
  | "Data Analytics"
  | "Platform Engineering";

export type Seniority = "Graduate" | "Junior" | "Associate" | "Mid" | "Senior";

export type SponsorshipStatus =
  | "Confirmed"
  | "Likely"
  | "Possible"
  | "Unclear"
  | "Unlikely"
  | "No Sponsorship";

export type LinkStatus = "Live" | "Possibly Live" | "Expired" | "Broken Link" | "Unknown";

export type JobSourceKind =
  | "Company Careers"
  | "Greenhouse"
  | "Lever"
  | "Workday"
  | "SmartRecruiters"
  | "Ashby"
  | "Job API"
  | "Search API";

export interface Company {
  id: string;
  name: string;
  logo: string;
  industry: string;
  size: string;
  headquarters: string;
  ukLocations: string[];
  sponsorshipStatus: SponsorshipStatus;
  sponsorshipConfidence: number;
  sponsorEvidence: string[];
  /** Employer → sponsor-register match, when a dataset has been imported. */
  sponsorLicenceMatch?: SponsorLicenceMatch | undefined;
  matchedLegalEntity?: string | null | undefined;
  sponsorLicenceType?: string | null | undefined;
  sponsorRegisterDate?: string | null | undefined;
  sponsorLastChecked?: string | null | undefined;
  openMatchingRoles: number;
  previousApplications: number;
  averageMatchScore: number;
  priority: "High" | "Medium" | "Normal";
  followed: boolean;
  notes?: string | undefined;
  tags: Array<
    | "Priority"
    | "Sponsorship Friendly"
    | "Startup"
    | "Large Company"
    | "Recently Hiring"
    | "Previously Applied"
  >;
}

export interface MatchAnalysis {
  overall: number;
  skills: number;
  requiredSkills: number;
  preferredSkills: number;
  responsibilities: number;
  keywords: number;
  experience: number;
  education: number;
  seniority: number;
  domain: number;
  matchedSkills: string[];
  missingSkills: string[];
  partialSkills: string[];
  strengths: string[];
  risks: string[];
  whyRecommended: string[];
  gapsSummary: string;
  learnedAdjustment: number;
  explanation: string;
}


export type SponsorLicenceMatch = "matched" | "possible" | "not_found" | "unknown";

export interface SponsorshipEvidenceDetail {
  kind: string;
  source: "company" | "job";
  tone: "positive" | "negative" | "neutral";
  text: string;
  snippet?: string;
}

/** Structured, evidence-backed detail stored for real vacancies. */
export interface SponsorshipDetails {
  employerMatch: SponsorLicenceMatch;
  matchedEntity: string | null;
  matchConfidence: number | null;
  jobWording: string;
  workAuthorisation: string;
  restriction: string;
  conclusion: string;
  items: SponsorshipEvidenceDetail[];
}

export interface SponsorshipAnalysis {
  status: SponsorshipStatus;
  confidence: number;
  evidence: string[];
  warnings: string[];
  details?: SponsorshipDetails | undefined;
}

export interface Job {
  id: string;
  companyId: string;
  title: string;
  roleCategory: RoleCategory;
  location: string;
  city: string;
  country: string;
  remote: RemoteStatus;
  employmentType: string;
  salaryMin?: number | undefined;
  salaryMax?: number | undefined;
  currency: string;
  description: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  yearsExperience: string;
  education: string;
  seniority: Seniority;
  industry: string;
  datePosted: string;
  dateDiscovered: string;
  deadline?: string | undefined;
  source: JobSourceKind;
  originalUrl: string;
  applyUrl: string;
  active: boolean;
  lastVerified: string;
  linkStatus: LinkStatus;
  verificationReason?: string | undefined;
  opportunityScore: number;
  match: MatchAnalysis;
  sponsorship: SponsorshipAnalysis;
  atsKeywords: string[];
  atsCritical: string[];
  atsUseful: string[];
  technologies: string[];
  analysisStatus: "completed" | "pending" | "failed" | "skipped" | "none";
  analysisError?: string | undefined;
  demo: boolean;

}

export type ApplicationStage =
  | "Discovered"
  | "Saved"
  | "Applied"
  | "Assessment"
  | "Recruiter Screen"
  | "Interview"
  | "Technical Interview"
  | "Final Interview"
  | "Offer"
  | "Rejected"
  | "Withdrawn";

export interface Application {
  id: string;
  jobId: string;
  stage: ApplicationStage;
  appliedOn?: string | undefined;
  cvVersion?: string | undefined;
  coverLetter?: string | undefined;
  notes?: string | undefined;
  recruiter?: string | undefined;
  deadline?: string | undefined;
  nextStep?: string | undefined;
  interviewDate?: string | undefined;
  needsFollowUp: boolean;
}

export interface SavedJob {
  jobId: string;
  folder: string;
  savedOn: string;
}

export interface ScanRun {
  id: string;
  date: string;
  startedAt: string;
  finishedAt: string;
  sources: number;
  discovered: number;
  newJobs: number;
  duplicatesRemoved: number;
  expired: number;
  analysed: number;
  strongMatches: number;
  errors: string[];
}

export interface CandidateProfile {
  name: string;
  headline: string;
  summary: string;
  targetRoles: RoleCategory[];
  preferredLocations: string[];
  remotePreference: RemoteStatus[];
  salaryExpectation: { min: number; max: number };
  industries: string[];
  preferredSeniority: Seniority[];
  skills: string[];
  languages: string[];
  cloud: string[];
  databases: string[];
  mlSkills: string[];
  yearsExperience: number;
  education: string;
  certifications: string[];
  workAuthorization: string;
  visaType: string;
  sponsorshipRequiredNow: boolean;
  sponsorshipRequiredLater: boolean;
  /** Right-to-work / visa expiry, ISO date, null when not applicable. */
  visaExpiry?: string | null;
  /** Free-text notes about the candidate's right to work. Kept private. */
  workAuthNotes?: string;
  cvVersions: string[];
}

/** A single stored candidate skill, with where it came from. */
export interface CandidateSkill {
  id: string;
  name: string;
  category: string;
  /** "cv" when read from a CV, "user" when added by hand, "onboarding" legacy. */
  source: string;
}

export interface SearchPreferences {
  targetTitles: string[];
  excludedTitles: string[];
  locations: string[];
  remotePreference: RemoteStatus[];
  salaryMin: number;
  jobAgeDays: number;
  minMatchScore: number;
  minOpportunityScore: number;
  minSponsorshipConfidence: number;
  excludedIndustries: string[];
  excludedCompanies: string[];
  rejectCitizenshipRequired: boolean;
  rejectSecurityClearance: boolean;
  rejectAboveSeniority: boolean;
}

export interface ScoringWeights {
  cvMatch: number;
  sponsorshipFit: number;
  seniorityFit: number;
  locationFit: number;
  recency: number;
  companyPriority: number;
  salaryFit: number;
}

export type FeedbackReason =
  | "Interested"
  | "Not Interested"
  | "Too Senior"
  | "Wrong Role"
  | "No Sponsorship"
  | "Wrong Location"
  | "Already Seen"
  | "Bad Company Fit";

export interface NotificationPreference {
  category: string;
  channels: string[];
  enabled: boolean;
}

export interface IntegrationStatus {
  name: string;
  kind: "Job Source" | "AI" | "Notification" | "Scheduler";
  connected: boolean;
  detail: string;
}
