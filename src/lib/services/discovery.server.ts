/**
 * Discovery pipeline orchestration.
 *
 * Discover → Normalize → Deduplicate → Verify → Filter → Sponsorship → Match →
 * Score → Rank → Store → Notify.
 *
 * Reliability rules enforced here:
 * - One broken source never fails the whole scan (per-source isolation + logs).
 * - Bounded work per run: fixed caps on sources, verifications and AI calls.
 * - Incremental: each source is asked only for postings newer than its last
 *   successful scan; unchanged descriptions reuse the previous analysis.
 * - Nothing is invented. Missing data is stored as unknown.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyseStoredJobs } from "./analysis.server";


import { dedupeBatch, findDuplicate, type ExistingJob } from "./dedupe";
import { assessEligibility, type EligibilityPrefs } from "./eligibility";
import { normalizeCompanyName, normalizeJob, type NormalizedJob } from "./normalize";
import { generateQueries, searchLocations } from "./queries";
import { scoreUserMatches } from "./scoring.server";
import { adapterFor } from "./sources/registry";
import { searchProviderConfig } from "./sources/search-provider";
import type { RawJob, SourceProvider } from "./sources/types";
import {
  analyseSponsorship,
  matchSponsorRegister,
  roleLooksSponsorable,
  type SponsorRegisterEntry,
} from "./sponsorship";
import { linkFactor, needsVerification, verifyJobLink } from "./verify.server";

type Db = SupabaseClient<any, "public", any>;

// A large employer library is scanned in bounded, concurrent batches. Sources
// rotate by least-recently-scanned, so every configured board is reached within
// a few runs even when the library is bigger than one run's budget.
const MAX_SOURCES_PER_RUN = 400;
const SOURCE_CONCURRENCY = 8;
const MAX_VERIFICATIONS_PER_RUN = 30;
const MAX_AI_ANALYSES_PER_RUN = 30;

/** Cheap UK hint used only for per-source counts, never for storing a job. */
const UK_LOCATION_HINT =
  /united kingdom|\buk\b|\bgb\b|england|scotland|wales|northern ireland|london|manchester|edinburgh|birmingham|bristol|leeds|glasgow|cambridge|oxford|reading|belfast|cardiff|newcastle|sheffield|nottingham/i;

export interface SourceLog {
  provider: string;
  provider_identifier: string | null;
  company_name: string | null;
  status: "success" | "failed" | "skipped" | "not_connected";
  duration_ms: number;
  items_fetched: number;
  items_inserted: number;
  items_updated: number;
  duplicates: number;
  verification_failures: number;
  analysis_calls: number;
  analysis_failures: number;
  rate_limit_events: number;
  error_text: string | null;
}

export interface DiscoveryOutcome {
  scanRunId: string;
  status: "completed" | "completed_with_warnings" | "failed" | "no_sources";
  sourcesChecked: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  discovered: number;
  inserted: number;
  updated: number;
  duplicates: number;
  verified: number;
  expired: number;
  analysed: number;
  analysisFailures: number;
  analysisPending: number;

  filtered: number;
  strongMatches: number;
  applyAsap: number;
  scored: number;
  realJobsTotal: number;
  logs: SourceLog[];
  note: string;
}

interface SourceRow {
  id: string;
  company_id: string | null;
  company_name: string;
  provider: SourceProvider;
  provider_identifier: string;
  careers_url: string | null;
  priority: string;
  last_scan_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number | null;
}

const priorityRank: Record<string, number> = { high: 0, medium: 1, normal: 2 };

/**
 * One employer, one company record.
 *
 * The same employer can arrive as a trading name, a legal entity name or an ATS
 * board slug. Aliases are recorded so the second and third spelling resolve to
 * the company we already have instead of creating a near-duplicate.
 */
async function ensureCompany(
  db: Db,
  name: string,
  careersUrl: string | null,
  aliases: string[] = [],
): Promise<string> {
  const normalized = normalizeCompanyName(name) || name.toLowerCase();
  const candidates = Array.from(
    new Set([normalized, ...aliases.map((a) => normalizeCompanyName(a) || a.toLowerCase())]),
  ).filter(Boolean);

  const { data: existing } = await db
    .from("companies")
    .select("id")
    .in("normalized_name", candidates)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await recordAliases(db, (existing as { id: string }).id, name, aliases);
    return (existing as { id: string }).id;
  }

  const { data: aliasRow } = await db
    .from("company_aliases")
    .select("company_id")
    .in("normalized_alias", candidates)
    .limit(1)
    .maybeSingle();
  if (aliasRow) return (aliasRow as { company_id: string }).company_id;

  const { data, error } = await db
    .from("companies")
    .insert({
      name,
      normalized_name: normalized,
      careers_url: careersUrl,
      is_demo: false,
      scanning_enabled: true,
    } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not store company "${name}": ${error?.message}`);
  const companyId = (data as { id: string }).id;
  await recordAliases(db, companyId, name, aliases);
  return companyId;
}

async function recordAliases(db: Db, companyId: string, name: string, aliases: string[]) {
  const rows = Array.from(new Set([name, ...aliases]))
    .filter((a) => a && a.trim().length > 1)
    .map((alias) => ({
      company_id: companyId,
      alias: alias.trim(),
      normalized_alias: normalizeCompanyName(alias) || alias.trim().toLowerCase(),
      source: "discovery",
    }))
    .filter((r) => r.normalized_alias);
  if (rows.length === 0) return;
  await db.from("company_aliases").upsert(rows as never, { onConflict: "normalized_alias", ignoreDuplicates: true });
}

function emptySourceLog(source: SourceRow): SourceLog {
  return {
    provider: source.provider,
    provider_identifier: source.provider_identifier,
    company_name: source.company_name,
    status: "success",
    duration_ms: 0,
    items_fetched: 0,
    items_inserted: 0,
    items_updated: 0,
    duplicates: 0,
    verification_failures: 0,
    analysis_calls: 0,
    analysis_failures: 0,
    rate_limit_events: 0,
    error_text: null,
  };
}

/** One employer board. Isolated: a failure here can never abort the scan. */
async function fetchOneSource(
  db: Db,
  source: SourceRow,
  queries: string[],
  locations: string[],
): Promise<{ raw: Array<{ raw: RawJob; source: SourceRow | null }>; log: SourceLog }> {
  const adapter = adapterFor(source.provider);
  const started = Date.now();
  const attemptedAt = new Date().toISOString();
  const base = emptySourceLog(source);

  if (!adapter || !adapter.enabled) {
    return { raw: [], log: { ...base, status: "not_connected", error_text: "Adapter is not connected" } };
  }

  try {
    // Incremental only within the same day: if the last success is older than
    // 12 hours we re-read the whole board, so vacancies that were pulled or
    // edited are picked up instead of silently going stale.
    const lastSuccess = source.last_success_at ? new Date(source.last_success_at).getTime() : null;
    const since =
      lastSuccess && Date.now() - lastSuccess < 12 * 60 * 60 * 1000 ? source.last_success_at : null;
    const jobs = await adapter.fetchJobs({
      identifier: source.provider_identifier,
      since,
      queries,
      locations,
    });
    const ukOpen = jobs.filter((j) => UK_LOCATION_HINT.test(j.locationText ?? "")).length;

    // On an incremental read, zero results means "nothing changed" — not an
    // unhealthy board — so the stored open-vacancy counts are left untouched.
    const fullRead = since === null;

    await db
      .from("job_source_companies")
      .update({
        last_scan_at: attemptedAt,
        last_attempt_at: attemptedAt,
        last_success_at: attemptedAt,
        last_error: null,
        consecutive_failures: 0,
        last_job_count: jobs.length,
        ...(fullRead ? { jobs_open: jobs.length, uk_jobs_open: ukOpen } : {}),
        validation_status: "validated",
        validated_at: attemptedAt,
        validation_error: null,
        health: fullRead && jobs.length === 0 ? "warning" : "healthy",
      } as never)
      .eq("id", source.id);

    return {
      raw: jobs.map((j) => ({ raw: j, source })),
      log: { ...base, items_fetched: jobs.length, duration_ms: Date.now() - started },
    };
  } catch (err) {
    const message = (err as Error).message;
    const failures = Number(source.consecutive_failures ?? 0) + 1;
    await db
      .from("job_source_companies")
      .update({
        last_scan_at: attemptedAt,
        last_attempt_at: attemptedAt,
        last_error: message.slice(0, 500),
        consecutive_failures: failures,
        // A board that used to work is flagged for review, never deleted.
        health: failures >= 3 ? "failed" : "warning",
        validation_status: source.last_success_at ? "validated" : "failed",
        validation_error: message.slice(0, 500),
      } as never)
      .eq("id", source.id);

    return {
      raw: [],
      log: {
        ...base,
        status: "failed",
        duration_ms: Date.now() - started,
        error_text: message.slice(0, 500),
        rate_limit_events: /429|rate limit/i.test(message) ? 1 : 0,
      },
    };
  }
}

/** Step 1: Discover. Bounded concurrency across the employer library. */
async function discover(
  db: Db,
  sources: SourceRow[],
  queries: string[],
  locations: string[],
): Promise<{ raw: Array<{ raw: RawJob; source: SourceRow | null }>; logs: SourceLog[] }> {
  const raw: Array<{ raw: RawJob; source: SourceRow | null }> = [];
  const logs: SourceLog[] = [];

  const queue = sources.slice(0, MAX_SOURCES_PER_RUN);
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const source = queue[cursor];
      cursor += 1;
      if (!source) break;
      const result = await fetchOneSource(db, source, queries, locations);
      raw.push(...result.raw);
      logs.push(result.log);
      // Gentle pacing so we never hammer employer career sites.
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(SOURCE_CONCURRENCY, queue.length)) }, () => worker()),
  );

  // General search provider, only when a real key exists.
  const cfg = searchProviderConfig();
  const searchAdapter = adapterFor("search_provider");
  if (!cfg.connected || !searchAdapter?.enabled) {
    logs.push({
      provider: "search_provider",
      provider_identifier: null,
      company_name: null,
      status: "not_connected",
      duration_ms: 0,
      items_fetched: 0,
      items_inserted: 0,
      items_updated: 0,
      duplicates: 0,
      verification_failures: 0,
      analysis_calls: 0,
      analysis_failures: 0,
      rate_limit_events: 0,
      error_text: "General job search provider: not connected",
    });
  } else {
    const started = Date.now();
    try {
      const jobs = await searchAdapter.fetchJobs({ identifier: "", queries, locations });
      for (const j of jobs) raw.push({ raw: j, source: null });
      logs.push({
        provider: "search_provider",
        provider_identifier: null,
        company_name: cfg.name,
        status: "success",
        duration_ms: Date.now() - started,
        items_fetched: jobs.length,
        items_inserted: 0,
        items_updated: 0,
        duplicates: 0,
        verification_failures: 0,
        analysis_calls: 0,
        analysis_failures: 0,
        rate_limit_events: 0,
        error_text: null,
      });
    } catch (err) {
      logs.push({
        provider: "search_provider",
        provider_identifier: null,
        company_name: cfg.name,
        status: "failed",
        duration_ms: Date.now() - started,
        items_fetched: 0,
        items_inserted: 0,
        items_updated: 0,
        duplicates: 0,
        verification_failures: 0,
        analysis_calls: 0,
        analysis_failures: 0,
        rate_limit_events: 0,
        error_text: (err as Error).message.slice(0, 500),
      });
    }
  }

  return { raw, logs };
}

export async function runDiscovery(
  db: Db,
  userId: string,
  trigger: "manual" | "scheduled",
): Promise<DiscoveryOutcome> {
  const startedAt = new Date().toISOString();

  const [prefsRes, rolesRes, sourcesRes, watchRes] = await Promise.all([
    db.from("search_preferences").select("*").eq("user_id", userId).maybeSingle(),
    db.from("role_preferences").select("role_category, target_titles, enabled").eq("user_id", userId),
    db.from("job_source_companies").select("*").eq("user_id", userId).eq("enabled", true),
    db.from("company_watchlist").select("company_id, priority").eq("user_id", userId),
  ]);

  const prefs = (prefsRes.data ?? {}) as Record<string, unknown>;
  const roles = (rolesRes.data ?? []) as Array<{ role_category: string; target_titles: string[]; enabled: boolean }>;
  const watch = (watchRes.data ?? []) as Array<{ company_id: string; priority: string }>;
  const watchPriority = new Map(watch.map((w) => [w.company_id, w.priority]));

  // High-priority followed companies are scanned first; within the same
  // priority the board waiting longest goes next, so a library larger than one
  // run's budget still gets covered evenly.
  const sources = ((sourcesRes.data ?? []) as SourceRow[])
    .map((s) => ({
      ...s,
      priority: s.company_id ? (watchPriority.get(s.company_id) ?? s.priority) : s.priority,
    }))
    .sort((a, b) => {
      const byPriority = (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2);
      if (byPriority !== 0) return byPriority;
      const at = a.last_scan_at ? new Date(a.last_scan_at).getTime() : 0;
      const bt = b.last_scan_at ? new Date(b.last_scan_at).getTime() : 0;
      return at - bt;
    });

  const enabledCategories = roles.filter((r) => r.enabled).map((r) => r.role_category);
  const preferredLocations = (prefs["preferred_locations"] as string[]) ?? ["London"];
  const queries = generateQueries(enabledCategories, (prefs["custom_queries"] as string[]) ?? []);
  const locations = searchLocations(preferredLocations);

  // A run that never reported back (worker restart, timeout) must not sit as
  // "running" forever and make the status pages look busy.
  await db
    .from("scan_runs")
    .update({ status: "failed", completed_at: startedAt } as never)
    .eq("user_id", userId)
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

  const { data: runRow, error: runError } = await db
    .from("scan_runs")
    .insert({
      user_id: userId,
      trigger_type: trigger,
      started_at: startedAt,
      status: "running",
      is_demo: false,
    } as never)
    .select("id")
    .single();
  if (runError || !runRow) throw new Error(`Could not start scan: ${runError?.message}`);
  const scanRunId = (runRow as { id: string }).id;

  const { raw, logs } = await discover(db, sources, queries, locations);

  // Step 2 + 3: normalize then deduplicate within the batch.
  const normalizedAll = raw.map((r) => {
    const job = normalizeJob(r.raw);
    // Prefer the employer name the user configured over an ATS board slug, but
    // keep the board's own spelling as an alias so one employer stays one
    // company record across providers.
    const aliases = [r.raw.companyName, r.source?.provider_identifier].filter(
      (a): a is string => Boolean(a),
    );
    if (r.source?.company_name) {
      job.companyName = r.source.company_name;
      job.normalizedCompany = r.source.company_name.trim().toLowerCase();
    }
    job.sourceId = r.source?.id ?? null;
    job.companyAliases = aliases;
    return job;
  });
  const { unique, duplicates: batchDuplicates } = dedupeBatch(normalizedAll);

  // Existing real jobs, for cross-run duplicate detection.
  const { data: existingRows } = await db
    .from("jobs")
    .select("id, provider, provider_job_id, fingerprint, canonical_apply_url, normalized_title, city, company_id, description_hash")
    .eq("is_demo", false)
    .limit(4000);
  const existing = (existingRows ?? []) as ExistingJob[];

  const eligibilityPrefs: EligibilityPrefs = {
    allowedSeniority: [
      ...(prefs["include_graduate"] !== false ? ["Graduate"] : []),
      ...(prefs["include_junior"] !== false ? ["Junior"] : []),
      ...(prefs["include_associate"] !== false ? ["Associate"] : []),
      ...(prefs["include_midlevel"] !== false ? ["Mid"] : []),
    ],
    enabledCategories,
    preferredLocations,
    allowUkWide: true,
    rejectCitizenshipRequired: prefs["reject_citizenship_required"] !== false,
    rejectSecurityClearance: prefs["reject_security_clearance"] !== false,
    excludedTitles: (prefs["excluded_titles"] as string[]) ?? [],
    excludedCompanies: (prefs["excluded_companies"] as string[]) ?? [],
    maxJobAgeDays: Number(prefs["max_job_age_days"] ?? 30),
  };

  const { data: registerRows } = await db
    .from("sponsor_register_entries")
    .select("organisation_name, normalized_name, town_city, county, licence_type, route, register_date")
    .limit(20000);
  const register = (registerRows ?? []) as SponsorRegisterEntry[];

  let inserted = 0;
  let updated = 0;
  let duplicates = batchDuplicates;
  let verified = 0;
  let expiredCount = 0;
  let filtered = 0;
  let analysed = 0;
  let analysisFailures = 0;
  let analysisPending = 0;
  const insertedIds: string[] = [];
  // Per-source outcome counts: how many of a board's vacancies survived the
  // cheap filters and were worth keeping.
  const ukBySource = new Map<string, number>();
  const relevantBySource = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string | null | undefined) => {
    if (id) map.set(id, (map.get(id) ?? 0) + 1);
  };

  for (const job of unique) {
    const dup = findDuplicate(job, existing);
    if (dup) {
      duplicates += 1;
      // Keep the canonical job, but never lose the alternative source.
      await db.from("job_sources").upsert(
        {
          job_id: dup.job.id,
          source_name: job.provider,
          external_job_id: job.providerJobId,
          source_url: job.sourceUrl,
          last_seen_at: new Date().toISOString(),
        } as never,
        { onConflict: "job_id,source_name,external_job_id" },
      );
      await db
        .from("jobs")
        .update({ last_seen_at: new Date().toISOString(), is_active: true } as never)
        .eq("id", dup.job.id);
      updated += 1;
      continue;
    }

    // This is a UK product: roles outside the UK are never stored.
    if (!job.isUkLocation) {
      filtered += 1;
      continue;
    }
    bump(ukBySource, job.sourceId);

    const eligibility = assessEligibility(job, eligibilityPrefs);
    // Quality over quantity: roles ruled out by your own rules are not stored.
    if (eligibility.status === "ineligible") {
      filtered += 1;
      continue;
    }
    bump(relevantBySource, job.sourceId);

    let companyId: string;
    try {
      companyId = await ensureCompany(db, job.companyName, null, job.companyAliases ?? []);
    } catch {
      continue;
    }

    // Step 4: verify the application link (bounded per run, eligible jobs first).
    let liveStatus = "unknown";
    let verificationReason: string | null = "Not verified yet";
    if (verified < MAX_VERIFICATIONS_PER_RUN) {
      const result = await verifyJobLink(job.applyUrl);
      liveStatus = result.status;
      verificationReason = result.reason;
      verified += 1;
      if (result.status === "expired" || result.status === "broken") expiredCount += 1;
    }

    const { data: insertedRow, error: insertError } = await db
      .from("jobs")
      .insert({
        company_id: companyId,
        provider: job.provider,
        provider_job_id: job.providerJobId,
        external_job_id: job.providerJobId,
        title: job.originalTitle,
        original_title: job.originalTitle,
        normalized_title: job.normalizedTitle,
        role_category: job.roleCategory,
        city: job.city,
        region: job.region,
        country: job.country,
        location_text: job.locationText,
        remote_type: job.remoteType,
        employment_type: job.employmentType,
        salary_min: job.salaryMin,
        salary_max: job.salaryMax,
        currency: job.currency,
        description: job.description,
        seniority: job.seniority,
        department: job.department,
        team: job.team,
        posted_at: job.postedAt,
        discovered_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        source_name: job.provider,
        source_url: job.sourceUrl,
        canonical_apply_url: job.applyUrl,
        fingerprint: job.fingerprint,
        description_hash: job.descriptionHash,
        eligibility_status: eligibility.status,
        eligibility_reasons: eligibility.reasons,
        live_status: liveStatus,
        verification_reason: verificationReason,
        last_verified_at: verificationReason === "Not verified yet" ? null : new Date().toISOString(),
        is_active: liveStatus !== "expired",
        is_demo: false,
      } as never)
      .select("id")
      .single();

    if (insertError || !insertedRow) {
      // Unique-constraint collisions are duplicates the fingerprint missed.
      duplicates += 1;
      continue;
    }
    const jobId = (insertedRow as { id: string }).id;
    inserted += 1;
    insertedIds.push(jobId);
    existing.push({
      id: jobId,
      provider: job.provider,
      provider_job_id: job.providerJobId,
      fingerprint: job.fingerprint,
      canonical_apply_url: job.applyUrl,
      normalized_title: job.normalizedTitle,
      city: job.city,
      company_id: companyId,
      description_hash: job.descriptionHash,
    });

    await db.from("job_sources").upsert(
      {
        job_id: jobId,
        source_name: job.provider,
        external_job_id: job.providerJobId,
        source_url: job.sourceUrl,
      } as never,
      { onConflict: "job_id,source_name,external_job_id" },
    );
    await db.from("scan_results").insert({ scan_run_id: scanRunId, job_id: jobId, result_type: "new" } as never);

    // Step 5: sponsorship evidence — employer licence and vacancy wording are
    // analysed separately and combined without ever asserting sponsorship.
    const companyMatch = matchSponsorRegister(job.companyName, register);
    const sponsorship = analyseSponsorship({
      description: job.description,
      companyMatch,
      roleLooksSponsorable: roleLooksSponsorable(job.roleCategory),
      salaryMin: job.salaryMin,
    });
    await db.from("job_sponsorship_analysis").upsert(
      {
        job_id: jobId,
        status: sponsorship.status,
        confidence: sponsorship.confidence,
        evidence_json: sponsorship.evidence,
        warnings_json: sponsorship.warnings,
        company_match_status: companyMatch.status,
        company_matched_entity: companyMatch.entity,
        company_match_confidence: companyMatch.confidence,
        job_wording_summary: sponsorship.jobWordingSummary,
        work_authorisation_summary: sponsorship.workAuthorisationSummary,
        restriction_summary: sponsorship.restrictionSummary,
        conclusion: sponsorship.conclusion,
        analysed_at: new Date().toISOString(),
      } as never,
      { onConflict: "job_id" },
    );
    await db
      .from("companies")
      .update({
        sponsor_licence_match_status: companyMatch.status,
        sponsor_register_matched_entity: companyMatch.entity,
        sponsor_register_match_confidence: companyMatch.confidence,
        sponsor_register_match_method: companyMatch.method,
        sponsor_licence_type: companyMatch.licenceType,
        sponsor_register_data_date: companyMatch.registerDate,
        sponsorship_confidence: companyMatch.confidence,
        sponsorship_last_checked: new Date().toISOString(),
      } as never)
      .eq("id", companyId);
  }

  // Per-source retention, so Job sources can show what each board is worth.
  for (const source of sources.slice(0, MAX_SOURCES_PER_RUN)) {
    const relevant = relevantBySource.get(source.id);
    const uk = ukBySource.get(source.id);
    if (relevant === undefined && uk === undefined) continue;
    await db
      .from("job_source_companies")
      .update({ relevant_jobs: relevant ?? 0, uk_jobs_open: uk ?? 0 } as never)
      .eq("id", source.id);
  }



  // Step 6: structured description analysis for every retained vacancy, not
  // only the ones found in this run. Bounded, cached by description hash, and
  // failures are recorded so they can be retried.
  const analysisOutcome = await analyseStoredJobs(db, MAX_AI_ANALYSES_PER_RUN);
  analysed = analysisOutcome.analysed + analysisOutcome.reused;
  analysisFailures = analysisOutcome.failures;
  analysisPending = analysisOutcome.pending;


  // Step 7: re-verify a bounded set of older active jobs and expire dead ones.
  const { data: staleRows } = await db
    .from("jobs")
    .select("id, canonical_apply_url, last_verified_at, discovered_at")
    .eq("is_demo", false)
    .eq("is_active", true)
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .limit(15);
  for (const row of (staleRows ?? []) as Array<Record<string, unknown>>) {
    if (!needsVerification((row["last_verified_at"] as string) ?? null, (row["discovered_at"] as string) ?? null)) continue;
    const result = await verifyJobLink((row["canonical_apply_url"] as string) ?? null);
    verified += 1;
    const isDead = result.status === "expired" || result.status === "broken";
    if (isDead) expiredCount += 1;
    await db
      .from("jobs")
      .update({
        live_status: result.status,
        verification_reason: result.reason,
        last_verified_at: result.checkedAt,
        is_active: !isDead,
      } as never)
      .eq("id", row["id"] as string);

    // A saved job that dies is worth telling the user about.
    if (isDead) {
      const { data: saved } = await db
        .from("saved_jobs")
        .select("job_id")
        .eq("user_id", userId)
        .eq("job_id", row["id"] as string)
        .maybeSingle();
      if (saved) {
        await db.from("notifications").insert({
          user_id: userId,
          type: "saved_job_unavailable",
          title: "A saved job is no longer available",
          message: result.reason,
          job_id: row["id"] as string,
        } as never);
      }
    }
  }

  // Steps 8-10: match, score, rank, notify.
  const score = await scoreUserMatches(db, userId);

  const failedSources = logs.filter((l) => l.status === "failed").length;
  const successfulSources = logs.filter((l) => l.status === "success").length;
  const status: DiscoveryOutcome["status"] =
    sources.length === 0 && !searchProviderConfig().connected
      ? "no_sources"
      : failedSources > 0
        ? "completed_with_warnings"
        : "completed";

  if (logs.length > 0) {
    await db.from("scan_source_logs").insert(
      logs.map((l) => ({ ...l, scan_run_id: scanRunId, user_id: userId })) as never,
    );
  }

  await db
    .from("scan_runs")
    .update({
      completed_at: new Date().toISOString(),
      status,
      sources_checked: logs.length,
      sources_succeeded: successfulSources,
      sources_failed: failedSources,
      jobs_discovered: normalizedAll.length,
      jobs_new: inserted,
      jobs_updated: updated,
      jobs_verified: verified,
      jobs_expired: expiredCount,
      duplicates_removed: duplicates,
      jobs_filtered: filtered,
      jobs_analysed: analysed,
      strong_matches: score.strongMatches,
      errors_json: logs.filter((l) => l.error_text).map((l) => ({ source: l.provider, identifier: l.provider_identifier, error: l.error_text })),
    } as never)
    .eq("id", scanRunId);

  // Company Monitor bookkeeping: real numbers from this run only.
  await db
    .from("company_monitor_state")
    .upsert(
      {
        user_id: userId,
        ...(trigger === "scheduled"
          ? { last_scheduled_scan_at: new Date().toISOString() }
          : {
              last_full_scan_at: new Date().toISOString(),
              last_full_scan_trigger: trigger,
              last_full_scan_status: status,
              last_full_scan_detail: `${successfulSources} sources checked, ${inserted} new vacancies`,
            }),
        jobs_fetched_last_scan: normalizedAll.length,
        technology_jobs_last_scan: filtered,
        new_technology_jobs_last_scan: inserted,
      } as never,
      { onConflict: "user_id" } as never,
    );

  const { count: realJobsTotal } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", false)
    .eq("is_active", true);

  const note =
    status === "no_sources"
      ? "No live sources are configured yet. Add an employer job board in Settings → Job sources, or connect a general job search provider."
      : status === "completed_with_warnings"
        ? `${successfulSources} source(s) worked, ${failedSources} failed — see Automation status for the exact errors.`
        : `${successfulSources} source(s) checked, ${inserted} new vacancies stored.`;

  return {
    scanRunId,
    status,
    sourcesChecked: logs.length,
    sourcesSucceeded: successfulSources,
    sourcesFailed: failedSources,
    discovered: normalizedAll.length,
    inserted,
    updated,
    duplicates,
    verified,
    expired: expiredCount,
    analysed,
    analysisFailures,
    analysisPending,

    filtered,
    strongMatches: score.strongMatches,
    applyAsap: score.applyAsap,
    scored: score.scored,
    realJobsTotal: realJobsTotal ?? 0,
    logs,
    note,
  };
}

export { linkFactor };
export type { NormalizedJob };
