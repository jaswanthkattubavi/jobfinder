import { stripHtml, SourceError, type JobSourceAdapter, type RawJob } from "./types";

/**
 * Personio public XML job feed: https://{company}.jobs.personio.com/xml
 * Personio publishes XML only, so this adapter parses the feed with regular
 * expressions rather than pulling in a DOM parser that is unavailable in the
 * server runtime. Anything the feed does not state stays null.
 */
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m || !m[1]) return null;
  const value = m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  return value || null;
}

export const personioAdapter: JobSourceAdapter = {
  id: "personio",
  name: "Personio",
  enabled: true,
  experimental: false,
  identifierHint: "Careers subdomain, e.g. acme.jobs.personio.com → acme",

  async fetchJobs({ identifier, since }) {
    const url = `https://${encodeURIComponent(identifier)}.jobs.personio.com/xml`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new SourceError(`Request failed: ${(err as Error).message}`);
    }
    if (!res.ok) throw new SourceError(`Provider returned ${res.status}`, res.status, res.status === 429);
    const xml = await res.text();
    if (!/<position/i.test(xml)) throw new SourceError("Feed did not contain any positions");

    const sinceMs = since ? new Date(since).getTime() : null;
    const blocks = xml.match(/<position>[\s\S]*?<\/position>/gi) ?? [];

    return blocks
      .map((block): RawJob | null => {
        const id = tag(block, "id");
        const title = tag(block, "name");
        if (!id || !title) return null;
        const created = tag(block, "createdAt");
        if (sinceMs && created && new Date(created).getTime() < sinceMs) return null;
        const office = tag(block, "office");
        const description = stripHtml(
          (block.match(/<value>[\s\S]*?<\/value>/gi) ?? []).join(" "),
        );
        return {
          provider: "personio",
          providerJobId: id,
          companyName: identifier,
          title,
          department: tag(block, "department"),
          locationText: office,
          employmentType: tag(block, "employmentType"),
          description: description || null,
          postedAt: created,
          applyUrl: `https://${identifier}.jobs.personio.com/job/${id}`,
          sourceUrl: `https://${identifier}.jobs.personio.com/job/${id}`,
        };
      })
      .filter((j): j is RawJob => j !== null);
  },
};
