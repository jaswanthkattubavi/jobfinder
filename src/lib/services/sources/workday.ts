import { fetchJson, stripHtml, SourceError, type JobSourceAdapter, type RawJob } from "./types";

interface WdJob {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

/**
 * Workday, deliberately conservative.
 *
 * Workday deployments differ per employer, so there is no universal scraper and
 * we do not pretend otherwise. A source must supply its own host/tenant/site
 * ("host|tenant|site"), and the configuration is only activated when a real test
 * request succeeds. Treated as experimental everywhere in the UI.
 */
export const workdayAdapter: JobSourceAdapter = {
  id: "workday",
  name: "Workday",
  enabled: true,
  experimental: true,
  identifierHint: "host|tenant|site — e.g. 'company.wd3.myworkdayjobs.com|company|External'",

  async fetchJobs({ identifier, limit = 50 }) {
    const [host, tenant, site] = identifier.split("|").map((p) => p.trim());
    if (!host || !tenant || !site) {
      throw new SourceError(
        "Workday needs three parts: host|tenant|site (each employer configures its own).",
      );
    }

    const endpoint = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    const data = await fetchJson<{ jobPostings?: WdJob[] }>(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: Math.min(limit, 20), offset: 0, searchText: "" }),
    });

    return (data.jobPostings ?? []).map((j): RawJob => {
      const path = j.externalPath ?? "";
      const url = path ? `https://${host}/en-US/${site}${path}` : null;
      return {
        provider: "workday",
        providerJobId: path || (j.title ?? "unknown"),
        companyName: tenant,
        title: j.title ?? "Unknown role",
        locationText: j.locationsText ?? null,
        // Workday's list endpoint gives relative wording ("Posted 3 Days Ago"),
        // never a real timestamp — so posting date stays unknown.
        postedAt: null,
        description: stripHtml(j.bulletFields?.join(" ")) || null,
        applyUrl: url,
        sourceUrl: url,
      };
    });
  },
};
