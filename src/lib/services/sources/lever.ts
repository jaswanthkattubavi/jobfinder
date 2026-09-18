import { fetchJson, stripHtml, type JobSourceAdapter, type RawJob } from "./types";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  descriptionPlain?: string;
  description?: string;
  workplaceType?: string;
  categories?: {
    team?: string;
    department?: string;
    location?: string;
    commitment?: string;
    allLocations?: string[];
  };
}

/** Lever public postings API: https://api.lever.co/v0/postings/{company}?mode=json */
export const leverAdapter: JobSourceAdapter = {
  id: "lever",
  name: "Lever",
  enabled: true,
  experimental: false,
  identifierHint: "Company slug from the employer's Lever board URL, e.g. 'wise'",

  async fetchJobs({ identifier, since }) {
    const postings = await fetchJson<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(identifier)}?mode=json`,
    );
    const sinceMs = since ? new Date(since).getTime() : null;

    return (postings ?? [])
      .filter((p) => !sinceMs || !p.createdAt || p.createdAt >= sinceMs)
      .map((p): RawJob => ({
        provider: "lever",
        providerJobId: p.id,
        companyName: identifier,
        title: p.text,
        team: p.categories?.team ?? null,
        department: p.categories?.department ?? null,
        locationText: p.categories?.location ?? p.categories?.allLocations?.[0] ?? null,
        workplaceType: p.workplaceType ?? null,
        employmentType: p.categories?.commitment ?? null,
        description: p.descriptionPlain ?? stripHtml(p.description) ?? null,
        postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        applyUrl: p.applyUrl ?? p.hostedUrl ?? null,
        sourceUrl: p.hostedUrl ?? null,
      }));
  },
};
