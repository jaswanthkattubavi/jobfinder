/**
 * Target company source library.
 *
 * Every entry below was checked against the employer's live careers API before
 * being written here: `checkedJobs` is the number of vacancies the board
 * actually returned and `checkedUkJobs` how many of those read as UK at the
 * time of the check. Nothing here is a guess — a board that did not respond, or
 * responded with nothing, was left out.
 *
 * The counts are a record of that check, not live data. Importing the library
 * re-tests every board before it is enabled, and the daily scan keeps its own
 * per-source health.
 */
import type { ProviderId } from "./providers";

export interface LibraryEntry {
  company: string;
  provider: ProviderId;
  identifier: string;
  careersUrl: string;
  priority: "high" | "medium" | "normal";
  sector: string;
  checkedJobs: number;
  checkedUkJobs: number;
}

export const LIBRARY_CHECKED_ON = "2026-09-10";

export const companyLibrary: LibraryEntry[] = [
  { company: "Sierra", provider: "ashby", identifier: "sierra", careersUrl: "https://jobs.ashbyhq.com/sierra", priority: "high", sector: "AI", checkedJobs: 209, checkedUkJobs: 41 },
  { company: "ElevenLabs", provider: "ashby", identifier: "elevenlabs", careersUrl: "https://jobs.ashbyhq.com/elevenlabs", priority: "high", sector: "AI", checkedJobs: 248, checkedUkJobs: 36 },
  { company: "Legora", provider: "ashby", identifier: "legora", careersUrl: "https://jobs.ashbyhq.com/legora", priority: "high", sector: "AI", checkedJobs: 282, checkedUkJobs: 31 },
  { company: "Cohere", provider: "ashby", identifier: "cohere", careersUrl: "https://jobs.ashbyhq.com/cohere", priority: "high", sector: "AI", checkedJobs: 142, checkedUkJobs: 22 },
  { company: "Multiverse", provider: "ashby", identifier: "multiverse", careersUrl: "https://jobs.ashbyhq.com/multiverse", priority: "high", sector: "EdTech", checkedJobs: 22, checkedUkJobs: 22 },
  { company: "Harvey", provider: "ashby", identifier: "harvey", careersUrl: "https://jobs.ashbyhq.com/harvey", priority: "high", sector: "AI", checkedJobs: 334, checkedUkJobs: 21 },
  { company: "OpenAI", provider: "ashby", identifier: "openai", careersUrl: "https://jobs.ashbyhq.com/openai", priority: "high", sector: "AI", checkedJobs: 785, checkedUkJobs: 19 },
  { company: "Synthesia", provider: "ashby", identifier: "synthesia", careersUrl: "https://jobs.ashbyhq.com/synthesia", priority: "high", sector: "AI", checkedJobs: 58, checkedUkJobs: 15 },
  { company: "Lovable", provider: "ashby", identifier: "lovable", careersUrl: "https://jobs.ashbyhq.com/lovable", priority: "high", sector: "AI", checkedJobs: 82, checkedUkJobs: 14 },
  { company: "Paddle", provider: "ashby", identifier: "paddle", careersUrl: "https://jobs.ashbyhq.com/paddle", priority: "high", sector: "SaaS", checkedJobs: 19, checkedUkJobs: 13 },
  { company: "Ramp", provider: "ashby", identifier: "ramp", careersUrl: "https://jobs.ashbyhq.com/ramp", priority: "high", sector: "FinTech", checkedJobs: 146, checkedUkJobs: 10 },
  { company: "Zilch", provider: "ashby", identifier: "zilch", careersUrl: "https://jobs.ashbyhq.com/zilch", priority: "high", sector: "FinTech", checkedJobs: 10, checkedUkJobs: 10 },
  { company: "Cursor (Anysphere)", provider: "ashby", identifier: "cursor", careersUrl: "https://jobs.ashbyhq.com/cursor", priority: "medium", sector: "AI", checkedJobs: 128, checkedUkJobs: 7 },
  { company: "Notion", provider: "ashby", identifier: "notion", careersUrl: "https://jobs.ashbyhq.com/notion", priority: "medium", sector: "SaaS", checkedJobs: 128, checkedUkJobs: 4 },
  { company: "Linear", provider: "ashby", identifier: "linear", careersUrl: "https://jobs.ashbyhq.com/linear", priority: "medium", sector: "SaaS", checkedJobs: 30, checkedUkJobs: 2 },
  { company: "Supabase", provider: "ashby", identifier: "supabase", careersUrl: "https://jobs.ashbyhq.com/supabase", priority: "medium", sector: "Cloud/infrastructure", checkedJobs: 59, checkedUkJobs: 2 },
  { company: "Tractable", provider: "ashby", identifier: "tractable", careersUrl: "https://jobs.ashbyhq.com/tractable", priority: "medium", sector: "AI", checkedJobs: 6, checkedUkJobs: 2 },
  { company: "Modal Labs", provider: "ashby", identifier: "modal", careersUrl: "https://jobs.ashbyhq.com/modal", priority: "medium", sector: "AI infrastructure", checkedJobs: 31, checkedUkJobs: 1 },
  { company: "Monumental", provider: "ashby", identifier: "monumental", careersUrl: "https://jobs.ashbyhq.com/monumental", priority: "medium", sector: "Robotics", checkedJobs: 21, checkedUkJobs: 1 },
  { company: "Mux", provider: "ashby", identifier: "mux", careersUrl: "https://jobs.ashbyhq.com/mux", priority: "medium", sector: "Media tech", checkedJobs: 2, checkedUkJobs: 1 },
  { company: "PostHog", provider: "ashby", identifier: "posthog", careersUrl: "https://jobs.ashbyhq.com/posthog", priority: "medium", sector: "Developer tools", checkedJobs: 10, checkedUkJobs: 1 },
  { company: "Airbyte", provider: "ashby", identifier: "airbyte", careersUrl: "https://jobs.ashbyhq.com/airbyte", priority: "normal", sector: "Data", checkedJobs: 13, checkedUkJobs: 0 },
  { company: "Baseten", provider: "ashby", identifier: "baseten", careersUrl: "https://jobs.ashbyhq.com/baseten", priority: "normal", sector: "AI infrastructure", checkedJobs: 88, checkedUkJobs: 0 },
  { company: "Causal", provider: "ashby", identifier: "causal", careersUrl: "https://jobs.ashbyhq.com/causal", priority: "normal", sector: "SaaS", checkedJobs: 20, checkedUkJobs: 0 },
  { company: "Hex", provider: "ashby", identifier: "hex", careersUrl: "https://jobs.ashbyhq.com/hex", priority: "normal", sector: "Data", checkedJobs: 32, checkedUkJobs: 0 },
  { company: "Hightouch", provider: "ashby", identifier: "hightouch", careersUrl: "https://jobs.ashbyhq.com/hightouch", priority: "normal", sector: "Data", checkedJobs: 1, checkedUkJobs: 0 },
  { company: "MotherDuck", provider: "ashby", identifier: "motherduck", careersUrl: "https://jobs.ashbyhq.com/motherduck", priority: "normal", sector: "Data", checkedJobs: 7, checkedUkJobs: 0 },
  { company: "Neon", provider: "ashby", identifier: "neon", careersUrl: "https://jobs.ashbyhq.com/neon", priority: "normal", sector: "Cloud/infrastructure", checkedJobs: 5, checkedUkJobs: 0 },
  { company: "Prefect", provider: "ashby", identifier: "prefect", careersUrl: "https://jobs.ashbyhq.com/prefect", priority: "normal", sector: "Data", checkedJobs: 8, checkedUkJobs: 0 },
  { company: "Railway", provider: "ashby", identifier: "railway", careersUrl: "https://jobs.ashbyhq.com/railway", priority: "normal", sector: "Cloud/infrastructure", checkedJobs: 8, checkedUkJobs: 0 },
  { company: "Zapier", provider: "ashby", identifier: "zapier", careersUrl: "https://jobs.ashbyhq.com/zapier", priority: "normal", sector: "SaaS", checkedJobs: 6, checkedUkJobs: 0 },
  { company: "Graphcore", provider: "greenhouse", identifier: "graphcore", careersUrl: "https://boards.greenhouse.io/graphcore", priority: "high", sector: "Semiconductors / AI hardware", checkedJobs: 186, checkedUkJobs: 88 },
  { company: "SumUp", provider: "greenhouse", identifier: "sumup", careersUrl: "https://boards.greenhouse.io/sumup", priority: "high", sector: "FinTech", checkedJobs: 404, checkedUkJobs: 76 },
  { company: "Databricks", provider: "greenhouse", identifier: "databricks", careersUrl: "https://boards.greenhouse.io/databricks", priority: "high", sector: "Data", checkedJobs: 874, checkedUkJobs: 52 },
  { company: "Monzo", provider: "greenhouse", identifier: "monzo", careersUrl: "https://boards.greenhouse.io/monzo", priority: "high", sector: "FinTech", checkedJobs: 68, checkedUkJobs: 52 },
  { company: "Anthropic", provider: "greenhouse", identifier: "anthropic", careersUrl: "https://boards.greenhouse.io/anthropic", priority: "high", sector: "AI", checkedJobs: 596, checkedUkJobs: 50 },
  { company: "GitLab", provider: "greenhouse", identifier: "gitlab", careersUrl: "https://boards.greenhouse.io/gitlab", priority: "high", sector: "Developer tools", checkedJobs: 229, checkedUkJobs: 47 },
  { company: "HelloFresh", provider: "greenhouse", identifier: "hellofresh", careersUrl: "https://boards.greenhouse.io/hellofresh", priority: "high", sector: "Consumer tech", checkedJobs: 468, checkedUkJobs: 45 },
  { company: "Stripe", provider: "greenhouse", identifier: "stripe", careersUrl: "https://boards.greenhouse.io/stripe", priority: "high", sector: "FinTech", checkedJobs: 617, checkedUkJobs: 45 },
  { company: "Scale AI", provider: "greenhouse", identifier: "scaleai", careersUrl: "https://boards.greenhouse.io/scaleai", priority: "high", sector: "AI", checkedJobs: 220, checkedUkJobs: 37 },
  { company: "JetBrains", provider: "greenhouse", identifier: "jetbrains", careersUrl: "https://boards.greenhouse.io/jetbrains", priority: "high", sector: "Developer tools", checkedJobs: 72, checkedUkJobs: 25 },
  { company: "Datadog", provider: "greenhouse", identifier: "datadog", careersUrl: "https://boards.greenhouse.io/datadog", priority: "high", sector: "Cloud/infrastructure", checkedJobs: 450, checkedUkJobs: 21 },
  { company: "Tide", provider: "greenhouse", identifier: "tide", careersUrl: "https://boards.greenhouse.io/tide", priority: "high", sector: "FinTech", checkedJobs: 80, checkedUkJobs: 21 },
  { company: "Celonis", provider: "greenhouse", identifier: "celonis", careersUrl: "https://boards.greenhouse.io/celonis", priority: "high", sector: "SaaS", checkedJobs: 282, checkedUkJobs: 20 },
  { company: "Samsara", provider: "greenhouse", identifier: "samsara", careersUrl: "https://boards.greenhouse.io/samsara", priority: "high", sector: "IoT / SaaS", checkedJobs: 260, checkedUkJobs: 18 },
  { company: "Figma", provider: "greenhouse", identifier: "figma", careersUrl: "https://boards.greenhouse.io/figma", priority: "high", sector: "SaaS", checkedJobs: 157, checkedUkJobs: 17 },
  { company: "Elastic", provider: "greenhouse", identifier: "elastic", careersUrl: "https://boards.greenhouse.io/elastic", priority: "high", sector: "Cloud/infrastructure", checkedJobs: 344, checkedUkJobs: 16 },
  { company: "Twilio", provider: "greenhouse", identifier: "twilio", careersUrl: "https://boards.greenhouse.io/twilio", priority: "high", sector: "Communications", checkedJobs: 152, checkedUkJobs: 14 },
  { company: "Vercel", provider: "greenhouse", identifier: "vercel", careersUrl: "https://boards.greenhouse.io/vercel", priority: "high", sector: "Cloud/infrastructure", checkedJobs: 84, checkedUkJobs: 14 },
  { company: "Canonical", provider: "greenhouse", identifier: "canonical", careersUrl: "https://boards.greenhouse.io/canonical", priority: "high", sector: "Cloud/infrastructure", checkedJobs: 303, checkedUkJobs: 13 },
  { company: "Grafana Labs", provider: "greenhouse", identifier: "grafanalabs", careersUrl: "https://boards.greenhouse.io/grafanalabs", priority: "high", sector: "Cloud/infrastructure", checkedJobs: 127, checkedUkJobs: 13 },
  { company: "Trustpilot", provider: "greenhouse", identifier: "trustpilot", careersUrl: "https://boards.greenhouse.io/trustpilot", priority: "high", sector: "SaaS", checkedJobs: 53, checkedUkJobs: 13 },
  { company: "Mixpanel", provider: "greenhouse", identifier: "mixpanel", careersUrl: "https://boards.greenhouse.io/mixpanel", priority: "high", sector: "Analytics", checkedJobs: 83, checkedUkJobs: 12 },
  { company: "MongoDB", provider: "greenhouse", identifier: "mongodb", careersUrl: "https://boards.greenhouse.io/mongodb", priority: "high", sector: "Data", checkedJobs: 404, checkedUkJobs: 12 },
  { company: "Neo4j", provider: "greenhouse", identifier: "neo4j", careersUrl: "https://boards.greenhouse.io/neo4j", priority: "high", sector: "Data", checkedJobs: 55, checkedUkJobs: 12 },
  { company: "Affirm", provider: "greenhouse", identifier: "affirm", careersUrl: "https://boards.greenhouse.io/affirm", priority: "high", sector: "FinTech", checkedJobs: 202, checkedUkJobs: 11 },
  { company: "Reddit", provider: "greenhouse", identifier: "reddit", careersUrl: "https://boards.greenhouse.io/reddit", priority: "high", sector: "Consumer tech", checkedJobs: 147, checkedUkJobs: 11 },
  { company: "Coinbase", provider: "greenhouse", identifier: "coinbase", careersUrl: "https://boards.greenhouse.io/coinbase", priority: "high", sector: "FinTech", checkedJobs: 220, checkedUkJobs: 10 },
  { company: "Fivetran", provider: "greenhouse", identifier: "fivetran", careersUrl: "https://boards.greenhouse.io/fivetran", priority: "medium", sector: "Data", checkedJobs: 193, checkedUkJobs: 8 },
  { company: "GoCardless", provider: "greenhouse", identifier: "gocardless", careersUrl: "https://boards.greenhouse.io/gocardless", priority: "medium", sector: "FinTech", checkedJobs: 22, checkedUkJobs: 8 },
  { company: "Adyen", provider: "greenhouse", identifier: "adyen", careersUrl: "https://boards.greenhouse.io/adyen", priority: "medium", sector: "FinTech", checkedJobs: 219, checkedUkJobs: 5 },
  { company: "Asana", provider: "greenhouse", identifier: "asana", careersUrl: "https://boards.greenhouse.io/asana", priority: "medium", sector: "SaaS", checkedJobs: 104, checkedUkJobs: 5 },
  { company: "Fastly", provider: "greenhouse", identifier: "fastly", careersUrl: "https://boards.greenhouse.io/fastly", priority: "medium", sector: "Cloud/infrastructure", checkedJobs: 47, checkedUkJobs: 5 },
  { company: "Pinterest", provider: "greenhouse", identifier: "pinterest", careersUrl: "https://boards.greenhouse.io/pinterest", priority: "medium", sector: "Consumer tech", checkedJobs: 178, checkedUkJobs: 5 },
  { company: "Airbnb", provider: "greenhouse", identifier: "airbnb", careersUrl: "https://boards.greenhouse.io/airbnb", priority: "medium", sector: "Consumer tech", checkedJobs: 167, checkedUkJobs: 3 },
  { company: "Amplitude", provider: "greenhouse", identifier: "amplitude", careersUrl: "https://boards.greenhouse.io/amplitude", priority: "medium", sector: "Analytics", checkedJobs: 38, checkedUkJobs: 3 },
  { company: "Collibra", provider: "greenhouse", identifier: "collibra", careersUrl: "https://boards.greenhouse.io/collibra", priority: "medium", sector: "Data", checkedJobs: 35, checkedUkJobs: 3 },
  { company: "Duolingo", provider: "greenhouse", identifier: "duolingo", careersUrl: "https://boards.greenhouse.io/duolingo", priority: "medium", sector: "EdTech", checkedJobs: 85, checkedUkJobs: 3 },
  { company: "Robinhood", provider: "greenhouse", identifier: "robinhood", careersUrl: "https://boards.greenhouse.io/robinhood", priority: "medium", sector: "FinTech", checkedJobs: 130, checkedUkJobs: 3 },
  { company: "Sigma Computing", provider: "greenhouse", identifier: "sigmacomputing", careersUrl: "https://boards.greenhouse.io/sigmacomputing", priority: "medium", sector: "Data", checkedJobs: 64, checkedUkJobs: 3 },
  { company: "Dropbox", provider: "greenhouse", identifier: "dropbox", careersUrl: "https://boards.greenhouse.io/dropbox", priority: "medium", sector: "Consumer tech", checkedJobs: 43, checkedUkJobs: 2 },
  { company: "Form3", provider: "greenhouse", identifier: "form3", careersUrl: "https://boards.greenhouse.io/form3", priority: "medium", sector: "FinTech", checkedJobs: 8, checkedUkJobs: 2 },
  { company: "CircleCI", provider: "greenhouse", identifier: "circleci", careersUrl: "https://boards.greenhouse.io/circleci", priority: "medium", sector: "Developer tools", checkedJobs: 7, checkedUkJobs: 1 },
  { company: "GetYourGuide", provider: "greenhouse", identifier: "getyourguide", careersUrl: "https://boards.greenhouse.io/getyourguide", priority: "medium", sector: "Consumer tech", checkedJobs: 52, checkedUkJobs: 1 },
  { company: "Lyft", provider: "greenhouse", identifier: "lyft", careersUrl: "https://boards.greenhouse.io/lyft", priority: "medium", sector: "Consumer tech", checkedJobs: 160, checkedUkJobs: 1 },
  { company: "Starburst", provider: "greenhouse", identifier: "starburst", careersUrl: "https://boards.greenhouse.io/starburst", priority: "medium", sector: "Data", checkedJobs: 22, checkedUkJobs: 1 },
  { company: "TrueLayer", provider: "greenhouse", identifier: "truelayer", careersUrl: "https://boards.greenhouse.io/truelayer", priority: "medium", sector: "FinTech", checkedJobs: 2, checkedUkJobs: 1 },
  { company: "Airtable", provider: "greenhouse", identifier: "airtable", careersUrl: "https://boards.greenhouse.io/airtable", priority: "normal", sector: "SaaS", checkedJobs: 16, checkedUkJobs: 0 },
  { company: "Bitpanda", provider: "greenhouse", identifier: "bitpanda", careersUrl: "https://boards.greenhouse.io/bitpanda", priority: "normal", sector: "FinTech", checkedJobs: 24, checkedUkJobs: 0 },
  { company: "Brex", provider: "greenhouse", identifier: "brex", careersUrl: "https://boards.greenhouse.io/brex", priority: "normal", sector: "FinTech", checkedJobs: 268, checkedUkJobs: 0 },
  { company: "Cleo", provider: "greenhouse", identifier: "cleo", careersUrl: "https://boards.greenhouse.io/cleo", priority: "normal", sector: "FinTech", checkedJobs: 5, checkedUkJobs: 0 },
  { company: "Cloudflare", provider: "greenhouse", identifier: "cloudflare", careersUrl: "https://boards.greenhouse.io/cloudflare", priority: "normal", sector: "Cloud/infrastructure", checkedJobs: 353, checkedUkJobs: 0 },
  { company: "Discord", provider: "greenhouse", identifier: "discord", careersUrl: "https://boards.greenhouse.io/discord", priority: "normal", sector: "Consumer tech", checkedJobs: 45, checkedUkJobs: 0 },
  { company: "Gusto", provider: "greenhouse", identifier: "gusto", careersUrl: "https://boards.greenhouse.io/gusto", priority: "normal", sector: "HR tech", checkedJobs: 93, checkedUkJobs: 0 },
  { company: "Instacart", provider: "greenhouse", identifier: "instacart", careersUrl: "https://boards.greenhouse.io/instacart", priority: "normal", sector: "Consumer tech", checkedJobs: 104, checkedUkJobs: 0 },
  { company: "Mercury", provider: "greenhouse", identifier: "mercury", careersUrl: "https://boards.greenhouse.io/mercury", priority: "normal", sector: "FinTech", checkedJobs: 59, checkedUkJobs: 0 },
  { company: "N26", provider: "greenhouse", identifier: "n26", careersUrl: "https://boards.greenhouse.io/n26", priority: "normal", sector: "FinTech", checkedJobs: 65, checkedUkJobs: 0 },
  { company: "Netlify", provider: "greenhouse", identifier: "netlify", careersUrl: "https://boards.greenhouse.io/netlify", priority: "normal", sector: "Cloud/infrastructure", checkedJobs: 1, checkedUkJobs: 0 },
  { company: "Peak", provider: "greenhouse", identifier: "peak", careersUrl: "https://boards.greenhouse.io/peak", priority: "normal", sector: "AI", checkedJobs: 51, checkedUkJobs: 0 },
  { company: "Skyscanner", provider: "greenhouse", identifier: "skyscanner", careersUrl: "https://boards.greenhouse.io/skyscanner", priority: "normal", sector: "Travel tech", checkedJobs: 1, checkedUkJobs: 0 },
  { company: "Squarespace", provider: "greenhouse", identifier: "squarespace", careersUrl: "https://boards.greenhouse.io/squarespace", priority: "normal", sector: "SaaS", checkedJobs: 27, checkedUkJobs: 0 },
  { company: "Wise", provider: "greenhouse", identifier: "wise", careersUrl: "https://boards.greenhouse.io/wise", priority: "normal", sector: "FinTech", checkedJobs: 18, checkedUkJobs: 0 },
  { company: "Palantir Technologies", provider: "lever", identifier: "palantir", careersUrl: "https://jobs.lever.co/palantir", priority: "high", sector: "Enterprise software", checkedJobs: 310, checkedUkJobs: 39 },
  { company: "Shield AI", provider: "lever", identifier: "shieldai", careersUrl: "https://jobs.lever.co/shieldai", priority: "high", sector: "AI", checkedJobs: 482, checkedUkJobs: 25 },
  { company: "Spotify", provider: "lever", identifier: "spotify", careersUrl: "https://jobs.lever.co/spotify", priority: "high", sector: "Consumer tech", checkedJobs: 73, checkedUkJobs: 22 },
  { company: "Match Group", provider: "lever", identifier: "matchgroup", careersUrl: "https://jobs.lever.co/matchgroup", priority: "medium", sector: "Consumer tech", checkedJobs: 76, checkedUkJobs: 1 },
  { company: "Ledger", provider: "lever", identifier: "ledger", careersUrl: "https://jobs.lever.co/ledger", priority: "normal", sector: "FinTech", checkedJobs: 1, checkedUkJobs: 0 },
  { company: "Qonto", provider: "lever", identifier: "qonto", careersUrl: "https://jobs.lever.co/qonto", priority: "normal", sector: "FinTech", checkedJobs: 43, checkedUkJobs: 0 },
  { company: "Sysdig", provider: "lever", identifier: "sysdig", careersUrl: "https://jobs.lever.co/sysdig", priority: "normal", sector: "Cloud/infrastructure", checkedJobs: 16, checkedUkJobs: 0 },
  { company: "Younited", provider: "lever", identifier: "younited", careersUrl: "https://jobs.lever.co/younited", priority: "normal", sector: "FinTech", checkedJobs: 5, checkedUkJobs: 0 },
  { company: "Experian", provider: "smartrecruiters", identifier: "Experian", careersUrl: "https://jobs.smartrecruiters.com/Experian", priority: "high", sector: "Financial services", checkedJobs: 100, checkedUkJobs: 10 },
  { company: "NielsenIQ", provider: "smartrecruiters", identifier: "NielsenIQ", careersUrl: "https://jobs.smartrecruiters.com/NielsenIQ", priority: "medium", sector: "Data & analytics", checkedJobs: 100, checkedUkJobs: 3 },
  { company: "Bosch Group", provider: "smartrecruiters", identifier: "BoschGroup", careersUrl: "https://jobs.smartrecruiters.com/BoschGroup", priority: "normal", sector: "Engineering", checkedJobs: 100, checkedUkJobs: 0 },
  { company: "AstraZeneca", provider: "workday", identifier: "astrazeneca.wd3.myworkdayjobs.com|astrazeneca|Careers", careersUrl: "https://astrazeneca.wd3.myworkdayjobs.com/Careers", priority: "medium", sector: "Life sciences", checkedJobs: 1205, checkedUkJobs: 0 },
  { company: "Lloyds Banking Group", provider: "workday", identifier: "lbg.wd3.myworkdayjobs.com|lbg|LBG_Careers", careersUrl: "https://lbg.wd3.myworkdayjobs.com/LBG_Careers", priority: "medium", sector: "Banking", checkedJobs: 114, checkedUkJobs: 0 },
  { company: "NVIDIA", provider: "workday", identifier: "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite", careersUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite", priority: "medium", sector: "Semiconductors / AI hardware", checkedJobs: 2000, checkedUkJobs: 0 },
  { company: "Salesforce", provider: "workday", identifier: "salesforce.wd12.myworkdayjobs.com|salesforce|External_Career_Site", careersUrl: "https://salesforce.wd12.myworkdayjobs.com/External_Career_Site", priority: "medium", sector: "SaaS", checkedJobs: 1434, checkedUkJobs: 0 },
  { company: "Workday", provider: "workday", identifier: "workday.wd5.myworkdayjobs.com|workday|Workday", careersUrl: "https://workday.wd5.myworkdayjobs.com/Workday", priority: "medium", sector: "SaaS", checkedJobs: 394, checkedUkJobs: 0 },
];


export function libraryCountsByProvider(): Record<string, number> {
  return companyLibrary.reduce<Record<string, number>>((acc, e) => {
    acc[e.provider] = (acc[e.provider] ?? 0) + 1;
    return acc;
  }, {});
}
