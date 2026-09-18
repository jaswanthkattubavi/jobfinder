/**
 * UK sponsorship intelligence — evidence-weighted, never guessed.
 *
 * Two independent questions are answered separately and then combined:
 *   1. Can this employer be confidently matched to an organisation on the
 *      official UK Register of Licensed Sponsors (Workers)?
 *   2. What does this individual vacancy actually say about sponsorship,
 *      work authorisation, citizenship and security clearance?
 *
 * A sponsor licence means an organisation *can potentially* sponsor qualifying
 * workers. It never proves this specific vacancy is sponsored, so a register
 * match alone can never reach "Confirmed".
 */

export type SponsorshipStatusDb =
  | "confirmed"
  | "likely"
  | "possible"
  | "unclear"
  | "unlikely"
  | "no_sponsorship";

export type SponsorMatchStatus = "matched" | "possible" | "not_found" | "unknown";

export type SponsorshipEvidenceKind =
  | "job_wording"
  | "sponsor_register"
  | "role_compatibility"
  | "work_authorisation"
  | "citizenship_restriction"
  | "security_clearance"
  | "salary"
  | "no_wording";

export interface SponsorshipEvidenceItem {
  kind: SponsorshipEvidenceKind;
  /** Where the evidence came from — the employer record or the vacancy text. */
  source: "company" | "job";
  tone: "positive" | "negative" | "neutral";
  text: string;
  weight: number;
  snippet?: string;
}

export interface CompanySponsorMatch {
  status: SponsorMatchStatus;
  /** Matched legal entity exactly as it appears on the official register. */
  entity: string | null;
  confidence: number;
  /** exact | alias | normalized | possible | none | no dataset */
  method: string;
  licenceType: string | null;
  town: string | null;
  registerDate: string | null;
  note: string;
}

export interface SponsorshipResult {
  status: SponsorshipStatusDb;
  confidence: number;
  evidence: SponsorshipEvidenceItem[];
  warnings: string[];
  companyMatch: CompanySponsorMatch;
  jobWordingSummary: string;
  workAuthorisationSummary: string;
  restrictionSummary: string;
  conclusion: string;
  citizenshipRequired: boolean;
  securityRestriction: boolean;
  explicitNoSponsorship: boolean;
}

/* ------------------------------------------------------------------ *
 * Name normalisation and employer / legal-entity matching
 * ------------------------------------------------------------------ */

/** Punctuation, case and ampersand normalisation only — keeps "limited"/"plc". */
export function normalizeLegalName(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LEGAL_SUFFIXES = new Set([
  "limited", "ltd", "llp", "lp", "plc", "inc", "incorporated", "corporation",
  "corp", "company", "co", "holdings", "holding", "group", "uk", "gb",
  "international", "the",
]);

/** Strips legal-form words so "Monzo Bank Limited" → "monzo bank". */
export function normalizeTradingName(value: string): string {
  return normalizeLegalName(value)
    .split(" ")
    .filter((w) => !LEGAL_SUFFIXES.has(w))
    .join(" ")
    .trim();
}

/**
 * Curated employer → legal-entity aliases. Only names verified by hand belong
 * here; nothing is generated automatically, so a wrong alias can never appear.
 */
export const SPONSOR_ALIASES: Record<string, string[]> = {
  monzo: ["monzo bank"],
  palantir: ["palantir technologies"],
  wise: ["wise payments"],
  revolut: ["revolut"],
  starling: ["starling bank"],
  deepmind: ["google", "deepmind technologies"],
  "match group": ["match group"],
  ramp: ["ramp business corporation"],
  synthesia: ["synthesia"],
};

export interface SponsorRegisterEntry {
  organisation_name: string;
  normalized_name: string;
  licence_type?: string | null;
  town_city?: string | null;
  county?: string | null;
  route?: string | null;
  register_date?: string | null;
}

interface Candidate {
  entry: SponsorRegisterEntry;
  core: string;
}

function pickEntry(list: Candidate[]): Candidate {
  // Prefer a Worker (Skilled Worker) licence when an organisation holds several.
  const worker = list.find((c) => /skilled worker/i.test(c.entry.route ?? "") || /worker/i.test(c.entry.licence_type ?? ""));
  return worker ?? list[0]!;
}

function distinctNames(list: Candidate[]): string[] {
  return [...new Set(list.map((c) => normalizeLegalName(c.entry.organisation_name)))];
}

function matchResult(
  status: SponsorMatchStatus,
  candidate: Candidate | null,
  confidence: number,
  method: string,
  note: string,
): CompanySponsorMatch {
  return {
    status,
    entity: candidate?.entry.organisation_name.trim() ?? null,
    confidence,
    method,
    licenceType: candidate?.entry.licence_type ?? null,
    town: candidate?.entry.town_city ?? null,
    registerDate: candidate?.entry.register_date ?? null,
    note,
  };
}

/**
 * Conservative employer → sponsor-register matching. Weak fuzzy similarity is
 * never silently accepted: it is reported as "possible" and needs review.
 */
export function matchSponsorRegister(
  displayName: string,
  entries: SponsorRegisterEntry[],
): CompanySponsorMatch {
  if (!displayName?.trim()) {
    return matchResult("unknown", null, 0, "no employer name", "No employer name to match.");
  }
  if (entries.length === 0) {
    return matchResult(
      "unknown",
      null,
      0,
      "no dataset",
      "No sponsor-register dataset has been imported, so licence status is unknown.",
    );
  }

  const legal = normalizeLegalName(displayName);
  const core = normalizeTradingName(displayName);
  const candidates: Candidate[] = entries.map((entry) => ({
    entry,
    core: normalizeTradingName(entry.organisation_name),
  }));

  const exact = candidates.filter((c) => c.entry.normalized_name === legal || normalizeLegalName(c.entry.organisation_name) === legal);
  if (exact.length > 0) {
    const chosen = pickEntry(exact);
    return matchResult("matched", chosen, 100, "exact", `Employer name matches the register entry exactly.`);
  }

  const aliasTargets = SPONSOR_ALIASES[core] ?? [];
  if (aliasTargets.length > 0) {
    const aliased = candidates.filter((c) => aliasTargets.includes(c.core));
    if (aliased.length > 0) {
      const chosen = pickEntry(aliased);
      return matchResult("matched", chosen, 95, "alias", "Matched through a verified trading-name alias.");
    }
  }

  const coreMatches = candidates.filter((c) => c.core === core && core.length >= 3);
  if (coreMatches.length > 0) {
    const names = distinctNames(coreMatches);
    if (names.length === 1) {
      const chosen = pickEntry(coreMatches);
      return matchResult(
        "matched",
        chosen,
        90,
        "normalized",
        "Matched after normalising legal form (Ltd/Limited/PLC) and punctuation.",
      );
    }
    return matchResult(
      "possible",
      pickEntry(coreMatches),
      55,
      "possible",
      `${names.length} register organisations share this name — needs review before it can be relied on.`,
    );
  }

  const prefixMatches = candidates.filter(
    (c) => core.length >= 4 && (c.core.startsWith(`${core} `) || core.startsWith(`${c.core} `)),
  );
  if (prefixMatches.length > 0) {
    const names = distinctNames(prefixMatches);
    const chosen = pickEntry(prefixMatches);
    return matchResult(
      "possible",
      chosen,
      names.length === 1 ? 65 : 50,
      "possible",
      names.length === 1
        ? "A similarly named legal entity is on the register, but the match is not certain."
        : `${names.length} similarly named organisations are on the register — needs review.`,
    );
  }

  return matchResult(
    "not_found",
    null,
    0,
    "none",
    "No organisation on the current sponsor register could be matched to this employer name.",
  );
}

/** Backwards-compatible helper kept for existing callers. */
export function matchRegisterName(
  normalizedCompany: string,
  entries: Array<{ organisation_name: string; normalized_name: string }>,
): { entity: string; confidence: number; method: string } | null {
  const match = matchSponsorRegister(normalizedCompany, entries as SponsorRegisterEntry[]);
  return match.status === "matched" && match.entity
    ? { entity: match.entity, confidence: match.confidence, method: match.method }
    : null;
}

/* ------------------------------------------------------------------ *
 * Vacancy-level wording analysis
 * ------------------------------------------------------------------ */

interface Pattern {
  re: RegExp;
  kind: SponsorshipEvidenceKind;
  tone: "positive" | "negative";
  text: string;
  weight: number;
}

const JOB_PATTERNS: Pattern[] = [
  {
    re: /\b(visa sponsorship (is )?(available|offered|provided)|we (can|do|will) sponsor|sponsorship (is )?available|we offer visa sponsorship|skilled worker (visa )?sponsorship available|we are a licensed sponsor and (can|will) sponsor|happy to sponsor)\b/i,
    kind: "job_wording",
    tone: "positive",
    text: "Vacancy explicitly states visa sponsorship is available",
    weight: 55,
  },
  {
    re: /\b(sponsorship may be available|may be able to sponsor|can consider sponsorship|open to sponsoring)\b/i,
    kind: "job_wording",
    tone: "positive",
    text: "Vacancy says sponsorship may be available",
    weight: 32,
  },
  {
    re: /\b(skilled worker (visa|route)|certificate of sponsorship|immigration support|visa support|relocation and visa support|relocation support|global talent visa)\b/i,
    kind: "job_wording",
    tone: "positive",
    text: "Vacancy refers to the Skilled Worker route, immigration or relocation support",
    weight: 26,
  },
  {
    re: /\b(we (are|'re) (unable|not able) to (offer|provide|support) (visa )?sponsorship|no visa sponsorship|cannot sponsor|can not sponsor|do not sponsor|does not sponsor|sponsorship is not (available|offered)|unable to sponsor|not in a position to sponsor|applicants requiring sponsorship cannot be considered|we do not offer sponsorship)\b/i,
    kind: "job_wording",
    tone: "negative",
    text: "Vacancy explicitly states sponsorship is not available",
    weight: -80,
  },
  {
    re: /\b(must (already )?have (the )?(unrestricted )?right to work in the uk|you must have the right to work in the uk|existing right to work|without the need for sponsorship|already hold the right to work)\b/i,
    kind: "work_authorisation",
    tone: "negative",
    text: "Vacancy requires an existing right to work in the UK without sponsorship",
    weight: -45,
  },
  {
    re: /\b(must be a (uk|british) citizen|uk citizenship (is )?required|british citizen(ship)? (is )?required|sole uk national|uk nationals only|british nationals only)\b/i,
    kind: "citizenship_restriction",
    tone: "negative",
    text: "Vacancy requires British/UK citizenship",
    weight: -90,
  },
  {
    re: /\b(security clearance|sc clearance|dv clearance|developed vetting|must be security cleared|national security vetting|bpss)\b/i,
    kind: "security_clearance",
    tone: "negative",
    text: "Vacancy requires UK security clearance or vetting",
    weight: -40,
  },
];

function snippetAround(text: string, index: number): string {
  const start = Math.max(0, index - 90);
  return text.slice(start, Math.min(text.length, index + 160)).replace(/\s+/g, " ").trim();
}

export interface JobWordingAnalysis {
  items: SponsorshipEvidenceItem[];
  hasExplicitPositive: boolean;
  hasModeratePositive: boolean;
  explicitNoSponsorship: boolean;
  requiresExistingRightToWork: boolean;
  citizenshipRequired: boolean;
  securityRestriction: boolean;
}

/** Analyses only the vacancy text — never the employer record. */
export function analyseJobWording(description: string): JobWordingAnalysis {
  const text = description ?? "";
  const items: SponsorshipEvidenceItem[] = [];
  for (const p of JOB_PATTERNS) {
    const m = p.re.exec(text);
    if (!m) continue;
    items.push({
      kind: p.kind,
      source: "job",
      tone: p.tone,
      text: p.text,
      weight: p.weight,
      snippet: snippetAround(text, m.index),
    });
  }
  const has = (kind: SponsorshipEvidenceKind, minWeight: number) =>
    items.some((i) => i.kind === kind && i.weight >= minWeight);
  return {
    items,
    hasExplicitPositive: has("job_wording", 55),
    hasModeratePositive: items.some((i) => i.kind === "job_wording" && i.weight >= 26 && i.weight < 55),
    explicitNoSponsorship: items.some((i) => i.kind === "job_wording" && i.weight <= -80),
    requiresExistingRightToWork: items.some((i) => i.kind === "work_authorisation"),
    citizenshipRequired: items.some((i) => i.kind === "citizenship_restriction"),
    securityRestriction: items.some((i) => i.kind === "security_clearance"),
  };
}

/* ------------------------------------------------------------------ *
 * Combined judgement
 * ------------------------------------------------------------------ */

export interface SponsorshipInput {
  description: string;
  /** Result of employer → sponsor-register matching. */
  companyMatch: CompanySponsorMatch;
  /** True when the normalized role is one commonly eligible for Skilled Worker. */
  roleLooksSponsorable?: boolean;
  salaryMin?: number | null;
}

export function analyseSponsorship(input: SponsorshipInput): SponsorshipResult {
  const wording = analyseJobWording(input.description ?? "");
  const match = input.companyMatch;
  const evidence: SponsorshipEvidenceItem[] = [...wording.items];
  const warnings: string[] = [];
  let score = wording.items.reduce((sum, i) => sum + i.weight, 0);

  // Employer licence evidence — moderate positive at most.
  if (match.status === "matched") {
    const weight = match.confidence >= 95 ? 25 : 20;
    evidence.push({
      kind: "sponsor_register",
      source: "company",
      tone: "positive",
      text: `Employer confidently matched on the UK sponsor register as "${match.entity}" (${match.method} match, ${match.confidence}% confidence)`,
      weight,
    });
    score += weight;
    if (!wording.hasExplicitPositive) {
      warnings.push(
        "The employer holds a sponsor licence, but this vacancy contains no explicit sponsorship wording — a licence does not mean this role is sponsored.",
      );
    }
  } else if (match.status === "possible") {
    evidence.push({
      kind: "sponsor_register",
      source: "company",
      tone: "neutral",
      text: `Possible sponsor-register match ("${match.entity}") — not accepted automatically because the name match is uncertain`,
      weight: 0,
    });
    warnings.push("The employer's sponsor-licence match needs review, so it is not counted as evidence.");
  } else if (match.status === "not_found") {
    evidence.push({
      kind: "sponsor_register",
      source: "company",
      tone: "neutral",
      text: "Employer could not be matched to any organisation on the current sponsor register",
      weight: 0,
    });
    warnings.push(
      "No sponsor-register match was found. The employer may trade under a different legal name, so this is not proof they cannot sponsor.",
    );
  } else {
    evidence.push({
      kind: "sponsor_register",
      source: "company",
      tone: "neutral",
      text: match.note,
      weight: 0,
    });
    warnings.push(match.note);
  }

  if (input.roleLooksSponsorable) {
    evidence.push({
      kind: "role_compatibility",
      source: "job",
      tone: "positive",
      text: "Role type is commonly eligible for the Skilled Worker route",
      weight: 8,
    });
    score += 8;
  }
  if (input.salaryMin && input.salaryMin >= 38_700) {
    evidence.push({
      kind: "salary",
      source: "job",
      tone: "positive",
      text: `Stated salary from £${input.salaryMin.toLocaleString()} is at or above the general Skilled Worker salary floor`,
      weight: 8,
    });
    score += 8;
  }
  if (wording.items.every((i) => i.kind !== "job_wording")) {
    evidence.push({
      kind: "no_wording",
      source: "job",
      tone: "neutral",
      text: "Vacancy does not explicitly mention sponsorship either way",
      weight: 0,
    });
  }
  if (!wording.citizenshipRequired) {
    evidence.push({
      kind: "citizenship_restriction",
      source: "job",
      tone: "neutral",
      text: "No citizenship-only restriction detected in the vacancy",
      weight: 0,
    });
  }

  // Evidence hierarchy. Critical negatives win outright; a licence alone never
  // reaches Confirmed.
  let status: SponsorshipStatusDb;
  if (wording.citizenshipRequired || wording.explicitNoSponsorship) {
    status = "no_sponsorship";
  } else if (wording.hasExplicitPositive) {
    status = "confirmed";
  } else if (wording.requiresExistingRightToWork) {
    status = "unlikely";
  } else if (wording.hasModeratePositive && match.status === "matched") {
    status = "likely";
  } else if (wording.hasModeratePositive || (match.status === "matched" && score >= 30)) {
    status = "possible";
  } else if (match.status === "matched") {
    status = "possible";
  } else if (score <= -15) {
    status = "unlikely";
  } else {
    status = "unclear";
  }

  const confidenceBase = Math.max(0, Math.min(100, Math.round(50 + score * 0.55)));
  const confidence =
    status === "no_sponsorship"
      ? Math.max(85, confidenceBase)
      : status === "confirmed"
        ? Math.max(85, confidenceBase)
        : match.status === "unknown" && wording.items.length === 0
          ? Math.min(confidenceBase, 35)
          : confidenceBase;

  const jobWordingSummary = wording.hasExplicitPositive
    ? "Vacancy explicitly states sponsorship is available."
    : wording.explicitNoSponsorship
      ? "Vacancy explicitly states sponsorship is not available."
      : wording.hasModeratePositive
        ? "Vacancy mentions the Skilled Worker route, immigration or relocation support without confirming sponsorship."
        : "Vacancy says nothing about visa sponsorship.";

  const workAuthorisationSummary = wording.requiresExistingRightToWork
    ? "Vacancy asks for an existing, unrestricted right to work in the UK."
    : "No requirement for an existing unrestricted right to work was detected.";

  const restrictionSummary = wording.citizenshipRequired
    ? wording.securityRestriction
      ? "British/UK citizenship required, plus security clearance or vetting."
      : "British/UK citizenship required."
    : wording.securityRestriction
      ? "Security clearance or vetting required, which usually restricts nationality."
      : "No citizenship or security-clearance restriction detected.";

  const employerPart =
    match.status === "matched"
      ? `Employer appears on the UK sponsor register as "${match.entity}".`
      : match.status === "possible"
        ? `A similarly named organisation ("${match.entity}") is on the register, but the match needs review.`
        : match.status === "not_found"
          ? "Employer could not be matched on the current sponsor register."
          : "Employer licence status is unknown because no register dataset is loaded.";

  const conclusionTail =
    status === "no_sponsorship"
      ? wording.citizenshipRequired
        ? "This vacancy requires UK citizenship, so it is not suitable if you need sponsorship."
        : "This vacancy explicitly excludes sponsorship."
      : status === "confirmed"
        ? "The vacancy itself confirms sponsorship is available."
        : status === "likely"
          ? "Multiple positive signals exist, but the vacancy does not confirm sponsorship — treat it as Likely rather than guaranteed."
          : status === "possible"
            ? "No explicit sponsorship restriction was detected, but the vacancy does not confirm sponsorship. Treat sponsorship as Possible rather than guaranteed."
            : status === "unlikely"
              ? "The wording points away from sponsorship, though it is not a definitive exclusion."
              : "There is not enough evidence either way — worth checking with the employer before applying.";

  return {
    status,
    confidence,
    evidence,
    warnings,
    companyMatch: match,
    jobWordingSummary,
    workAuthorisationSummary,
    restrictionSummary,
    conclusion: `${employerPart} ${conclusionTail}`,
    citizenshipRequired: wording.citizenshipRequired,
    securityRestriction: wording.securityRestriction,
    explicitNoSponsorship: wording.explicitNoSponsorship,
  };
}

const SPONSORABLE_CATEGORIES = new Set([
  "Data Science", "Machine Learning", "AI Engineering", "MLOps", "Data Engineering",
  "Software Engineering", "Backend Engineering", "Cloud Engineering", "Solutions Engineering",
  "Solutions Architecture", "Platform Engineering", "Data Analytics",
]);

export function roleLooksSponsorable(category: string | null): boolean {
  return category ? SPONSORABLE_CATEGORIES.has(category) : false;
}
