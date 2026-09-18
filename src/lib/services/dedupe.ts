import { normalizeCompanyName, normalizeTitle, stableHash } from "./normalize";
import type { NormalizedJob } from "./normalize";

/**
 * Deduplication engine.
 *
 * Exact signals first (provider + external id, canonical URL, fingerprint), then
 * conservative fuzzy matching. A duplicate never destroys information: the
 * canonical job is kept and the alternative source is recorded separately.
 */

export interface ExistingJob {
  id: string;
  provider: string | null;
  provider_job_id: string | null;
  fingerprint: string | null;
  canonical_apply_url: string | null;
  normalized_title: string;
  city: string | null;
  company_id: string;
  normalized_company?: string | null;
  description_hash?: string | null;
}

export type DuplicateMatch = { job: ExistingJob; signal: string; confidence: number };

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

function stripUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function findDuplicate(
  job: NormalizedJob,
  existing: ExistingJob[],
  companyIdsForName?: Set<string>,
): DuplicateMatch | null {
  for (const e of existing) {
    if (e.provider === job.provider && e.provider_job_id && e.provider_job_id === job.providerJobId) {
      return { job: e, signal: "provider id", confidence: 100 };
    }
  }
  const url = stripUrl(job.applyUrl);
  if (url) {
    for (const e of existing) {
      if (stripUrl(e.canonical_apply_url) === url) {
        return { job: e, signal: "canonical URL", confidence: 98 };
      }
    }
  }
  for (const e of existing) {
    if (e.fingerprint && e.fingerprint === job.fingerprint) {
      return { job: e, signal: "company + title + location", confidence: 95 };
    }
  }
  // Fuzzy: same company, very similar title, compatible location.
  for (const e of existing) {
    const sameCompany =
      (e.normalized_company && e.normalized_company === job.normalizedCompany) ||
      (companyIdsForName?.has(e.company_id) ?? false);
    if (!sameCompany) continue;
    const titleScore = similarity(normalizeTitle(e.normalized_title), job.normalizedTitle);
    const locationOk =
      !e.city || !job.city || e.city.toLowerCase() === job.city.toLowerCase();
    if (titleScore >= 0.85 && locationOk) {
      return { job: e, signal: "similar title at same company", confidence: Math.round(titleScore * 90) };
    }
  }
  return null;
}

/** Removes duplicates inside a single scan batch before hitting the database. */
export function dedupeBatch(jobs: NormalizedJob[]): { unique: NormalizedJob[]; duplicates: number } {
  const seen = new Map<string, NormalizedJob>();
  let duplicates = 0;
  for (const job of jobs) {
    const key = stableHash(
      `${normalizeCompanyName(job.companyName)}|${job.normalizedTitle.toLowerCase()}|${job.city ?? job.locationText ?? ""}`,
    );
    const urlKey = stripUrl(job.applyUrl) ?? "";
    const composite = `${key}|${urlKey}`;
    if (seen.has(composite) || seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.set(composite, job);
    seen.set(key, job);
  }
  return { unique: [...new Set(seen.values())], duplicates };
}
