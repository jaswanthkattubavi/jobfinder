/**
 * Real server-side application-link verification.
 *
 * Deliberately cautious: a single failed request never expires a job. Bot
 * protection, 403s and timeouts are recorded as `unknown`, not as expired.
 */

export type LiveStatus = "live" | "possibly_live" | "expired" | "broken" | "unknown";

export interface VerificationResult {
  status: LiveStatus;
  reason: string;
  checkedAt: string;
}

const CLOSED_SIGNALS = [
  "no longer accepting applications",
  "this job is no longer available",
  "position has been filled",
  "job posting has expired",
  "this position is closed",
  "vacancy is now closed",
  "applications are closed",
  "job not found",
  "posting is no longer active",
];

const JOB_SIGNALS = ["apply", "responsibilities", "requirements", "job", "role", "vacancy", "career"];

function isGeneralCareersPage(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return path === "" || /^\/(careers|jobs|en-us\/careers|opportunities)$/i.test(path);
  } catch {
    return false;
  }
}

export async function verifyJobLink(url: string | null | undefined): Promise<VerificationResult> {
  const checkedAt = new Date().toISOString();
  if (!url) return { status: "unknown", reason: "No application link stored", checkedAt };

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: {
        // Identify ourselves honestly rather than impersonating a browser.
        "user-agent": "JobRadarAI-LinkCheck/1.0 (+job link verification)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    const message = (err as Error).name === "TimeoutError" ? "Request timed out" : (err as Error).message;
    return { status: "unknown", reason: `Could not reach the page (${message})`, checkedAt };
  }

  if (res.status === 404 || res.status === 410) {
    return { status: "expired", reason: `Page returns ${res.status} — vacancy removed`, checkedAt };
  }
  if (res.status === 403 || res.status === 401 || res.status === 429) {
    return {
      status: "unknown",
      reason: `Blocked by the site (${res.status}) — not treated as expired`,
      checkedAt,
    };
  }
  if (res.status >= 500) {
    return { status: "unknown", reason: `Site error ${res.status} — will re-check later`, checkedAt };
  }
  if (!res.ok) {
    return { status: "broken", reason: `Unexpected response ${res.status}`, checkedAt };
  }

  const finalUrl = res.url || url;
  let body = "";
  try {
    body = (await res.text()).slice(0, 120_000).toLowerCase();
  } catch {
    return { status: "unknown", reason: "Page reached but could not be read", checkedAt };
  }

  const closed = CLOSED_SIGNALS.find((s) => body.includes(s));
  if (closed) return { status: "expired", reason: `Page says "${closed}"`, checkedAt };

  if (isGeneralCareersPage(finalUrl) && finalUrl !== url) {
    return {
      status: "possibly_live",
      reason: "Redirected to the employer's general careers page",
      checkedAt,
    };
  }

  const looksLikeJob = JOB_SIGNALS.some((s) => body.includes(s));
  if (!looksLikeJob) {
    return { status: "possibly_live", reason: "Page loaded but did not look job-related", checkedAt };
  }
  return { status: "live", reason: "Application page loaded and still looks like a vacancy", checkedAt };
}

/** Link status contribution to the opportunity score. */
export function linkFactor(status: LiveStatus): number {
  switch (status) {
    case "live":
      return 100;
    case "possibly_live":
      return 70;
    case "unknown":
      return 50;
    default:
      return 0;
  }
}

/** Older jobs are re-checked less often, new ones frequently. */
export function needsVerification(
  lastVerifiedAt: string | null,
  discoveredAt: string | null,
): boolean {
  if (!lastVerifiedAt) return true;
  const ageDays = discoveredAt
    ? (Date.now() - new Date(discoveredAt).getTime()) / 86_400_000
    : 0;
  const sinceHours = (Date.now() - new Date(lastVerifiedAt).getTime()) / 3_600_000;
  if (ageDays <= 3) return sinceHours >= 12;
  if (ageDays <= 14) return sinceHours >= 48;
  return sinceHours >= 168;
}
