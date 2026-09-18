import { demoJobs, demoScanRuns } from "../demo-data";
import type { FeedbackReason, Job, LinkStatus, ScanRun, SponsorshipAnalysis } from "../types";

/**
 * Discovery pipeline interfaces.
 *
 * Every function here is the contract the real integrations will implement:
 * Discover -> Verify -> Filter -> Analyse -> Score -> Rank -> Notify -> Track -> Learn.
 * Until job sources, the AI service and the scheduler are connected, these run
 * against demo data and report `connected: false` so the UI can say so honestly.
 */

export interface PipelineResult<T> {
  connected: boolean;
  data: T;
  note: string;
}

const notConnected = "Not connected yet — returning demo results.";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function scanJobs(): Promise<PipelineResult<ScanRun>> {
  await delay(1400);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const run: ScanRun = {
    id: `s-${now.getTime()}`,
    date: now.toISOString(),
    startedAt: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    finishedAt: `${pad(now.getHours())}:${pad(now.getMinutes() + 1)}`,
    sources: 9,
    discovered: 152 + Math.floor(Math.random() * 60),
    newJobs: 14 + Math.floor(Math.random() * 10),
    duplicatesRemoved: 20 + Math.floor(Math.random() * 20),
    expired: Math.floor(Math.random() * 8),
    analysed: 18,
    strongMatches: 4 + Math.floor(Math.random() * 4),
    errors: [],
  };
  return { connected: false, data: run, note: notConnected };
}

export function normalizeJob(raw: Partial<Job>): Partial<Job> {
  const normalized: Partial<Job> = { ...raw };
  if (raw.title) normalized.title = raw.title.trim();
  normalized.country = raw.country ?? "United Kingdom";
  normalized.currency = raw.currency ?? "GBP";
  return normalized;
}

/** Same role posted on several boards collapses to one canonical record. */
export function detectDuplicate(job: Job, existing: Job[]): Job | null {
  const key = (j: Job) => `${j.companyId}|${j.title.toLowerCase()}|${j.city.toLowerCase()}`;
  return existing.find((j) => j.id !== job.id && key(j) === key(job)) ?? null;
}

export async function verifyJobLink(job: Job): Promise<PipelineResult<LinkStatus>> {
  await delay(200);
  return { connected: false, data: job.linkStatus, note: notConnected };
}

export async function analyseJobDescription(job: Job): Promise<PipelineResult<string[]>> {
  await delay(300);
  return { connected: false, data: job.atsKeywords, note: notConnected };
}

export async function analyseSponsorship(job: Job): Promise<PipelineResult<SponsorshipAnalysis>> {
  await delay(300);
  return { connected: false, data: job.sponsorship, note: notConnected };
}

export async function sendDailyDigest(): Promise<PipelineResult<null>> {
  await delay(400);
  return { connected: false, data: null, note: "Email service not connected yet." };
}

export function expireOldJobs(jobs: Job[], maxAgeDays = 45): Job[] {
  return jobs.map((j) =>
    Date.now() - new Date(j.datePosted).getTime() > maxAgeDays * 86_400_000
      ? { ...j, active: false, linkStatus: "Expired" as LinkStatus }
      : j,
  );
}

export function learnFromFeedback(reason: FeedbackReason): { adjustment: string } {
  const map: Record<FeedbackReason, string> = {
    Interested: "Similar roles ranked higher",
    "Not Interested": "Similar roles ranked lower",
    "Too Senior": "Seniority ceiling tightened",
    "Wrong Role": "Role category down-weighted",
    "No Sponsorship": "Sponsorship threshold raised",
    "Wrong Location": "Location preference reinforced",
    "Already Seen": "Deduplication signal recorded",
    "Bad Company Fit": "Company priority lowered",
  };
  return { adjustment: map[reason] };
}

export const seedJobs = demoJobs;
export const seedScanRuns = demoScanRuns;
