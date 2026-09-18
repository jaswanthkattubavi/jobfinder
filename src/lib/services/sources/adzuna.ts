import { fetchJson, stripHtml, SourceError, type RawJob } from "./types";

/**
 * Adzuna UK job search — the supplementary "general discovery" layer.
 *
 * Adzuna publishes a documented, authorised search API (no scraping), which is
 * why it is used here. It stays honestly disconnected until real credentials
 * exist server-side: there is no canned data and no simulated success.
 *
 * Credentials: ADZUNA_APP_ID and ADZUNA_APP_KEY (free developer keys).
 */

const BASE = "https://api.adzuna.com/v1/api/jobs/gb/search";

export interface AdzunaConfig {
  connected: boolean;
  appId: string | null;
  appKey: string | null;
}

export function adzunaConfig(): AdzunaConfig {
  const appId = process.env["ADZUNA_APP_ID"] ?? null;
  const appKey = process.env["ADZUNA_APP_KEY"] ?? null;
  return { connected: Boolean(appId && appKey), appId, appKey };
}

interface AdzunaResult {
  id?: string | number;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  contract_type?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  category?: { label?: string };
}

interface AdzunaResponse {
  count?: number;
  results?: AdzunaResult[];
}

function url(params: Record<string, string>): string {
  const cfg = adzunaConfig();
  const u = new URL(`${BASE}/1`);
  u.searchParams.set("app_id", cfg.appId!);
  u.searchParams.set("app_key", cfg.appKey!);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** One live call with the smallest possible payload — used by Test connection. */
export async function adzunaProbe(): Promise<{ ok: boolean; total: number; message: string }> {
  const cfg = adzunaConfig();
  if (!cfg.connected) {
    return {
      ok: false,
      total: 0,
      message: "Not connected — ADZUNA_APP_ID and ADZUNA_APP_KEY are required.",
    };
  }
  try {
    const data = await fetchJson<AdzunaResponse>(
      url({ results_per_page: "1", what: "software engineer", where: "London", "content-type": "application/json" }),
    );
    return {
      ok: true,
      total: Number(data.count ?? 0),
      message: `Connected — Adzuna reports ${Number(data.count ?? 0).toLocaleString("en-GB")} matching UK vacancies for a sample search.`,
    };
  } catch (err) {
    return { ok: false, total: 0, message: (err as Error).message };
  }
}

/**
 * Bounded search: a handful of the user's own role queries, UK only, recent
 * postings only. Never the whole index.
 */
export async function adzunaSearch(params: {
  queries: string[];
  locations: string[];
  maxQueries?: number;
  perQuery?: number;
  maxDaysOld?: number;
}): Promise<RawJob[]> {
  const cfg = adzunaConfig();
  if (!cfg.connected) {
    throw new SourceError("Adzuna general search is not connected (missing ADZUNA_APP_ID / ADZUNA_APP_KEY).");
  }

  const where = params.locations[0] ?? "United Kingdom";
  const perQuery = Math.min(50, Math.max(5, params.perQuery ?? 20));
  const queries = params.queries.slice(0, Math.min(10, Math.max(1, params.maxQueries ?? 8)));
  const out: RawJob[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    let payload: AdzunaResponse;
    try {
      payload = await fetchJson<AdzunaResponse>(
        url({
          results_per_page: String(perQuery),
          what_phrase: query,
          where,
          max_days_old: String(params.maxDaysOld ?? 21),
          "content-type": "application/json",
        }),
      );
    } catch (err) {
      // One failing query never kills general discovery.
      if (out.length > 0) continue;
      throw err;
    }

    for (const r of payload.results ?? []) {
      const company = r.company?.display_name?.trim();
      const title = r.title?.trim();
      const applyUrl = r.redirect_url ?? null;
      const id = String(r.id ?? applyUrl ?? "");
      if (!company || !title || !applyUrl || !id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        provider: "search_provider",
        providerJobId: id,
        companyName: company,
        title: stripHtml(title),
        locationText: r.location?.display_name ?? ((r.location?.area ?? []).join(", ") || null),
        // Adzuna returns a snippet, not the full advert. Kept as-is and never
        // presented as a complete job description.
        description: stripHtml(r.description) || null,
        postedAt: r.created ?? null,
        applyUrl,
        sourceUrl: applyUrl,
        salaryMin: typeof r.salary_min === "number" ? r.salary_min : null,
        salaryMax: typeof r.salary_max === "number" ? r.salary_max : null,
        currency: typeof r.salary_min === "number" ? "GBP" : null,
        employmentType: r.contract_time ?? r.contract_type ?? null,
      });
    }
    await new Promise((res) => setTimeout(res, 250));
  }

  return out;
}
