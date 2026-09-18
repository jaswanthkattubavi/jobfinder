import { fetchJson, stripHtml, type JobSourceAdapter, type RawJob } from "./types";

interface GhJob {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  absolute_url: string;
  content?: string;
  location?: { name?: string };
  offices?: Array<{ name?: string }>;
  departments?: Array<{ name?: string }>;
  metadata?: Array<{ name?: string; value?: unknown }>;
}

/**
 * Greenhouse public job board API. Stable, documented and employer-hosted:
 * https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 */
export const greenhouseAdapter: JobSourceAdapter = {
  id: "greenhouse",
  name: "Greenhouse",
  enabled: true,
  experimental: false,
  identifierHint: "Board token from the employer's Greenhouse careers URL, e.g. 'monzo'",

  async fetchJobs({ identifier, since }) {
    const data = await fetchJson<{ jobs?: GhJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(identifier)}/jobs?content=true`,
    );
    const jobs = data.jobs ?? [];
    const sinceMs = since ? new Date(since).getTime() : null;

    return jobs
      .filter((j) => {
        if (!sinceMs) return true;
        const stamp = j.updated_at ?? j.first_published;
        return !stamp || new Date(stamp).getTime() >= sinceMs;
      })
      .map((j): RawJob => ({
        provider: "greenhouse",
        providerJobId: String(j.id),
        companyName: identifier,
        title: j.title,
        department: j.departments?.[0]?.name ?? null,
        locationText: j.location?.name ?? j.offices?.[0]?.name ?? null,
        description: stripHtml(j.content) || null,
        postedAt: j.first_published ?? null,
        updatedAt: j.updated_at ?? null,
        applyUrl: j.absolute_url,
        sourceUrl: j.absolute_url,
      }));
  },
};
