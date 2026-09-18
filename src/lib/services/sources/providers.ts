/**
 * Client-safe provider metadata for the source configuration form and status
 * cards. No network code, no secrets — the adapters themselves live server-side.
 */
export type ProviderId =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "teamtailor"
  | "recruitee"
  | "personio"
  | "workday"
  | "search_provider";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  /** Configurable per employer in the UI. */
  configurable: boolean;
  experimental: boolean;
  identifierLabel: string;
  identifierHint: string;
}

export const providerMeta: ProviderMeta[] = [
  {
    id: "greenhouse",
    name: "Greenhouse",
    configurable: true,
    experimental: false,
    identifierLabel: "Board token",
    identifierHint: "From the employer's Greenhouse careers link, e.g. boards.greenhouse.io/monzo → monzo",
  },
  {
    id: "lever",
    name: "Lever",
    configurable: true,
    experimental: false,
    identifierLabel: "Company slug",
    identifierHint: "From the employer's Lever link, e.g. jobs.lever.co/wise → wise",
  },
  {
    id: "ashby",
    name: "Ashby",
    configurable: true,
    experimental: false,
    identifierLabel: "Board name",
    identifierHint: "From the employer's Ashby link, e.g. jobs.ashbyhq.com/ramp → ramp",
  },
  {
    id: "smartrecruiters",
    name: "SmartRecruiters",
    configurable: true,
    experimental: false,
    identifierLabel: "Company identifier",
    identifierHint: "From the employer's SmartRecruiters link, e.g. jobs.smartrecruiters.com/Acme → Acme",
  },
  {
    id: "workable",
    name: "Workable",
    configurable: true,
    experimental: false,
    identifierLabel: "Account slug",
    identifierHint: "From the employer's Workable link, e.g. apply.workable.com/acme → acme",
  },
  {
    id: "teamtailor",
    name: "Teamtailor",
    configurable: true,
    experimental: false,
    identifierLabel: "Careers subdomain",
    identifierHint: "From the employer's Teamtailor site, e.g. acme.teamtailor.com → acme",
  },
  {
    id: "recruitee",
    name: "Recruitee",
    configurable: true,
    experimental: false,
    identifierLabel: "Company subdomain",
    identifierHint: "From the employer's Recruitee site, e.g. acme.recruitee.com → acme",
  },
  {
    id: "personio",
    name: "Personio",
    configurable: true,
    experimental: false,
    identifierLabel: "Careers subdomain",
    identifierHint: "From the employer's Personio site, e.g. acme.jobs.personio.com → acme",
  },
  {
    id: "workday",
    name: "Workday",
    configurable: true,
    experimental: true,
    identifierLabel: "host | tenant | site",
    identifierHint:
      "Workday differs per employer, so all three parts are needed, e.g. acme.wd3.myworkdayjobs.com|acme|External",
  },
  {
    id: "search_provider",
    name: "General job search",
    configurable: false,
    experimental: false,
    identifierLabel: "—",
    identifierHint: "Needs a job-search API key stored securely on the server",
  },
];

export const providerById: Record<ProviderId, ProviderMeta> = Object.fromEntries(
  providerMeta.map((p) => [p.id, p]),
) as Record<ProviderId, ProviderMeta>;

export function providerName(id: string): string {
  return providerMeta.find((p) => p.id === id)?.name ?? id;
}
