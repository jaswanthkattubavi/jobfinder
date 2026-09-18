import { fetchJson, stripHtml, SourceError, type JobSourceAdapter, type RawJob } from "./types";
import { adzunaConfig, adzunaProbe, adzunaSearch } from "./adzuna";

/**
 * General job discovery — vacancies from employers that are not in the
 * monitored employer library.
 *
 * Preferred provider: Adzuna's documented UK search API (ADZUNA_APP_ID +
 * ADZUNA_APP_KEY). A generic structured endpoint is supported as a fallback
 * (JOB_SEARCH_API_KEY + JOB_SEARCH_API_URL).
 *
 * There is no scraping of platforms whose terms forbid it, and no canned data:
 * without credentials this layer reports "not connected" and returns nothing.
 */
export function searchProviderConfig() {
  const adzuna = adzunaConfig();
  if (adzuna.connected) {
    return {
      connected: true,
      kind: "adzuna" as const,
      name: "Adzuna UK job search",
      endpoint: "https://api.adzuna.com/v1/api/jobs/gb/search",
      apiKey: adzuna.appKey,
      requiredSecrets: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
    };
  }
  const apiKey = process.env["JOB_SEARCH_API_KEY"] ?? null;
  return {
    connected: Boolean(apiKey),
    kind: "generic" as const,
    name: process.env["JOB_SEARCH_PROVIDER_NAME"] ?? "Adzuna UK job search",
    endpoint: process.env["JOB_SEARCH_API_URL"] ?? null,
    apiKey,
    requiredSecrets: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  };
}

/** Live connection test. Never reports success without a real provider reply. */
export async function testGeneralSearch(): Promise<{ ok: boolean; message: string; provider: string }> {
  const cfg = searchProviderConfig();
  if (cfg.kind === "adzuna") {
    const probe = await adzunaProbe();
    return { ok: probe.ok, message: probe.message, provider: cfg.name };
  }
  if (!cfg.connected || !cfg.endpoint) {
    return {
      ok: false,
      provider: "Adzuna UK job search",
      message:
        "Not connected. Add ADZUNA_APP_ID and ADZUNA_APP_KEY (free developer keys from developer.adzuna.com) to switch general discovery on.",
    };
  }
  try {
    const u = new URL(cfg.endpoint);
    u.searchParams.set("query", "software engineer United Kingdom");
    await fetchJson(u.toString(), {
      headers: { "x-api-key": cfg.apiKey!, authorization: `Bearer ${cfg.apiKey!}` },
    });
    return { ok: true, provider: cfg.name, message: `Connected — ${cfg.name} answered a live test search.` };
  } catch (err) {
    return { ok: false, provider: cfg.name, message: (err as Error).message };
  }
}

interface GenericResult {
  id?: string;
  job_id?: string;
  title?: string;
  job_title?: string;
  company?: string;
  employer_name?: string;
  company_name?: string;
  location?: string;
  job_location?: string;
  description?: string;
  job_description?: string;
  posted_at?: string;
  job_posted_at_datetime_utc?: string;
  url?: string;
  job_apply_link?: string;
  apply_url?: string;
  employment_type?: string;
  salary_min?: number;
  salary_max?: number;
  currency?: string;
}

export const searchProviderAdapter: JobSourceAdapter = {
  id: "search_provider",
  name: "General job search",
  get enabled() {
    return searchProviderConfig().connected;
  },
  experimental: false,
  identifierHint: "No identifier needed — configure the provider credentials server-side",

  async fetchJobs({ queries = [], locations = [], limit = 30 }) {
    const cfg = searchProviderConfig();
    if (!cfg.connected) {
      throw new SourceError(
        "General job search is not connected. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to enable it.",
      );
    }
    if (cfg.kind === "adzuna") {
      return adzunaSearch({ queries, locations, perQuery: limit });
    }
    if (!cfg.endpoint) {
      throw new SourceError("General job search: an API key is stored but no endpoint is configured.");
    }

    const out: RawJob[] = [];
    const location = locations[0] ?? "United Kingdom";
    for (const query of queries.slice(0, 6)) {
      const url = new URL(cfg.endpoint);
      url.searchParams.set("query", `${query} ${location}`);
      url.searchParams.set("page", "1");
      let payload: { data?: GenericResult[]; results?: GenericResult[] };
      try {
        payload = await fetchJson(url.toString(), {
          headers: { "x-api-key": cfg.apiKey!, authorization: `Bearer ${cfg.apiKey!}` },
        });
      } catch (err) {
        if (out.length > 0) break;
        throw err;
      }
      const rows = payload.data ?? payload.results ?? [];
      for (const r of rows.slice(0, limit)) {
        const applyUrl = r.job_apply_link ?? r.apply_url ?? r.url ?? null;
        const company = r.employer_name ?? r.company_name ?? r.company;
        const title = r.job_title ?? r.title;
        if (!applyUrl || !company || !title) continue;
        out.push({
          provider: "search_provider",
          providerJobId: String(r.job_id ?? r.id ?? applyUrl),
          companyName: company,
          title,
          locationText: r.job_location ?? r.location ?? null,
          description: stripHtml(r.job_description ?? r.description) || null,
          postedAt: r.job_posted_at_datetime_utc ?? r.posted_at ?? null,
          applyUrl,
          sourceUrl: r.url ?? applyUrl,
          employmentType: r.employment_type ?? null,
          salaryMin: r.salary_min ?? null,
          salaryMax: r.salary_max ?? null,
          currency: r.currency ?? null,
        });
      }
    }
    return out;
  },
};
