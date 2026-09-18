import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DiscoveryOutcome } from "./discovery.server";
import { providerById, type ProviderId } from "./sources/providers";

/**
 * Server functions for the real discovery engine: source configuration,
 * connection tests, the scan itself, and honest automation status.
 *
 * Writes to shared tables (companies, jobs, analyses) use the service role
 * because those tables are read-only to signed-in users by design. Every
 * handler verifies the caller first and scopes all user data to their own id.
 */

export interface JobSourceConfig {
  id: string;
  companyName: string;
  provider: ProviderId;
  providerIdentifier: string;
  careersUrl: string | null;
  enabled: boolean;
  experimental: boolean;
  priority: string;
  sector: string | null;
  validationStatus: "unvalidated" | "validated" | "failed";
  validatedAt: string | null;
  health: "unknown" | "healthy" | "warning" | "failed" | "disabled";
  lastScanAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastJobCount: number;
  jobsOpen: number | null;
  ukJobsOpen: number | null;
  relevantJobs: number | null;
  notes: string | null;
}

function mapSource(row: Record<string, unknown>): JobSourceConfig {
  const enabled = row["enabled"] !== false;
  const health = (row["health"] as JobSourceConfig["health"]) ?? "unknown";
  return {
    id: row["id"] as string,
    companyName: row["company_name"] as string,
    provider: row["provider"] as ProviderId,
    providerIdentifier: row["provider_identifier"] as string,
    careersUrl: (row["careers_url"] as string) ?? null,
    enabled,
    experimental: row["experimental"] === true,
    priority: (row["priority"] as string) ?? "normal",
    sector: (row["sector"] as string) ?? null,
    validationStatus: (row["validation_status"] as JobSourceConfig["validationStatus"]) ?? "unvalidated",
    validatedAt: (row["validated_at"] as string) ?? null,
    health: enabled ? health : "disabled",
    lastScanAt: (row["last_scan_at"] as string) ?? null,
    lastAttemptAt: (row["last_attempt_at"] as string) ?? null,
    lastSuccessAt: (row["last_success_at"] as string) ?? null,
    lastError: (row["last_error"] as string) ?? null,
    consecutiveFailures: Number(row["consecutive_failures"] ?? 0),
    lastJobCount: Number(row["last_job_count"] ?? 0),
    jobsOpen: row["jobs_open"] === null || row["jobs_open"] === undefined ? null : Number(row["jobs_open"]),
    ukJobsOpen: row["uk_jobs_open"] === null || row["uk_jobs_open"] === undefined ? null : Number(row["uk_jobs_open"]),
    relevantJobs:
      row["relevant_jobs"] === null || row["relevant_jobs"] === undefined ? null : Number(row["relevant_jobs"]),
    notes: (row["notes"] as string) ?? null,
  };
}

export const listJobSourcesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JobSourceConfig[]> => {
    const { data, error } = await context.supabase
      .from("job_source_companies")
      .select("*")
      .eq("user_id", context.userId)
      .order("company_name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapSource);
  });

export const saveJobSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string | null;
    companyName: string;
    provider: ProviderId;
    providerIdentifier: string;
    careersUrl?: string | null;
    enabled?: boolean;
    priority?: string;
    notes?: string | null;
  }) => {
    if (!input.companyName?.trim()) throw new Error("Company name is required");
    if (!input.providerIdentifier?.trim()) throw new Error("Board identifier is required");
    if (!providerById[input.provider]) throw new Error("Unknown job source type");
    return input;
  })
  .handler(async ({ data, context }): Promise<JobSourceConfig> => {
    const meta = providerById[data.provider];
    const row = {
      user_id: context.userId,
      company_name: data.companyName.trim(),
      provider: data.provider,
      provider_identifier: data.providerIdentifier.trim(),
      careers_url: data.careersUrl?.trim() || null,
      enabled: data.enabled !== false,
      experimental: meta.experimental,
      priority: data.priority ?? "normal",
      notes: data.notes ?? null,
    };
    const query = data.id
      ? context.supabase.from("job_source_companies").update(row as never).eq("id", data.id).eq("user_id", context.userId).select("*").single()
      : context.supabase.from("job_source_companies").insert(row as never).select("*").single();
    const { data: saved, error } = await query;
    if (error || !saved) throw new Error(error?.message ?? "Could not save this job source");
    return mapSource(saved as Record<string, unknown>);
  });

export const deleteJobSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("job_source_companies")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });

export interface SourceTestResult {
  ok: boolean;
  jobsFound: number;
  ukJobsFound: number;
  sampleTitles: string[];
  message: string;
}

/** Tests a real fetch against the provider — no simulated success. */
export const testJobSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: ProviderId; providerIdentifier: string }) => input)
  .handler(async ({ data }): Promise<SourceTestResult> => {
    const { adapterFor } = await import("./sources/registry");
    const adapter = adapterFor(data.provider);
    if (!adapter || !adapter.enabled) {
      return { ok: false, jobsFound: 0, ukJobsFound: 0, sampleTitles: [], message: "This source type is not connected." };
    }
    try {
      const jobs = await adapter.fetchJobs({ identifier: data.providerIdentifier.trim() });
      const uk = jobs.filter((j) => /united kingdom|\buk\b|england|scotland|wales|london|manchester|edinburgh|birmingham|bristol|leeds|glasgow|cambridge|oxford/i.test(j.locationText ?? ""));
      return {
        ok: true,
        jobsFound: jobs.length,
        ukJobsFound: uk.length,
        sampleTitles: jobs.slice(0, 5).map((j) => j.title),
        message:
          jobs.length === 0
            ? "Connected, but this board currently lists no vacancies."
            : `Connected — ${jobs.length} vacancies published, ${uk.length} in the UK.`,
      };
    } catch (err) {
      return { ok: false, jobsFound: 0, ukJobsFound: 0, sampleTitles: [], message: (err as Error).message };
    }
  });

export interface LibraryImportResult {
  processed: number;
  added: number;
  skipped: number;
  failed: number;
  total: number;
  nextOffset: number;
  done: boolean;
  failures: Array<{ company: string; provider: string; error: string }>;
}

/**
 * Adds the curated employer library, one batch at a time.
 *
 * Every board is re-tested against the employer's live careers system as it is
 * added: only boards that genuinely answer are enabled and marked validated.
 * A board that fails is still recorded (disabled, with the error) so it can be
 * reviewed rather than silently forgotten.
 */
export const importCompanyLibraryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offset?: number; batchSize?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<LibraryImportResult> => {
    const { companyLibrary } = await import("./sources/company-library");
    const { adapterFor } = await import("./sources/registry");

    const offset = Math.max(0, Number(data.offset ?? 0));
    const batchSize = Math.min(12, Math.max(1, Number(data.batchSize ?? 8)));
    const batch = companyLibrary.slice(offset, offset + batchSize);

    const { data: existingRows } = await context.supabase
      .from("job_source_companies")
      .select("provider, provider_identifier")
      .eq("user_id", context.userId);
    const existing = new Set(
      ((existingRows ?? []) as Array<Record<string, unknown>>).map(
        (r) => `${r["provider"]}::${String(r["provider_identifier"]).toLowerCase()}`,
      ),
    );

    let added = 0;
    let skipped = 0;
    let failed = 0;
    const failures: LibraryImportResult["failures"] = [];

    for (const entry of batch) {
      if (existing.has(`${entry.provider}::${entry.identifier.toLowerCase()}`)) {
        skipped += 1;
        continue;
      }
      const adapter = adapterFor(entry.provider);
      const meta = providerById[entry.provider];
      const now = new Date().toISOString();

      let jobsOpen: number | null = null;
      let ukOpen: number | null = null;
      let error: string | null = null;
      try {
        if (!adapter?.enabled) throw new Error("Adapter is not connected");
        const jobs = await adapter.fetchJobs({ identifier: entry.identifier });
        jobsOpen = jobs.length;
        ukOpen = jobs.filter((j) =>
          /united kingdom|\buk\b|england|scotland|wales|northern ireland|london|manchester|edinburgh|birmingham|bristol|leeds|glasgow|cambridge|oxford|reading|belfast|cardiff/i.test(
            j.locationText ?? "",
          ),
        ).length;
        if (jobsOpen === 0) throw new Error("Board responded but currently lists no vacancies");
      } catch (err) {
        error = (err as Error).message.slice(0, 400);
      }

      const validated = error === null;
      const { error: insertError } = await context.supabase.from("job_source_companies").insert({
        user_id: context.userId,
        company_name: entry.company,
        provider: entry.provider,
        provider_identifier: entry.identifier,
        careers_url: entry.careersUrl,
        source_url: entry.careersUrl,
        sector: entry.sector,
        priority: entry.priority,
        experimental: meta.experimental,
        // Nothing is switched on until its own live test passed.
        enabled: validated,
        validation_status: validated ? "validated" : "failed",
        validated_at: validated ? now : null,
        validation_error: error,
        health: validated ? "healthy" : "failed",
        last_attempt_at: now,
        jobs_open: jobsOpen,
        uk_jobs_open: ukOpen,
        notes: `Library entry (${entry.sector})`,
      } as never);

      if (insertError) {
        failed += 1;
        failures.push({ company: entry.company, provider: entry.provider, error: insertError.message });
        continue;
      }
      if (validated) added += 1;
      else {
        failed += 1;
        failures.push({ company: entry.company, provider: entry.provider, error: error ?? "unknown" });
      }
    }

    const nextOffset = offset + batch.length;
    return {
      processed: batch.length,
      added,
      skipped,
      failed,
      total: companyLibrary.length,
      nextOffset,
      done: nextOffset >= companyLibrary.length,
      failures,
    };
  });

export const runDiscoveryScanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscoveryOutcome> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runDiscovery } = await import("./discovery.server");
    return runDiscovery(supabaseAdmin as never, context.userId, "manual");
  });

/** Re-scores stored jobs after a profile/preference change. No fetching. */
export const recalculateMatchesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { scoreUserMatches } = await import("./scoring.server");
    return scoreUserMatches(context.supabase as never, context.userId);
  });

/**
 * Analyses any retained vacancy that still has no structured analysis (or whose
 * description changed), then re-scores. Used for retries and for backfilling
 * jobs discovered before analysis existed.
 */
export const analyseBacklogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { analyseStoredJobs } = await import("./analysis.server");
    const { scoreUserMatches } = await import("./scoring.server");
    const analysis = await analyseStoredJobs(supabaseAdmin as never, 30);
    const scored = await scoreUserMatches(supabaseAdmin as never, context.userId);
    return { analysis, scored };
  });

export interface LearnedPreferenceItem {
  kind: string;
  value: string;
  positiveCount: number;
  negativeCount: number;
  adjustment: number;
}

/** What the user's own behaviour has taught the ranking, in plain numbers. */
export const listLearnedPreferencesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LearnedPreferenceItem[]> => {
    const { data } = await context.supabase
      .from("learned_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .order("adjustment", { ascending: false });
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      kind: r["signal_kind"] as string,
      value: r["signal_value"] as string,
      positiveCount: Number(r["positive_count"] ?? 0),
      negativeCount: Number(r["negative_count"] ?? 0),
      adjustment: Number(r["adjustment"] ?? 0),
    }));
  });

export const resetLearnedPreferencesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("learned_preferences")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { cleared: true };
  });


/* ---------------- UK sponsor register ---------------- */

/**
 * Imports one chunk of the official GOV.UK sponsor register. The caller keeps
 * passing back batchId/nextOffset until `done` is true.
 */
export const importSponsorRegisterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { batchId?: string | null; offset?: number }) => data ?? {})
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { importRegisterChunk } = await import("./sponsor-register.server");
    return importRegisterChunk(supabaseAdmin as never, data);
  });

/** Re-runs employer matching and vacancy sponsorship analysis. No rediscovery. */
export const reanalyseSponsorshipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { reanalyseSponsorship } = await import("./sponsor-register.server");
    const { scoreUserMatches } = await import("./scoring.server");
    const sponsorship = await reanalyseSponsorship(supabaseAdmin as never);
    const scored = await scoreUserMatches(supabaseAdmin as never, context.userId);
    return { sponsorship, scored };
  });

export const getSponsorRegisterStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sponsorRegisterStatus } = await import("./sponsor-register.server");
    return sponsorRegisterStatus(context.supabase as never);
  });

export interface AutomationStatus {
  key: string;
  name: string;
  state: "working_live" | "partially_working" | "not_connected" | "requires_configuration";
  detail: string;
}

export interface ProviderSummary {
  provider: ProviderId;
  name: string;
  experimental: boolean;
  configured: number;
  enabled: number;
  validated: number;
  healthy: number;
  attention: number;
  ukJobsOpen: number;
  relevantJobs: number;
  libraryAvailable: number;
}

export interface AutomationSnapshot {
  statuses: AutomationStatus[];
  configuredSources: number;
  workingSources: number;
  failingSources: number;
  realJobs: number;
  lastScanAt: string | null;
  lastScanStatus: string | null;
  recentErrors: Array<{ provider: string; identifier: string | null; error: string }>;
  sponsorRegister: import("./sponsor-register.server").SponsorRegisterStatus;
  providers: ProviderSummary[];
  monitoredEmployers: number;
  healthySources: number;
  sourcesNeedingAttention: number;
  libraryTotal: number;
}

export const getAutomationStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutomationSnapshot> => {
    const { searchProviderConfig } = await import("./sources/search-provider");
    const { emailProviderConfig } = await import("./email/provider.server");
    const emailProvider = emailProviderConfig();
    const { aiAnalysisAvailable } = await import("./ai-analysis.server");
    const { sponsorRegisterStatus } = await import("./sponsor-register.server");
    const sponsorRegister = await sponsorRegisterStatus(context.supabase as never);


    const [sourcesRes, lastRunRes, realJobsRes, registerRes, logsRes, analysedRes, failedAnalysisRes, scheduledRunRes] =
      await Promise.all([
        context.supabase.from("job_source_companies").select("*").eq("user_id", context.userId),
        context.supabase
          .from("scan_runs")
          .select("started_at, status")
          .eq("user_id", context.userId)
          .eq("is_demo", false)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        context.supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_demo", false).eq("is_active", true),
        context.supabase.from("sponsor_register_entries").select("id", { count: "exact", head: true }),
        context.supabase
          .from("scan_source_logs")
          .select("provider, provider_identifier, status, error_text, created_at")
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(40),
        context.supabase
          .from("job_analysis")
          .select("job_id, jobs!inner(is_demo, is_active)", { count: "exact", head: true })
          .eq("analysis_status", "completed")
          .eq("jobs.is_demo", false)
          .eq("jobs.is_active", true),
        context.supabase
          .from("job_analysis")
          .select("job_id, jobs!inner(is_demo, is_active)", { count: "exact", head: true })
          .eq("analysis_status", "failed")
          .eq("jobs.is_demo", false)
          .eq("jobs.is_active", true),
        context.supabase
          .from("scan_runs")
          .select("started_at, status")
          .eq("trigger_type", "scheduled")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const sources = ((sourcesRes.data ?? []) as Array<Record<string, unknown>>).map(mapSource);
    const logs = (logsRes.data ?? []) as Array<Record<string, unknown>>;
    const search = searchProviderConfig();
    const registerCount = registerRes.count ?? 0;
    const cronConfigured = Boolean(process.env["LOVABLE_CRON_SECRET"]);
    const analysedCount = analysedRes.count ?? 0;
    const failedAnalysis = failedAnalysisRes.count ?? 0;
    const realJobCount = realJobsRes.count ?? 0;
    const lastScheduledRun = (scheduledRunRes.data as { started_at?: string; status?: string } | null) ?? null;
    const { companyLibrary, libraryCountsByProvider } = await import("./sources/company-library");
    const libraryCounts = libraryCountsByProvider();



    const summaryFor = (provider: ProviderId): ProviderSummary => {
      const meta = providerById[provider];
      const own = sources.filter((s) => s.provider === provider);
      return {
        provider,
        name: meta.name,
        experimental: meta.experimental,
        configured: own.length,
        enabled: own.filter((s) => s.enabled).length,
        validated: own.filter((s) => s.validationStatus === "validated").length,
        healthy: own.filter((s) => s.enabled && s.health === "healthy").length,
        attention: own.filter((s) => s.health === "warning" || s.health === "failed").length,
        ukJobsOpen: own.reduce((n, s) => n + (s.ukJobsOpen ?? 0), 0),
        relevantJobs: own.reduce((n, s) => n + (s.relevantJobs ?? 0), 0),
        libraryAvailable: libraryCounts[provider] ?? 0,
      };
    };

    const perProvider = (provider: ProviderId): AutomationStatus => {
      const meta = providerById[provider];
      const summary = summaryFor(provider);
      const configured = sources.filter((s) => s.provider === provider && s.enabled);
      const recent = logs.filter((l) => l["provider"] === provider);
      const worked = recent.some((l) => l["status"] === "success");
      const failed = recent.filter((l) => l["status"] === "failed");
      if (configured.length === 0) {
        return {
          key: provider,
          name: meta.name,
          state: "requires_configuration",
          detail: `Adapter is built and ready. ${summary.libraryAvailable} checked ${meta.name} employer(s) are available in the library — import them or add a board identifier.`,
        };
      }
      if (worked && failed.length === 0) {
        return {
          key: provider,
          name: meta.name,
          state: meta.experimental ? "partially_working" : "working_live",
          detail: `${configured.length} employer board(s) enabled and returning live vacancies${summary.relevantJobs > 0 ? `, ${summary.relevantJobs} relevant vacancies retained` : ""}.${meta.experimental ? " Experimental: validated per employer only." : ""}`,
        };
      }
      if (worked) {
        return {
          key: provider,
          name: meta.name,
          state: "partially_working",
          detail: `${configured.length} board(s) configured; ${failed.length} recent failure(s).`,
        };
      }
      return {
        key: provider,
        name: meta.name,
        state: failed.length > 0 ? "partially_working" : "requires_configuration",
        detail:
          failed.length > 0
            ? `Configured, but the last attempt failed: ${(failed[0]?.["error_text"] as string) ?? "unknown error"}`
            : "Configured — will be checked on the next scan.",
      };
    };

    const statuses: AutomationStatus[] = [
      perProvider("greenhouse"),
      perProvider("lever"),
      perProvider("ashby"),
      perProvider("smartrecruiters"),
      perProvider("workday"),
      {
        key: "search_provider",
        name: "General job search",
        state: search.connected && search.endpoint ? "working_live" : "requires_configuration",
        detail:
          search.connected && search.endpoint
            ? `${search.name} is connected and searched alongside the monitored employers.`
            : `Needs ${search.requiredSecrets.join(" and ")} (free developer keys from Adzuna) before it can return anything.`,
      },
      {
        key: "sponsor_register",
        name: "UK sponsor register",
        state: !sponsorRegister.connected
          ? registerCount > 0
            ? "partially_working"
            : "requires_configuration"
          : sponsorRegister.method === "automatic"
            ? "working_live"
            : "partially_working",
        detail: !sponsorRegister.connected
          ? registerCount > 0
            ? `A part-loaded dataset of ${registerCount} organisations is present — finish the refresh in Settings.`
            : "Wording-based sponsorship analysis works today. Import the official register to add licence evidence."
          : `${sponsorRegister.entries.toLocaleString("en-GB")} licensed sponsors from the official ${sponsorRegister.method === "automatic" ? "GOV.UK download" : "manual dataset"} dated ${sponsorRegister.datasetDate ?? "unknown"}. ${sponsorRegister.companiesMatched} employer(s) matched, ${sponsorRegister.companiesReview} need review, ${sponsorRegister.companiesNotFound} not found.`,
      },
      {
        key: "ai_analysis",
        name: "AI job analysis",
        state: !aiAnalysisAvailable()
          ? "not_connected"
          : analysedCount === 0
            ? "requires_configuration"
            : analysedCount >= realJobCount && failedAnalysis === 0
              ? "working_live"
              : "partially_working",
        detail: !aiAnalysisAvailable()
          ? "Not connected — rule-based analysis is used instead."
          : `${analysedCount} of ${realJobCount} live vacancies have a full structured analysis${failedAnalysis > 0 ? `, ${failedAnalysis} failed and can be retried` : ""}.`,
      },
      {
        key: "scheduler",
        name: "Daily scheduler",
        state: !cronConfigured
          ? "not_connected"
          : lastScheduledRun
            ? "working_live"
            : "requires_configuration",
        detail: !cronConfigured
          ? "Scans run when you press Run Scan Now."
          : lastScheduledRun
            ? `A daily 06:00 Europe/London trigger is in place; it last ran ${new Date(lastScheduledRun.started_at ?? "").toLocaleString("en-GB")} (${lastScheduledRun.status}).`
            : "Scan endpoint and secret are ready; the daily 06:00 Europe/London trigger has not fired yet.",
      },

      {
        key: "notifications_in_app",
        name: "In-app notifications",
        state: "working_live",
        detail: "Apply ASAP alerts and expiring saved jobs appear in the app.",
      },
      {
        key: "notifications_email",
        name: "Email notifications",
        state: emailProvider.connected
          ? emailProvider.usingTestSender
            ? "partially_working"
            : "working_live"
          : "requires_configuration",
        detail: emailProvider.connected
          ? emailProvider.usingTestSender
            ? "Resend is connected but no verified sending domain is set, so email only reaches your own Resend account address."
            : `Resend is connected and sending as ${emailProvider.from}.`
          : `Needs ${emailProvider.requiredSecrets.join(", ")} before any digest can be sent.`,
      },
    ];

    return {
      statuses,
      configuredSources: sources.length,
      workingSources: sources.filter((s) => s.lastSuccessAt).length,
      failingSources: sources.filter((s) => s.consecutiveFailures > 0).length,
      realJobs: realJobCount,
      lastScanAt: ((lastRunRes.data as { started_at?: string } | null)?.started_at) ?? null,
      lastScanStatus: ((lastRunRes.data as { status?: string } | null)?.status) ?? null,
      recentErrors: logs
        .filter((l) => l["error_text"] && l["status"] === "failed")
        .slice(0, 8)
        .map((l) => ({
          provider: l["provider"] as string,
          identifier: (l["provider_identifier"] as string) ?? null,
          error: l["error_text"] as string,
        })),
      sponsorRegister,
      providers: (["greenhouse", "lever", "ashby", "smartrecruiters", "workday"] as ProviderId[]).map(summaryFor),
      monitoredEmployers: sources.filter((s) => s.enabled).length,
      healthySources: sources.filter((s) => s.enabled && s.health === "healthy").length,
      sourcesNeedingAttention: sources.filter((s) => s.health === "warning" || s.health === "failed").length,
      libraryTotal: companyLibrary.length,
    };
  });
