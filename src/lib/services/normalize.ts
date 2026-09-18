/**
 * Normalization. Pure, deterministic, no network, no invented values.
 *
 * The original title is always preserved; normalized values are stored beside
 * it. Anything we cannot determine from the provider's own data stays null so
 * the UI can show "unknown" honestly.
 */
import type { RawJob } from "./sources/types";

export type RemoteType = "Remote" | "Hybrid" | "On-site";

export interface NormalizedJob {
  provider: string;
  providerJobId: string;
  companyName: string;
  normalizedCompany: string;
  originalTitle: string;
  normalizedTitle: string;
  roleCategory: string | null;
  seniority: string | null;
  city: string | null;
  region: string | null;
  country: string;
  locationText: string | null;
  remoteType: RemoteType;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  description: string;
  descriptionHash: string;
  postedAt: string | null;
  department: string | null;
  team: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  fingerprint: string;
  isUkLocation: boolean;
  /** Which configured employer board this came from, when it came from one. */
  sourceId?: string | null;
  /** Other spellings of the employer name seen on the way in. */
  companyAliases?: string[];
}

const STOP_TITLE_PARTS =
  /\s*[-–—|(/,]\s*(global|emea|uk|united kingdom|london|remote|hybrid|contract|permanent|full[- ]time|part[- ]time|f\/m\/d|m\/f\/d|banking|technology|fixed term|maternity cover|\d{4}|graduate scheme).*$/i;
const LEVEL_SUFFIX = /\s+(i{1,3}|iv|v|[1-4])\b\.?$/i;

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ltd|limited|llp|llc|plc|inc|incorporated|corp|corporation|gmbh|group|holdings|uk|technologies|technology)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Order matters: clearly-senior wording wins over an early-career word that
// happens to appear in the same title.
const SENIORITY_RULES: Array<[RegExp, string]> = [
  [/\b(principal|staff|distinguished|head of|director|vp|vice president|chief|cto|c-level)\b/i, "Senior"],
  [/\b(senior|snr|sr\.?|lead|manager)\b/i, "Senior"],
  [
    /\b(graduate|graduate scheme|graduate programme|graduate program|grad scheme|new grad|university graduate|campus hire|placement|intern|internship|trainee|apprentice)\b/i,
    "Graduate",
  ],
  [/\b(junior|jr\.?|entry[- ]level|early[- ]career|early careers)\b/i, "Junior"],
  [/\bassociate\b/i, "Associate"],
  // "Engineer I", "Data Scientist 1" — the first rung, not a mid-level role.
  [/\s(i|1)\b\.?$/i, "Junior"],
  [/\b(ii|iii|iv|2|3)\b/, "Mid"],
];

export function detectSeniority(title: string): string | null {
  for (const [re, level] of SENIORITY_RULES) if (re.test(title)) return level;
  return null;
}

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b(mlops|ml ops|ml platform|model deployment)\b/i, "MLOps"],
  [/\b(machine learning|ml engineer|deep learning|nlp|computer vision)\b/i, "Machine Learning"],
  [/\b(ai engineer|applied ai|genai|generative ai|llm engineer|ai developer)\b/i, "AI Engineering"],
  [/\b(ai product|product manager, ai|genai product)\b/i, "AI Product"],
  [/\b(data scientist|applied scientist|research scientist|decision scientist)\b/i, "Data Science"],
  [/\b(analytics engineer|data engineer|etl|dbt|data platform)\b/i, "Data Engineering"],
  [/\b(data analyst|bi analyst|business intelligence|insight analyst|reporting analyst)\b/i, "Data Analytics"],
  [/\b(solutions architect|technical architect|cloud architect)\b/i, "Solutions Architecture"],
  [/\b(solutions engineer|sales engineer|pre-?sales|customer engineer|forward deployed)\b/i, "Solutions Engineering"],
  [/\b(cloud engineer|aws engineer|azure engineer|gcp engineer)\b/i, "Cloud Engineering"],
  [/\b(platform engineer|infrastructure engineer|devops|sre|site reliability)\b/i, "Platform Engineering"],
  [/\b(backend|back-end|back end|api engineer|python developer|java developer|golang)\b/i, "Backend Engineering"],
  [/\b(software engineer|software developer|full[- ]?stack|frontend|front-end|programmer)\b/i, "Software Engineering"],
];

export function detectRoleCategory(title: string, description = ""): string | null {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(title)) return cat;
  for (const [re, cat] of CATEGORY_RULES) if (re.test(description.slice(0, 1200))) return cat;
  return null;
}

export function normalizeTitle(title: string): string {
  return title
    .replace(STOP_TITLE_PARTS, "")
    .replace(
      /\b(senior|snr|sr\.?|junior|jr\.?|graduate|entry[- ]level|associate|lead|principal|staff|trainee|intern)\b/gi,
      " ",
    )
    .replace(LEVEL_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

const UK_CITIES = [
  "London", "Manchester", "Birmingham", "Bristol", "Leeds", "Edinburgh", "Glasgow",
  "Cambridge", "Oxford", "Reading", "Cardiff", "Belfast", "Newcastle", "Sheffield",
  "Nottingham", "Liverpool", "Brighton", "Leicester", "Southampton", "Milton Keynes",
];

const UK_MARKERS =
  /\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|britain|gb)\b/i;

export interface LocationResult {
  city: string | null;
  region: string | null;
  country: string;
  isUk: boolean;
  remoteHint: RemoteType | null;
}

/** UK location handling, including remote wording that must not be filtered out. */
export function normalizeLocation(text: string | null | undefined): LocationResult {
  const raw = (text ?? "").trim();
  if (!raw) return { city: null, region: null, country: "Unknown", isUk: false, remoteHint: null };

  const lower = raw.toLowerCase();
  const remoteHint: RemoteType | null = /\bremote\b/.test(lower)
    ? "Remote"
    : /\bhybrid\b/.test(lower)
      ? "Hybrid"
      : null;

  const cityMatch = UK_CITIES.find((c) => lower.includes(c.toLowerCase()));
  const greaterLondon = /\b(greater london|city of london|central london|london area)\b/.test(lower);
  const isUk = UK_MARKERS.test(lower) || Boolean(cityMatch) || greaterLondon;

  return {
    city: greaterLondon ? "London" : (cityMatch ?? null),
    region: greaterLondon ? "Greater London" : null,
    country: isUk ? "United Kingdom" : raw.split(",").pop()?.trim() || "Unknown",
    isUk,
    remoteHint,
  };
}

export function detectRemoteType(
  workplace: string | null | undefined,
  locationHint: RemoteType | null,
  description = "",
): RemoteType {
  const w = (workplace ?? "").toLowerCase();
  if (/remote/.test(w)) return "Remote";
  if (/hybrid/.test(w)) return "Hybrid";
  if (/onsite|on-site|in office|in-office/.test(w)) return "On-site";
  if (locationHint) return locationHint;
  if (/\bfully remote\b|\bremote[- ]first\b/i.test(description)) return "Remote";
  if (/\bhybrid\b/i.test(description)) return "Hybrid";
  return "On-site";
}

const SALARY_RE =
  /£\s?(\d{2,3}(?:,\d{3})?|\d{4,6})(?:\s?k)?\s*(?:-|–|to)\s*£?\s?(\d{2,3}(?:,\d{3})?|\d{4,6})(?:\s?k)?/i;

/** Only reads salary the posting actually states — never estimates one. */
export function extractSalary(
  description: string,
  given: { min?: number | null | undefined; max?: number | null | undefined },
): { min: number | null; max: number | null } {
  if (given.min || given.max) return { min: given.min ?? null, max: given.max ?? null };
  const m = SALARY_RE.exec(description);
  if (!m) return { min: null, max: null };
  const toNumber = (v: string) => {
    const n = Number(v.replace(/,/g, ""));
    return n < 1000 ? n * 1000 : n;
  };
  const min = toNumber(m[1]!);
  const max = toNumber(m[2]!);
  if (min < 8000 || max > 500_000 || max < min) return { min: null, max: null };
  return { min, max };
}

export function normalizeEmploymentType(value: string | null | undefined, description = ""): string {
  const v = `${value ?? ""} ${description.slice(0, 400)}`.toLowerCase();
  if (/\bintern(ship)?\b/.test(v)) return "Internship";
  if (/\bcontract|fixed[- ]term|temporary\b/.test(v)) return "Contract";
  if (/\bpart[- ]time\b/.test(v)) return "Part-time";
  return "Full-time";
}

/** Small, stable, dependency-free hash used for fingerprints and change detection. */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 + c) * 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function jobFingerprint(company: string, title: string, location: string): string {
  return stableHash(
    `${normalizeCompanyName(company)}|${normalizeTitle(title).toLowerCase()}|${location.toLowerCase().trim()}`,
  );
}

/**
 * Canonical apply URL priority:
 * employer careers page > ATS application page > trusted provider > intermediary.
 */
export function canonicalApplyUrl(raw: RawJob): string | null {
  const candidates = [raw.applyUrl, raw.sourceUrl].filter(Boolean) as string[];
  if (candidates.length === 0) return null;
  const atsRank = (url: string) => {
    if (/greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com/i.test(url)) return 1;
    if (/linkedin\.com|indeed\.|glassdoor\./i.test(url)) return 3;
    return 2;
  };
  return [...candidates].sort((a, b) => atsRank(a) - atsRank(b))[0]!;
}

export function normalizeJob(raw: RawJob): NormalizedJob {
  const description = (raw.description ?? "").trim();
  const loc = normalizeLocation(raw.locationText);
  const remoteType = detectRemoteType(raw.workplaceType, loc.remoteHint, description);
  const salary = extractSalary(description, { min: raw.salaryMin, max: raw.salaryMax });
  const normalizedTitle = normalizeTitle(raw.title) || raw.title;
  const locKey = loc.city ?? (remoteType === "Remote" && loc.isUk ? "uk remote" : (raw.locationText ?? "unknown"));

  return {
    provider: raw.provider,
    providerJobId: raw.providerJobId,
    companyName: raw.companyName,
    normalizedCompany: normalizeCompanyName(raw.companyName),
    originalTitle: raw.title,
    normalizedTitle,
    roleCategory: detectRoleCategory(raw.title, description),
    seniority: detectSeniority(raw.title),
    city: loc.city,
    region: loc.region,
    country: loc.country,
    locationText: raw.locationText ?? null,
    remoteType,
    employmentType: normalizeEmploymentType(raw.employmentType, description),
    salaryMin: salary.min,
    salaryMax: salary.max,
    currency: raw.currency ?? "GBP",
    description,
    descriptionHash: stableHash(description || raw.title),
    // Unknown posting dates stay unknown — never "today".
    postedAt: raw.postedAt ?? null,
    department: raw.department ?? null,
    team: raw.team ?? null,
    applyUrl: canonicalApplyUrl(raw),
    sourceUrl: raw.sourceUrl ?? raw.applyUrl ?? null,
    fingerprint: jobFingerprint(raw.companyName, raw.title, String(locKey)),
    isUkLocation: loc.isUk || (remoteType === "Remote" && /uk|united kingdom|england/i.test(raw.locationText ?? "")),
  };
}
