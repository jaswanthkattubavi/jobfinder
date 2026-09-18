import { runScanServerFn } from "./scan.functions";

export interface ScanOutcome {
  headline: string;
  detail: string;
}

/** UI-facing wrapper: turns the server scan summary into honest plain language. */
export async function runScanNow(): Promise<ScanOutcome> {
  const summary = await runScanServerFn();

  if (summary.status === "no_sources") {
    return {
      headline: "No live job sources are set up yet",
      detail: summary.note,
    };
  }

  const headline =
    summary.discoveredNew > 0
      ? `${summary.discoveredNew} new ${summary.discoveredNew === 1 ? "vacancy" : "vacancies"} found — ${summary.strongMatches} strong matches`
      : `No new vacancies this time — ${summary.strongMatches} strong matches in your radar`;

  const parts = [
    `${summary.sourcesConnected} source${summary.sourcesConnected === 1 ? "" : "s"} checked`,
    `${summary.duplicates} duplicates merged`,
    `${summary.verified} links verified`,
  ];
  if (summary.expired > 0) parts.push(`${summary.expired} no longer live`);
  if (summary.sourcesFailed > 0) parts.push(`${summary.sourcesFailed} source failed`);

  return { headline, detail: parts.join(" · ") };
}
