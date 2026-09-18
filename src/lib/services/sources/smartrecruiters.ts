import { fetchJson, stripHtml, type JobSourceAdapter, type RawJob } from "./types";

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  ref?: string;
  company?: { name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  department?: { label?: string };
  typeOfEmployment?: { label?: string };
}

interface SrDetail {
  jobAd?: {
    sections?: Record<string, { title?: string; text?: string } | undefined>;
  };
  applyUrl?: string;
  postingUrl?: string;
}

/** SmartRecruiters public postings API: https://api.smartrecruiters.com/v1/companies/{id}/postings */
export const smartRecruitersAdapter: JobSourceAdapter = {
  id: "smartrecruiters",
  name: "SmartRecruiters",
  enabled: true,
  experimental: false,
  identifierHint: "Company identifier from the employer's SmartRecruiters careers URL",

  async fetchJobs({ identifier, since, limit = 100 }) {
    const data = await fetchJson<{ content?: SrPosting[] }>(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings?limit=${Math.min(limit, 100)}`,
    );
    const sinceMs = since ? new Date(since).getTime() : null;
    const postings = (data.content ?? []).filter(
      (p) => !sinceMs || !p.releasedDate || new Date(p.releasedDate).getTime() >= sinceMs,
    );

    const results: RawJob[] = [];
    // Descriptions need one detail call each: keep it bounded and sequential so
    // we never hammer the provider.
    for (const p of postings.slice(0, 40)) {
      let description: string | null = null;
      let applyUrl: string | null = null;
      let postingUrl: string | null = null;
      try {
        const detail = await fetchJson<SrDetail>(
          `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings/${encodeURIComponent(p.id)}`,
        );
        const sections = Object.values(detail.jobAd?.sections ?? {});
        description =
          stripHtml(sections.map((s) => s?.text ?? "").join("\n")) || null;
        applyUrl = detail.applyUrl ?? null;
        postingUrl = detail.postingUrl ?? null;
      } catch {
        // Detail failure must not lose the posting itself.
      }
      const city = p.location?.city;
      const region = p.location?.region;
      results.push({
        provider: "smartrecruiters",
        providerJobId: p.id,
        companyName: p.company?.name ?? identifier,
        title: p.name,
        department: p.department?.label ?? null,
        locationText: [city, region, p.location?.country].filter(Boolean).join(", ") || null,
        workplaceType: p.location?.remote === true ? "Remote" : null,
        employmentType: p.typeOfEmployment?.label ?? null,
        description,
        postedAt: p.releasedDate ?? null,
        applyUrl:
          applyUrl ??
          postingUrl ??
          `https://jobs.smartrecruiters.com/${encodeURIComponent(identifier)}/${encodeURIComponent(p.id)}`,
        sourceUrl: postingUrl ?? null,
      });
    }
    return results;
  },
};
