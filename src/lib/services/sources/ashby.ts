import { fetchJson, stripHtml, type JobSourceAdapter, type RawJob } from "./types";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  department?: string;
  team?: string;
  isRemote?: boolean;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  updatedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  employmentType?: string;
  compensation?: {
    compensationTierSummary?: string;
    summaryComponents?: Array<{ minValue?: number; maxValue?: number; currencyCode?: string }>;
  };
}

/**
 * Ashby publishes a structured job-board API for public boards, so we use that
 * rather than scraping the DOM:
 * https://api.ashbyhq.com/posting-api/job-board/{boardName}
 */
export const ashbyAdapter: JobSourceAdapter = {
  id: "ashby",
  name: "Ashby",
  enabled: true,
  experimental: false,
  identifierHint: "Board name from the employer's Ashby board URL, e.g. 'ramp'",

  async fetchJobs({ identifier, since }) {
    const data = await fetchJson<{ jobs?: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(identifier)}?includeCompensation=true`,
    );
    const sinceMs = since ? new Date(since).getTime() : null;

    return (data.jobs ?? [])
      .filter((j) => {
        if (!sinceMs) return true;
        const stamp = j.updatedAt ?? j.publishedAt;
        return !stamp || new Date(stamp).getTime() >= sinceMs;
      })
      .map((j): RawJob => {
        const pay = j.compensation?.summaryComponents?.[0];
        return {
          provider: "ashby",
          providerJobId: j.id,
          companyName: identifier,
          title: j.title,
          department: j.department ?? null,
          team: j.team ?? null,
          locationText: j.location ?? j.secondaryLocations?.[0]?.location ?? null,
          workplaceType: j.isRemote === true ? "Remote" : null,
          employmentType: j.employmentType ?? null,
          description: j.descriptionPlain ?? stripHtml(j.descriptionHtml) ?? null,
          postedAt: j.publishedAt ?? null,
          updatedAt: j.updatedAt ?? null,
          applyUrl: j.applyUrl ?? j.jobUrl ?? null,
          sourceUrl: j.jobUrl ?? null,
          salaryMin: pay?.minValue ?? null,
          salaryMax: pay?.maxValue ?? null,
          currency: pay?.currencyCode ?? null,
        };
      });
  },
};
