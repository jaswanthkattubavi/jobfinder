import { fetchJson, stripHtml, type JobSourceAdapter, type RawJob } from "./types";

interface WorkableJob {
  id?: string;
  shortcode: string;
  title: string;
  department?: string | null;
  location?: { city?: string | null; region?: string | null; country?: string | null; telecommuting?: boolean };
  employment_type?: string | null;
  description?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  url?: string | null;
  application_url?: string | null;
}

/** Workable public board API: https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true */
export const workableAdapter: JobSourceAdapter = {
  id: "workable",
  name: "Workable",
  enabled: true,
  experimental: false,
  identifierHint: "Account slug from the employer's Workable board, e.g. apply.workable.com/acme → acme",

  async fetchJobs({ identifier, since }) {
    const data = await fetchJson<{ jobs?: WorkableJob[] }>(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(identifier)}?details=true`,
    );
    const sinceMs = since ? new Date(since).getTime() : null;

    return (data.jobs ?? [])
      .filter((j) => {
        if (!sinceMs) return true;
        const posted = j.published_on ?? j.created_at;
        return !posted || new Date(posted).getTime() >= sinceMs;
      })
      .map((j): RawJob => {
        const loc = [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(", ");
        return {
          provider: "workable",
          providerJobId: j.shortcode ?? j.id ?? j.title,
          companyName: identifier,
          title: j.title,
          department: j.department ?? null,
          locationText: loc || null,
          workplaceType: j.location?.telecommuting ? "Remote" : null,
          employmentType: j.employment_type ?? null,
          description: stripHtml(j.description) || null,
          postedAt: j.published_on ?? j.created_at ?? null,
          applyUrl: j.application_url ?? j.url ?? null,
          sourceUrl: j.url ?? null,
        };
      });
  },
};
