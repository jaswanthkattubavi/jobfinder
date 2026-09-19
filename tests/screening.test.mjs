import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyClearance,
  classifySponsorship,
  containsSkill,
} from "../src/lib/services/screening.ts";
import { analyseSponsorshipRules, calculateMatchScore } from "../src/lib/services/engine.ts";
import { assessEligibility } from "../src/lib/services/eligibility.ts";

for (const [description, expected] of [
  ["Security clearance is not required.", "not_required"],
  ["No SC clearance required.", "not_required"],
  ["We do not require security clearance.", "not_required"],
  ["You must be eligible for SC (Security Check).", "required"],
  ["You must be able to obtain SC clearance.", "required"],
  ["Existing clearance is not required, but you must obtain SC clearance.", "required"],
  ["SC clearance is desirable.", "desirable"],
  ["We work on security clearance projects.", "unknown"],
  ["BPSS screening is required.", "unknown"],
  ["Must hold DV clearance.", "required"],
])
  test(`clearance: ${description}`, () =>
    assert.equal(classifyClearance(description).status, expected));

for (const description of [
  "We cannot offer Skilled Worker visa sponsorship.",
  "We are unable to provide visa sponsorship.",
  "Sponsorship is not available for this role.",
  "Visa sponsorship is not offered.",
  "We do not sponsor visas.",
  "We can sponsor other roles. No visa sponsorship for this vacancy.",
])
  test(`sponsorship refusal: ${description}`, () => {
    assert.equal(classifySponsorship(description), "unavailable");
    const result = analyseSponsorshipRules({
      description,
      requiredSkills: [],
      companySponsorStatus: "confirmed",
      companyConfidence: 95,
      salaryMax: 100000,
    });
    assert.equal(result.status, "no_sponsorship");
  });

test("visa mention, conditional offer and company licence are not role-level confirmation", () => {
  for (const description of [
    "Applicants may hold a Skilled Worker visa.",
    "We may offer visa sponsorship.",
    "We are a licensed sponsor.",
  ]) {
    assert.equal(classifySponsorship(description), "unknown");
    assert.notEqual(
      analyseSponsorshipRules({
        description,
        requiredSkills: [],
        companySponsorStatus: "confirmed",
        companyConfidence: 95,
        salaryMax: 60000,
      }).status,
      "confirmed",
    );
  }
  assert.equal(classifySponsorship("Visa sponsorship is available."), "offered");
});

test("salary does not assert legal eligibility", () => {
  const result = analyseSponsorshipRules({
    description: "We can sponsor.",
    requiredSkills: [],
    companySponsorStatus: "unclear",
    companyConfidence: 0,
    salaryMax: 60000,
  });
  assert.equal(result.status, "confirmed");
  assert.ok(result.warnings.some((s) => s.includes("Verify current visa salary rules")));
  assert.ok(!result.evidence.some((s) => s.includes("Salary")));
});

const candidate = {
  skills: ["AWS"],
  yearsExperience: 3,
  education: null,
  allowedSeniority: ["Mid"],
  preferredLocations: ["London"],
  preferredIndustries: [],
  targetTitles: ["Software Engineer"],
  minimumSalary: 0,
  remotePreferences: [],
};
const job = {
  id: "a",
  title: "Software Engineer",
  city: "London",
  seniority: "Mid",
  industry: null,
  roleCategory: null,
  remoteType: "Hybrid",
  salaryMin: null,
  salaryMax: null,
  postedAt: null,
  requiredExperienceYears: "3",
  requiredSkills: ["AWS Lambda"],
  preferredSkills: [],
  description: "",
  liveStatus: "live",
  sponsorshipStatus: "unclear",
  sponsorshipConfidence: 0,
};

test("partial skill evidence cannot become full evidence in summary", () => {
  const result = calculateMatchScore(candidate, job);
  assert.deepEqual(result.partialSkills, ["AWS Lambda"]);
  assert.deepEqual(result.matchedSkills, []);
  assert.match(result.gapsSummary, /Partial skill matches/);
  assert.ok(result.risks.some((s) => s.includes("partial")));
});

test("exact skill wins over earlier partial and substring collisions do not match", () => {
  assert.deepEqual(
    calculateMatchScore({ ...candidate, skills: ["AWS", "AWS Lambda"] }, job).matchedSkills,
    ["AWS Lambda"],
  );
  for (const [own, required] of [
    ["RAG", "GraphRAG"],
    ["Java", "JavaScript"],
    ["C", "C++"],
    ["SQL", "NoSQL"],
  ]) {
    assert.equal(containsSkill(required, own), false);
    assert.deepEqual(
      calculateMatchScore({ ...candidate, skills: [own] }, { ...job, requiredSkills: [required] })
        .missingSkills,
      [required],
    );
  }
});

test("eligibility excludes required SC but reviews ambiguous and permits BPSS alone", () => {
  const prefs = {
    allowedSeniority: ["Mid"],
    enabledCategories: [],
    preferredLocations: [],
    allowUkWide: true,
    rejectCitizenshipRequired: true,
    rejectSecurityClearance: true,
    excludedTitles: [],
    excludedCompanies: [],
    maxJobAgeDays: 30,
  };
  for (const [description, expected] of [
    ["Must be eligible for SC (Security Check).", "ineligible"],
    ["Security clearance is not required.", "eligible"],
    ["BPSS checks required.", "eligible"],
    ["SC clearance preferred.", "review"],
  ]) {
    assert.equal(
      assessEligibility(
        {
          description,
          isUkLocation: true,
          country: "United Kingdom",
          seniority: "Mid",
          originalTitle: "Software Engineer",
          roleCategory: "Software",
          companyName: "Example",
          postedAt: null,
        },
        prefs,
      ).status,
      expected,
    );
  }
});

import {
  analyseJobWording,
  analyseSponsorship,
  matchSponsorRegister,
} from "../src/lib/services/sponsorship.ts";
test("live sponsorship pipeline uses shared refusal and clearance classifier", () => {
  const description =
    "We cannot offer Skilled Worker visa sponsorship. Security clearance is not required.";
  const wording = analyseJobWording(description);
  assert.equal(wording.explicitNoSponsorship, true);
  assert.equal(wording.hasExplicitPositive, false);
  assert.equal(wording.securityRestriction, false);
  assert.equal(analyseJobWording("BPSS is required.").securityRestriction, false);
  assert.equal(
    analyseJobWording("Must be eligible for SC (Security Check).").securityRestriction,
    true,
  );
  const result = analyseSponsorship({
    description,
    companyMatch: matchSponsorRegister("Example", []),
    salaryMin: 100000,
  });
  assert.equal(result.status, "no_sponsorship");
  assert.ok(!result.evidence.some((e) => e.kind === "salary" && e.tone === "positive"));
});

test("a waived citizenship requirement must not imply refusal to sponsor", () => {
  const description = "UK citizenship is not required. Visa sponsorship is available.";
  assert.equal(
    analyseSponsorshipRules({
      description,
      requiredSkills: [],
      companySponsorStatus: "unclear",
      companyConfidence: 0,
      salaryMax: null,
    }).status,
    "confirmed",
  );
  assert.equal(analyseJobWording(description).citizenshipRequired, false);
});
