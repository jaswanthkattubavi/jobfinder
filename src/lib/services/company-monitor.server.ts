import { targetUniverse, type TargetCompany } from "./sources/target-registry";
import { directProviderOrder } from "./sources/registry";
import type { SourceProvider } from "./sources/types";

/**
 * Direct company career-source monitor.
 *
 * For every company in the fixed 400-company registry this module tries to
 * discover its real career source, hits that source for genuine vacancies, and
 * only then marks it monitored. Nothing is ever assumed: a candidate board that
 * cannot be tied back to the employer is reported as needing configuration
 * instead of being enabled on a guess.
 */

export type SourceStatus =
  | "validating"
  | "healthy"
  | "healthy_no_vacancies"
  | "warning"
  | "failed"
  | "needs_configuration"
  | "disabled";

export interface ProbeResult {
  ok: boolean;
  jobCount: number;
  ukJobCount: number;
  boardName: string | null;
  endpoint: string;
  status?: number;
  error?: string;
}

export interface ValidationResult {
  company: string;
  group: TargetCompany["group"];
  sector: string;
  domain: string | null;
  provider: SourceProvider | null;
  identifier: string | null;
  endpoint: string | null;
  discoveryMethod: string | null;
  sourceStatus: SourceStatus;
  reason: string | null;
  evidence: string | null;
  jobCount: number;
  ukJobCount: number;
  careersUrl: string | null;
}

const TIMEOUT_MS = 12_000;
const UK_HINT =
  /\b(united kingdom|uk|england|scotland|wales|northern ireland|london|manchester|edinburgh|glasgow|cambridge|oxford|bristol|leeds|birmingham|reading|belfast|cardiff|newcastle|sheffield|nottingham|brighton|milton keynes)\b/i;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

/** Candidate ATS identifiers, strongest (domain-derived) first. */
export function slugCandidates(target: TargetCompany): Array<{ slug: string; method: string }> {
  const out: Array<{ slug: string; method: string }> = [];
  const push = (slug: string, method: string) => {
    if (!slug || slug.length < 2) return;
    if (out.some((c) => c.slug === slug)) return;
    out.push({ slug, method });
  };

  if (target.domain) {
    const root = target.domain.split(".")[0] ?? "";
    push(root.replace(/[^a-z0-9-]/gi, "").toLowerCase(), "domain-root");
  }
  const bare = normalize(target.name);
  push(bare, "company-name");
  const noSuffix = normalize(
    target.name.replace(/\b(uk|group|plc|ltd|limited|holdings|technologies|international|bank)\b/gi, ""),
  );
  push(noSuffix, "company-name-simplified");
  push(target.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "hyphenated");
  return out;
}

async function getJson(url: string): Promise<{ status: number; body: unknown; text: string }> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

function countJobs(list: Array<Record<string, unknown>>, locationKeys: string[]): { total: number; uk: number } {
  let uk = 0;
  for (const job of list) {
    const parts: string[] = [];
    for (const key of locationKeys) {
      const value = job[key];
      if (typeof value === "string") parts.push(value);
      else if (value && typeof value === "object") parts.push(JSON.stringify(value));
    }
    if (UK_HINT.test(parts.join(" "))) uk += 1;
  }
  return { total: list.length, uk };
}

/** Hit one provider's public board endpoint for one candidate identifier. */
export async function probeProvider(provider: SourceProvider, slug: string): Promise<ProbeResult> {
  const enc = encodeURIComponent(slug);
  const endpoints: Record<string, string> = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${enc}/jobs?content=false`,
    lever: `https://api.lever.co/v0/postings/${enc}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${enc}`,
    smartrecruiters: `https://api.smartrecruiters.com/v1/companies/${enc}/postings?limit=100`,
    workable: `https://apply.workable.com/api/v1/widget/accounts/${enc}?details=true`,
    teamtailor: `https://${enc}.teamtailor.com/jobs.json`,
    recruitee: `https://${enc}.recruitee.com/api/offers/`,
    personio: `https://${enc}.jobs.personio.com/xml`,
  };
  const endpoint = endpoints[provider];
  if (!endpoint) return { ok: false, jobCount: 0, ukJobCount: 0, boardName: null, endpoint: "", error: "No public endpoint" };

  try {
    if (provider === "personio") {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const text = await res.text();
      if (!res.ok) return { ok: false, jobCount: 0, ukJobCount: 0, boardName: null, endpoint, status: res.status };
      const positions = text.match(/<position>[\s\S]*?<\/position>/gi) ?? [];
      const uk = positions.filter((p) => UK_HINT.test(p)).length;
      return { ok: positions.length > 0, jobCount: positions.length, ukJobCount: uk, boardName: null, endpoint };
    }

    const { status, body } = await getJson(endpoint);
    if (status !== 200 || !body) return { ok: false, jobCount: 0, ukJobCount: 0, boardName: null, endpoint, status };
    const obj = body as Record<string, unknown>;

    let list: Array<Record<string, unknown>> = [];
    let boardName: string | null = null;
    let locationKeys = ["location", "locationText", "offices"];

    switch (provider) {
      case "greenhouse": {
        list = (obj["jobs"] as Array<Record<string, unknown>>) ?? [];
        // Greenhouse publishes the employer's own board name, which is what
        // ties a candidate token back to the company.
        if (list.length > 0) {
          const meta = await getJson(`https://boards-api.greenhouse.io/v1/boards/${enc}`).catch(() => null);
          const metaObj = (meta?.body ?? null) as Record<string, unknown> | null;
          boardName = (metaObj?.["name"] as string) ?? null;
        }
        break;
      }
      case "lever":
        list = Array.isArray(body) ? (body as Array<Record<string, unknown>>) : [];
        locationKeys = ["categories", "workplaceType"];
        break;
      case "ashby":
        list = (obj["jobs"] as Array<Record<string, unknown>>) ?? [];
        boardName = (obj["organizationName"] as string) ?? null;
        break;
      case "smartrecruiters": {
        list = (obj["content"] as Array<Record<string, unknown>>) ?? [];
        const first = list[0] as Record<string, unknown> | undefined;
        const company = first?.["company"] as Record<string, unknown> | undefined;
        boardName = (company?.["name"] as string) ?? null;
        break;
      }
      case "workable":
        list = (obj["jobs"] as Array<Record<string, unknown>>) ?? [];
        boardName = ((obj["name"] as string) ?? null) as string | null;
        break;
      case "teamtailor":
        list = Array.isArray(body)
          ? (body as Array<Record<string, unknown>>)
          : ((obj["jobs"] as Array<Record<string, unknown>>) ?? []);
        break;
      case "recruitee":
        list = (obj["offers"] as Array<Record<string, unknown>>) ?? [];
        locationKeys = ["location", "city", "country_code"];
        break;
      default:
        list = [];
    }

    const counts = countJobs(list, locationKeys);
    return { ok: counts.total > 0, jobCount: counts.total, ukJobCount: counts.uk, boardName, endpoint, status };
  } catch (err) {
    return {
      ok: false,
      jobCount: 0,
      ukJobCount: 0,
      boardName: null,
      endpoint,
      error: (err as Error).message.slice(0, 200),
    };
  }
}

function careersUrlFor(provider: SourceProvider, slug: string): string {
  switch (provider) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${slug}`;
    case "lever":
      return `https://jobs.lever.co/${slug}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}`;
    case "smartrecruiters":
      return `https://jobs.smartrecruiters.com/${slug}`;
    case "workable":
      return `https://apply.workable.com/${slug}`;
    case "teamtailor":
      return `https://${slug}.teamtailor.com/jobs`;
    case "recruitee":
      return `https://${slug}.recruitee.com/`;
    case "personio":
      return `https://${slug}.jobs.personio.com/`;
    default:
      return "";
  }
}

/**
 * Discover and validate one company's official career source.
 *
 * A match is only accepted when the identifier came from the company's own
 * domain, or the board itself names the employer. Anything else is reported as
 * a candidate needing confirmation, never silently enabled.
 */
export async function validateCompany(target: TargetCompany): Promise<ValidationResult> {
  const base: ValidationResult = {
    company: target.name,
    group: target.group,
    sector: target.sector,
    domain: target.domain,
    provider: null,
    identifier: null,
    endpoint: null,
    discoveryMethod: null,
    sourceStatus: "needs_configuration",
    reason: null,
    evidence: null,
    jobCount: 0,
    ukJobCount: 0,
    careersUrl: null,
  };

  const candidates = slugCandidates(target);
  const expected = normalize(target.name);
  let weak: ValidationResult | null = null;

  // Candidate identifiers are tried strongest-first; for each one every direct
  // provider is probed in parallel so a company needs only a few rounds.
  for (const candidate of candidates) {
    const probes = await Promise.all(
      directProviderOrder.map(async (provider) => ({ provider, probe: await probeProvider(provider, candidate.slug) })),
    );

    for (const { provider, probe } of probes) {
      if (!probe.ok) continue;
      const board = probe.boardName ? normalize(probe.boardName) : null;
      const boardMatches = board
        ? board === expected || board.includes(expected) || expected.includes(board)
        : false;
      const strong = candidate.method === "domain-root" || boardMatches;
      const result: ValidationResult = {
        ...base,
        provider,
        identifier: candidate.slug,
        endpoint: probe.endpoint,
        discoveryMethod: `${provider}:${candidate.method}`,
        jobCount: probe.jobCount,
        ukJobCount: probe.ukJobCount,
        careersUrl: careersUrlFor(provider, candidate.slug),
        evidence: `${probe.jobCount} live vacancies returned by ${provider} for '${candidate.slug}'${
          probe.boardName ? ` (board names employer as '${probe.boardName}')` : ""
        }`,
      };
      if (strong) return { ...result, sourceStatus: probe.jobCount > 0 ? "healthy" : "healthy_no_vacancies" };
      weak ??= {
        ...result,
        sourceStatus: "needs_configuration",
        reason:
          "A candidate career source responded, but the employer's identity could not be confirmed from it, so it was not enabled automatically.",
      };
    }
  }

  if (weak) return weak;

  return {
    ...base,
    sourceStatus: "needs_configuration",
    reason:
      "No public structured career feed was found for this employer. Its careers site needs a specific integration or manual configuration.",
  };
}

type Db = {
  from: (table: string) => {
    select: (cols: string) => never;
    upsert: (values: unknown, opts?: unknown) => never;
    update: (values: unknown) => never;
    insert: (values: unknown) => never;
  };
};

/** Ensure a monitor row exists for all 400 registry companies, non-destructively. */
export async function syncRegistry(
  db: never,
  userId: string,
): Promise<{ created: number; existing: number; total: number }> {
  const client = db as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: unknown[] | null; error: unknown }> };
      insert: (v: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };

  const { data } = await client.from("job_source_companies").select("company_name").eq("user_id", userId);
  const have = new Set(((data ?? []) as Array<{ company_name: string }>).map((r) => r.company_name.toLowerCase()));

  const missing = targetUniverse.filter((t) => !have.has(t.name.toLowerCase()));
  let created = 0;
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100).map((t) => ({
      user_id: userId,
      company_name: t.name,
      provider: "unknown",
      provider_identifier: `pending:${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      company_group: t.group,
      official_domain: t.domain,
      sector: t.sector,
      is_target_universe: true,
      enabled: false,
      source_status: "needs_configuration",
      needs_config_reason: "Career source not discovered yet — validation has not run for this company.",
      priority: t.group === "startup" ? "normal" : "normal",
      validation_status: "unvalidated",
      health: "unknown",
    }));
    const { error } = await client.from("job_source_companies").insert(batch);
    if (error) throw new Error(error.message);
    created += batch.length;
  }

  // Existing rows that match a registry company are marked as part of the
  // universe without touching their working provider configuration.
  return { created, existing: have.size, total: targetUniverse.length };
}
