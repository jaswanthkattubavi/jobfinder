import { requiresUkCitizenship, classifyClearance, classifySponsorship } from "./screening.ts";
import type { NormalizedJob } from "./normalize";

/**
 * Rule-based eligibility filter, run BEFORE any AI analysis so we never spend
 * money reasoning about obvious mismatches. Nothing is deleted: every job keeps
 * a status and human-readable reasons, and the user can inspect filtered jobs.
 */

export type EligibilityStatus = "eligible" | "likely_eligible" | "review" | "ineligible";

export interface EligibilityPrefs {
  allowedSeniority: string[];
  enabledCategories: string[];
  preferredLocations: string[];
  allowUkWide: boolean;
  rejectCitizenshipRequired: boolean;
  rejectSecurityClearance: boolean;
  excludedTitles: string[];
  excludedCompanies: string[];
  maxJobAgeDays: number;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  reasons: string[];
}

const ABOVE_LEVEL =
  /\b(senior|snr|sr\.?|staff|principal|distinguished|fellow|lead|leader|director|head of|manager|vp|vice president|chief|c-level|architect ii*i)\b/i;

export function assessEligibility(job: NormalizedJob, prefs: EligibilityPrefs): EligibilityResult {
  const reasons: string[] = [];
  let ineligible = false;
  let needsReview = false;
  const text = job.description.toLowerCase();

  if (!job.isUkLocation && job.country !== "United Kingdom") {
    if (job.country === "Unknown") {
      needsReview = true;
      reasons.push("Location could not be confirmed as UK");
    } else {
      ineligible = true;
      reasons.push(`Location outside the UK (${job.country})`);
    }
  }

  if (job.seniority === "Senior" && !prefs.allowedSeniority.includes("Senior")) {
    if (ABOVE_LEVEL.test(job.originalTitle)) {
      ineligible = true;
      reasons.push("Title is above the seniority levels you accept");
    } else {
      needsReview = true;
      reasons.push("Seniority looks higher than your preferences");
    }
  }

  if (prefs.rejectCitizenshipRequired && requiresUkCitizenship(text)) {
    ineligible = true;
    reasons.push("Posting requires UK citizenship");
  }
  const clearance = classifyClearance(job.description);
  if (prefs.rejectSecurityClearance && clearance.status === "required") {
    ineligible = true;
    reasons.push("Posting requires security clearance");
  }
  if (
    prefs.rejectSecurityClearance &&
    clearance.evidence.length &&
    ["unknown", "desirable"].includes(clearance.status)
  ) {
    needsReview = true;
    reasons.push("Clearance is mentioned without a confirmed requirement — review the advert");
  }
  if (classifySponsorship(job.description) === "unavailable") {
    reasons.push("Posting states sponsorship is not available");
    needsReview = true;
  }

  if (
    prefs.enabledCategories.length > 0 &&
    job.roleCategory &&
    !prefs.enabledCategories.includes(job.roleCategory)
  ) {
    ineligible = true;
    reasons.push(`Role category (${job.roleCategory}) is not one you follow`);
  }
  if (!job.roleCategory) {
    if (prefs.enabledCategories.length > 0) {
      // The user follows specific technology role families; a title that matches
      // none of them is not an opportunity for them.
      ineligible = true;
      reasons.push("Title does not match any of the role types you follow");
    } else {
      needsReview = true;
      reasons.push("Role category could not be determined from the title");
    }
  }

  const titleLower = job.originalTitle.toLowerCase();
  if (prefs.excludedTitles.some((t) => t && titleLower.includes(t.toLowerCase()))) {
    ineligible = true;
    reasons.push("Title matches one of your excluded titles");
  }
  if (
    prefs.excludedCompanies.some(
      (c) => c && job.companyName.toLowerCase().includes(c.toLowerCase()),
    )
  ) {
    ineligible = true;
    reasons.push("Company is on your excluded list");
  }

  if (job.postedAt) {
    const ageDays = (Date.now() - new Date(job.postedAt).getTime()) / 86_400_000;
    if (prefs.maxJobAgeDays > 0 && ageDays > prefs.maxJobAgeDays) {
      needsReview = true;
      reasons.push(
        `Posted ${Math.round(ageDays)} days ago, older than your ${prefs.maxJobAgeDays}-day window`,
      );
    }
  } else {
    reasons.push("Posting date not published by the source — stored as unknown");
  }

  if (ineligible) return { status: "ineligible", reasons };
  if (needsReview) return { status: "review", reasons };
  if (
    prefs.preferredLocations.length > 0 &&
    job.city &&
    !prefs.preferredLocations.some((l) => job.city!.toLowerCase().includes(l.toLowerCase())) &&
    job.remoteType !== "Remote"
  ) {
    return {
      status: prefs.allowUkWide ? "likely_eligible" : "review",
      reasons: [...reasons, `${job.city} is outside your preferred locations`],
    };
  }
  return {
    status: "eligible",
    reasons: reasons.length > 0 ? reasons : ["Meets your basic criteria"],
  };
}
