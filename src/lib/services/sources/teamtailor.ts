import { fetchJson, stripHtml, type JobSourceAdapter, type RawJob } from "./types";

interface TeamtailorFeedJob {
  id?: string | number;
  title: string;
  url?: string | null;
  careersite_job_url?: string | null;
  department?: string | null;
  location?: string | null;
  body?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  remote_status?: string | null;
}

/**
 * Teamtailor public careers-site JSON feed:
 * https://{subdomain}.teamtailor.com/jobs.json
 * Public and unauthenticated on career sites that expose it; when a board does
 * not expose it, validation fails and the company is reported as needing
 * configuration rather than guessed at.
 */
export const teamtailorAdapter: JobSourceAdapter = {
  id: "teamtailor",
  name: "Teamtailor",
  enabled: true,
  experimental: false,
  identifierHint: "Careers-site subdomain, e.g. acme.teamtailor.com → acme",

  async fetchJobs({ identifier, since }) {
    const data = await fetchJson<TeamtailorFeedJob[] | { jobs?: TeamtailorFeedJob[] }>(
      `https://${encodeURIComponent(identifier)}.teamtailor.com/jobs.json`,
    );
    const jobs = Array.isArray(data) ? data : (data.jobs ?? []);
    const sinceMs = since ? new Date(since).getTime() : null;

    return jobs
      .filter((j) => {
        if (!sinceMs) return true;
        const posted = j.created_at ?? j.updated_at;
        return !posted || new Date(posted).getTime() >= sinceMs;
      })
      .map((j): RawJob => ({
        provider: "teamtailor",
        providerJobId: String(j.id ?? j.title),
        companyName: identifier,
        title: j.title,
        department: j.department ?? null,
        locationText: j.location ?? null,
        workplaceType: j.remote_status ?? null,
        description: stripHtml(j.body) || null,
        postedAt: j.created_at ?? j.updated_at ?? null,
        applyUrl: j.careersite_job_url ?? j.url ?? null,
        sourceUrl: j.careersite_job_url ?? j.url ?? null,
      }));
  },
};
