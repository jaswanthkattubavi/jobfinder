/**
 * Background maintenance: sponsor-data refresh and the daily self-check.
 *
 * Both run from the scheduled endpoint. Each has a lease, a bounded amount of
 * work, a paused state and a failure counter, and each records honestly what it
 * actually did.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<any, "public", any>;

const LEASE_MINUTES = 15;

async function claim(db: Db, id: string): Promise<{ claimed: boolean; reason: string }> {
  const { data } = await db.from("automation_jobs").select("*").eq("id", id).maybeSingle();
  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row) return { claimed: false, reason: `No automation record for ${id}.` };
  if (row["enabled"] === false) return { claimed: false, reason: "Switched off." };
  if (row["paused"] === true) return { claimed: false, reason: `Paused: ${(row["pause_reason"] as string) ?? "unknown"}` };
  const lease = row["lease_until"] as string | null;
  if (lease && new Date(lease).getTime() > Date.now()) return { claimed: false, reason: "Already running." };
  const nextRun = row["next_run_after"] as string | null;
  if (nextRun && new Date(nextRun).getTime() > Date.now()) return { claimed: false, reason: "Not due yet." };

  await db
    .from("automation_jobs")
    .update({
      lease_until: new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString(),
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  return { claimed: true, reason: "claimed" };
}

async function finish(
  db: Db,
  id: string,
  outcome: { ok: boolean; detail: string; nextRunAfter: Date },
): Promise<void> {
  const { data } = await db.from("automation_jobs").select("consecutive_failures").eq("id", id).maybeSingle();
  const failures = Number((data as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0);
  const nextFailures = outcome.ok ? 0 : failures + 1;
  await db
    .from("automation_jobs")
    .update({
      lease_until: null,
      last_status: outcome.ok ? "ok" : "failed",
      last_detail: outcome.detail.slice(0, 500),
      last_success_at: outcome.ok ? new Date().toISOString() : undefined,
      next_run_after: outcome.nextRunAfter.toISOString(),
      consecutive_failures: nextFailures,
      // Five failures in a row stops it and asks for a human, instead of
      // hammering an external service forever.
      paused: nextFailures >= 5,
      pause_reason: nextFailures >= 5 ? `Paused after ${nextFailures} consecutive failures` : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
}

/** Weekly: rematch employers against the stored register and reanalyse live jobs. */
export async function runSponsorMaintenance(db: Db): Promise<{ ran: boolean; detail: string }> {
  const gate = await claim(db, "sponsor_register_refresh");
  if (!gate.claimed) return { ran: false, detail: gate.reason };
  try {
    const { rematchCompanies, reanalyseSponsorship } = await import("./sponsor-register.server");
    const rematch = await rematchCompanies(db);
    const reanalyse = await reanalyseSponsorship(db);
    const detail = `${rematch.matched} employer(s) matched, ${rematch.possible} need review, ${rematch.notFound} not found; ${reanalyse.jobsAnalysed} live vacancies reanalysed.`;
    await finish(db, "sponsor_register_refresh", {
      ok: true,
      detail,
      nextRunAfter: new Date(Date.now() + 7 * 86_400_000),
    });
    return { ran: true, detail };
  } catch (error) {
    const detail = (error as Error).message;
    await finish(db, "sponsor_register_refresh", { ok: false, detail, nextRunAfter: new Date(Date.now() + 86_400_000) });
    return { ran: false, detail };
  }
}

export interface HealthReport {
  checkedAt: string;
  ok: boolean;
  problems: string[];
  liveJobs: number;
  demoJobs: number;
  jobsMissingApplyUrl: number;
  brokenLinks: number;
  stalePostings: number;
  healthySources: number;
  failingSources: number;
  sponsorEntries: number;
  lastScanAt: string | null;
  lastScanStatus: string | null;
  emailFailures: number;
  analysisFailures: number;
}

/** Reads only stored state — it never re-fetches employers or spends AI credits. */
export async function buildHealthReport(db: Db): Promise<HealthReport> {
  const staleCutoff = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const [live, demo, noUrl, broken, stale, sources, failing, sponsor, scan, emailFail, analysisFail] =
    await Promise.all([
      db.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).eq("is_demo", false),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("is_demo", true),
      db
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_demo", false)
        .is("canonical_apply_url", null),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).eq("live_status", "broken"),
      db
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_demo", false)
        .lt("posted_at", staleCutoff),
      db.from("job_source_companies").select("id", { count: "exact", head: true }).eq("enabled", true),
      db
        .from("job_source_companies")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true)
        .eq("health", "failing"),
      db.from("sponsor_register_entries").select("id", { count: "exact", head: true }),
      db
        .from("scan_runs")
        .select("started_at, status")
        .eq("is_demo", false)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("email_deliveries").select("id", { count: "exact", head: true }).eq("status", "failed"),
      db.from("jobs").select("id", { count: "exact", head: true }).not("analysis_error", "is", null),
    ]);

  const problems: string[] = [];
  const count = (r: { count: number | null }) => Number(r.count ?? 0);
  if (count(noUrl) > 0) problems.push(`${count(noUrl)} live vacancy record(s) have no application link.`);
  if (count(broken) > 0) problems.push(`${count(broken)} application link(s) failed verification.`);
  if (count(failing) > 0) problems.push(`${count(failing)} employer source(s) are failing.`);
  if (count(sponsor) === 0) problems.push("No sponsor-register data is loaded.");
  const lastScan = (scan.data ?? null) as { started_at?: string; status?: string } | null;
  if (!lastScan) problems.push("No real scan has run yet.");
  else if (Date.now() - new Date(lastScan.started_at!).getTime() > 36 * 3_600_000)
    problems.push("The last scan is more than 36 hours old.");
  if (count(emailFail) > 0) problems.push(`${count(emailFail)} email delivery attempt(s) failed.`);
  if (count(analysisFail) > 0) problems.push(`${count(analysisFail)} vacancy analysis attempt(s) need retrying.`);

  return {
    checkedAt: new Date().toISOString(),
    ok: problems.length === 0,
    problems,
    liveJobs: count(live),
    demoJobs: count(demo),
    jobsMissingApplyUrl: count(noUrl),
    brokenLinks: count(broken),
    stalePostings: count(stale),
    healthySources: count(sources) - count(failing),
    failingSources: count(failing),
    sponsorEntries: count(sponsor),
    lastScanAt: lastScan?.started_at ?? null,
    lastScanStatus: lastScan?.status ?? null,
    emailFailures: count(emailFail),
    analysisFailures: count(analysisFail),
  };
}

/** Daily self-check; records the outcome so status pages can tell the truth. */
export async function runHealthCheck(db: Db): Promise<{ ran: boolean; detail: string }> {
  const gate = await claim(db, "health_check");
  if (!gate.claimed) return { ran: false, detail: gate.reason };
  try {
    const report = await buildHealthReport(db);
    const detail = report.ok ? "All checks passed." : report.problems.join(" ");
    await finish(db, "health_check", { ok: true, detail, nextRunAfter: new Date(Date.now() + 20 * 3_600_000) });
    return { ran: true, detail };
  } catch (error) {
    const detail = (error as Error).message;
    await finish(db, "health_check", { ok: false, detail, nextRunAfter: new Date(Date.now() + 6 * 3_600_000) });
    return { ran: false, detail };
  }
}
