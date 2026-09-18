import { ashbyAdapter } from "./ashby";
import { greenhouseAdapter } from "./greenhouse";
import { leverAdapter } from "./lever";
import { personioAdapter } from "./personio";
import { recruiteeAdapter } from "./recruitee";
import { searchProviderAdapter } from "./search-provider";
import { smartRecruitersAdapter } from "./smartrecruiters";
import { teamtailorAdapter } from "./teamtailor";
import { workableAdapter } from "./workable";
import { workdayAdapter } from "./workday";
import type { JobSourceAdapter, SourceProvider } from "./types";

/** Central source registry. Order reflects source priority (Tier 1 ATS first). */
export const jobSourceRegistry: JobSourceAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  smartRecruitersAdapter,
  workableAdapter,
  teamtailorAdapter,
  recruiteeAdapter,
  personioAdapter,
  workdayAdapter,
  searchProviderAdapter,
];

export function adapterFor(provider: SourceProvider): JobSourceAdapter | undefined {
  return jobSourceRegistry.find((a) => a.id === provider);
}

/** Direct employer career sources, in the order source discovery probes them. */
export const directProviderOrder: SourceProvider[] = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "teamtailor",
  "recruitee",
  "personio",
];
