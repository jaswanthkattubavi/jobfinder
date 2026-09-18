/**
 * Job source adapter contract.
 *
 * Every discovery integration returns `RawJob`s in this shape and nothing else.
 * Provider quirks stay inside the adapter; normalization, deduplication,
 * verification, filtering, scoring and storage are shared downstream steps.
 *
 * Rule: never invent a value. Anything the provider does not tell us stays
 * `null`/`undefined` so it can be stored as unknown.
 */

export type SourceProvider =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "teamtailor"
  | "recruitee"
  | "personio"
  | "workday"
  | "search_provider";

export interface RawJob {
  provider: SourceProvider;
  /** Provider's own job id — the strongest duplicate signal. */
  providerJobId: string;
  companyName: string;
  title: string;
  department?: string | null;
  team?: string | null;
  locationText?: string | null;
  /** Provider's own words for remote/hybrid/on-site, if any. */
  workplaceType?: string | null;
  description?: string | null;
  /** ISO string, or null when the provider does not publish a posting date. */
  postedAt?: string | null;
  updatedAt?: string | null;
  /** Where a human applies. Employer/ATS hosted whenever possible. */
  applyUrl?: string | null;
  /** Where we found it (listing page or API record). */
  sourceUrl?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  employmentType?: string | null;
}

export interface JobSearchParams {
  /** Board token / company slug / tenant config, per provider. */
  identifier: string;
  /** Incremental scanning: skip anything the provider says is older. */
  since?: string | null;
  /** Generated from the user's target roles — used by search providers. */
  queries?: string[];
  locations?: string[];
  limit?: number;
}

export interface JobSourceAdapter {
  id: SourceProvider;
  name: string;
  /** Whether the adapter itself can run. False = honestly not connected. */
  enabled: boolean;
  experimental: boolean;
  /** Plain-language hint shown in the source configuration form. */
  identifierHint: string;
  fetchJobs(params: JobSearchParams): Promise<RawJob[]>;
}

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly rateLimited = false,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Shared fetch with timeout, one bounded retry and rate-limit awareness. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 800));
      return fetchJson<T>(url, init, attempt + 1);
    }
    throw new SourceError(`Request failed: ${(err as Error).message}`);
  }

  if (res.status === 429 || res.status >= 500) {
    if (attempt < 1) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      await new Promise((r) => setTimeout(r, Math.min(retryAfter * 1000 || 1200, 5000)));
      return fetchJson<T>(url, init, attempt + 1);
    }
    throw new SourceError(`Provider returned ${res.status}`, res.status, res.status === 429);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SourceError(
      `Provider returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}
