import { fetchJson, stripHtml, type JobSourceAdapter, type RawJob } from "./types";

interface RecruiteeOffer {
  id: number;
  title: string;
  slug?: string;
  department?: string | null;
  city?: string | null;
  country_code?: string | null;
  location?: string | null;
  description?: string | null;
  requirements?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  careers_url?: string | null;
  careers_apply_url?: string | null;
  employment_type_code?: string | null;
  remote?: boolean | null;
}

/** Recruitee public offers API: https://{company}.recruitee.com/api/offers/ */
export const recruiteeAdapter: JobSourceAdapter = {
  id: "recruitee",
  name: "Recruitee",
  enabled: true,
  experimental: false,
  identifierHint: "Company subdomain, e.g. acme.recruitee.com → acme",

  async fetchJobs({ identifier, since }) {
    const data = await fetchJson<{ offers?: RecruiteeOffer[] }>(
      `https://${encodeURIComponent(identifier)}.recruitee.com/api/offers/`,
    );
    const sinceMs = since ? new Date(since).getTime() : null;

    return (data.offers ?? [])
      .filter((o) => {
        if (!sinceMs) return true;
        const posted = o.published_at ?? o.created_at;
        return !posted || new Date(posted).getTime() >= sinceMs;
      })
      .map((o): RawJob => ({
        provider: "recruitee",
        providerJobId: String(o.id),
        companyName: identifier,
        title: o.title,
        department: o.department ?? null,
        locationText: o.location ?? ([o.city, o.country_code].filter(Boolean).join(", ") || null),
        workplaceType: o.remote ? "Remote" : null,
        employmentType: o.employment_type_code ?? null,
        description: stripHtml(`${o.description ?? ""} ${o.requirements ?? ""}`) || null,
        postedAt: o.published_at ?? o.created_at ?? null,
        applyUrl: o.careers_apply_url ?? o.careers_url ?? null,
        sourceUrl: o.careers_url ?? null,
      }));
  },
};
