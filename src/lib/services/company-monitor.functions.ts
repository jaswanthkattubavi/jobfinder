import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { targetUniverseCounts } from "./sources/target-registry";

/**
 * Direct Company Monitor server functions.
 *
 * Registry sync, resumable validation of the 400-company universe, honest
 * status reporting, and single-company rescans. Every number reported here is
 * read back from the database — nothing is estimated.
 */

export interface MonitorCompany {
  id: string;
  company: string;
  group: "established" | "startup" | null;
  sector: string | null;
  domain: string | null;
  provider: string;
  identifier: string;
  careersUrl: string | null;
  endpoint: string | null;
  discoveryMethod: string | null;
  sourceStatus: string;
  reason: string | null;
  evidence: string | null;
  enabled: boolean;
  jobsOpen: number | null;
  ukJobsOpen: number | null;
  technologyJobs: number | null;
  newJobsLastScan: number | null;
  lastScanAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  isTarget: boolean;
}

export interface MonitorSummary {
  registryTotal: number;
  registryEstablished: number;
  registryStartup: number;
  rows: number;
  validationStatus: string;
  validationCursor: number;
  validationCompletedAt: string | null;
  byStatus: Record<string, number>;
  byGroup: Record<string, { healthy: number; warning: number; needsConfig: number; failed: number; total: number }>;
  byProvider: Record<string, { companies: number; jobsOpen: number; ukJobsOpen: number }>;
  monitoredCompanies: number;
  jobsOpenTotal: number;
  ukJobsOpenTotal: number;
  technologyJobsTotal: number;
  lastFullScanAt: string | null;
  lastFullScanTrigger: string | null;
  lastFullScanStatus: string | null;
  lastScheduledScanAt: string | null;
  jobsFetchedLastScan: number;
  technologyJobsLastScan: number;
  newTechnologyJobsLastScan: number;
  problems: Array<{ company: string; status: string; reason: string | null }>;
}

function mapRow(row: Record<string, unknown>): MonitorCompany {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: row["id"] as string,
    company: row["company_name"] as string,
    group: (row["company_group"] as MonitorCompany["group"]) ?? null,
    sector: (row["sector"] as string) ?? null,
    domain: (row["official_domain"] as string) ?? null,
    provider: (row["provider"] as string) ?? "unknown",
    identifier: (row["provider_identifier"] as string) ?? "",
    careersUrl: (row["careers_url"] as string) ?? null,
    endpoint: (row["source_endpoint"] as string) ?? null,
    discoveryMethod: (row["discovery_method"] as string) ?? null,
    sourceStatus: (row["source_status"] as string) ?? "needs_configuration",
    reason: (row["needs_config_reason"] as string) ?? null,
    evidence: (row["validation_evidence"] as string) ?? null,
    enabled: row["enabled"] === true,
    jobsOpen: num(row["jobs_open"]),
    ukJobsOpen: num(row["uk_jobs_open"]),
    technologyJobs: num(row["technology_jobs"]),
    newJobsLastScan: num(row["new_jobs_last_scan"]),
    lastScanAt: (row["last_scan_at"] as string) ?? null,
    lastSuccessAt: (row["last_success_at"] as string) ?? null,
    lastError: (row["last_error"] as string) ?? null,
    isTarget: row["is_target_universe"] === true,
  };
}

export const syncTargetUniverseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ created: number; total: number }> => {
    const { syncRegistry } = await import("./company-monitor.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await syncRegistry(supabaseAdmin as never, context.userId);
    await (supabaseAdmin as never as {
      from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> };
    })
      .from("company_monitor_state")
      .upsert(
        { user_id: context.userId, registry_total: targetUniverseCounts.total },
        { onConflict: "user_id" },
      );
    return { created: result.created, total: result.total };
  });

/**
 * One bounded, resumable validation batch. Each call walks the next slice of
 * the registry, so 400 companies complete across successive calls without ever
 * running unbounded work in a single request.
 */
export const validateCompanyBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batchSize?: number; reset?: boolean }) => ({
    batchSize: Math.min(Math.max(input?.batchSize ?? 25, 1), 40),
    reset: input?.reset === true,
  }))
  .handler(async ({ data, context }) => {
    const { validateCompany } = await import("./company-monitor.server");
    const { targetUniverse } = await import("./sources/target-registry");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as {
      from: (t: string) => any;
    };

    const state = await db.from("company_monitor_state").select("*").eq("user_id", context.userId).maybeSingle();
    let cursor = data.reset ? 0 : Number(state.data?.validation_cursor ?? 0);
    if (data.reset || !state.data) {
      await db.from("company_monitor_state").upsert(
        {
          user_id: context.userId,
          registry_total: targetUniverse.length,
          validation_cursor: 0,
          validation_started_at: new Date().toISOString(),
          validation_completed_at: null,
          validation_status: "running",
        },
        { onConflict: "user_id" },
      );
      cursor = 0;
    }

    const slice = targetUniverse.slice(cursor, cursor + data.batchSize);
    const existing = await db
      .from("job_source_companies")
      .select("id, company_name, provider, enabled, validation_status, source_status")
      .eq("user_id", context.userId);
    const byName = new Map(
      ((existing.data ?? []) as Array<Record<string, unknown>>).map((r) => [
        String(r["company_name"]).toLowerCase(),
        r,
      ]),
    );

    let healthy = 0;
    let needsConfig = 0;
    let skipped = 0;

    const worker = async (index: number) => {
      const target = slice[index];
      if (!target) return;
      const row = byName.get(target.name.toLowerCase());
      // A source that already works keeps its proven configuration untouched.
      if (row && row["provider"] !== "unknown" && row["enabled"] === true) {
        skipped += 1;
        await db
          .from("job_source_companies")
          .update({
            is_target_universe: true,
            company_group: target.group,
            sector: target.sector,
            official_domain: target.domain,
            source_status: "healthy",
          })
          .eq("id", row["id"]);
        return;
      }

      const result = await validateCompany(target);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        user_id: context.userId,
        company_name: target.name,
        company_group: target.group,
        sector: target.sector,
        official_domain: target.domain,
        is_target_universe: true,
        source_status: result.sourceStatus,
        needs_config_reason: result.reason,
        validation_evidence: result.evidence,
        discovery_method: result.discoveryMethod,
        source_endpoint: result.endpoint,
        validated_at: now,
        last_attempt_at: now,
      };

      if (result.provider && result.sourceStatus.startsWith("healthy")) {
        Object.assign(patch, {
          provider: result.provider,
          provider_identifier: result.identifier,
          careers_url: result.careersUrl,
          enabled: true,
          validation_status: "validated",
          validation_error: null,
          health: "healthy",
          jobs_open: result.jobCount,
          uk_jobs_open: result.ukJobCount,
          last_error: null,
          consecutive_failures: 0,
        });
        healthy += 1;
      } else {
        Object.assign(patch, {
          provider: result.provider ?? "unknown",
          // Unresolved companies still need a unique identifier slot.
          provider_identifier:
            result.identifier ?? `pending:${target.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          enabled: false,
          validation_status: "failed",
          validation_error: result.reason,
          health: "unknown",
        });
        needsConfig += 1;
      }

      if (row) {
        await db.from("job_source_companies").update(patch).eq("id", row["id"]);
      } else {
        await db.from("job_source_companies").insert({
          ...patch,
          provider_identifier:
            patch["provider_identifier"] ||
            `pending:${target.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          priority: "normal",
        });
      }
    };

    // Bounded concurrency so employer sites are never hammered.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, slice.length) }, async () => {
        while (next < slice.length) {
          const index = next;
          next += 1;
          await worker(index);
        }
      }),
    );

    const newCursor = cursor + slice.length;
    const done = newCursor >= targetUniverse.length;
    await db
      .from("company_monitor_state")
      .update({
        validation_cursor: newCursor,
        validation_status: done ? "completed" : "running",
        validation_completed_at: done ? new Date().toISOString() : null,
      })
      .eq("user_id", context.userId);

    return {
      processed: slice.length,
      cursor: newCursor,
      total: targetUniverse.length,
      done,
      healthy,
      needsConfig,
      skipped,
    };
  });

export const monitorSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitorSummary> => {
    const [rowsRes, stateRes] = await Promise.all([
      context.supabase.from("job_source_companies").select("*").eq("user_id", context.userId),
      context.supabase.from("company_monitor_state").select("*").eq("user_id", context.userId).maybeSingle(),
    ]);
    const rows = ((rowsRes.data ?? []) as Array<Record<string, unknown>>).map(mapRow);
    const state = (stateRes.data ?? {}) as Record<string, unknown>;

    const byStatus: MonitorSummary["byStatus"] = {};
    const byGroup: MonitorSummary["byGroup"] = {
      established: { healthy: 0, warning: 0, needsConfig: 0, failed: 0, total: 0 },
      startup: { healthy: 0, warning: 0, needsConfig: 0, failed: 0, total: 0 },
    };
    const byProvider: MonitorSummary["byProvider"] = {};
    const problems: MonitorSummary["problems"] = [];

    let jobsOpenTotal = 0;
    let ukJobsOpenTotal = 0;
    let technologyJobsTotal = 0;
    let monitored = 0;

    for (const row of rows) {
      byStatus[row.sourceStatus] = (byStatus[row.sourceStatus] ?? 0) + 1;
      const group = row.group ?? null;
      if (group && byGroup[group]) {
        const bucket = byGroup[group]!;
        bucket.total += 1;
        if (row.sourceStatus.startsWith("healthy")) bucket.healthy += 1;
        else if (row.sourceStatus === "warning") bucket.warning += 1;
        else if (row.sourceStatus === "failed") bucket.failed += 1;
        else bucket.needsConfig += 1;
      }
      if (row.enabled && row.provider !== "unknown") {
        monitored += 1;
        const p = (byProvider[row.provider] ??= { companies: 0, jobsOpen: 0, ukJobsOpen: 0 });
        p.companies += 1;
        p.jobsOpen += row.jobsOpen ?? 0;
        p.ukJobsOpen += row.ukJobsOpen ?? 0;
      }
      jobsOpenTotal += row.jobsOpen ?? 0;
      ukJobsOpenTotal += row.ukJobsOpen ?? 0;
      technologyJobsTotal += row.technologyJobs ?? 0;
      if (!row.sourceStatus.startsWith("healthy")) {
        problems.push({ company: row.company, status: row.sourceStatus, reason: row.reason ?? row.lastError });
      }
    }

    return {
      registryTotal: targetUniverseCounts.total,
      registryEstablished: targetUniverseCounts.established,
      registryStartup: targetUniverseCounts.startup,
      rows: rows.length,
      validationStatus: (state["validation_status"] as string) ?? "not_started",
      validationCursor: Number(state["validation_cursor"] ?? 0),
      validationCompletedAt: (state["validation_completed_at"] as string) ?? null,
      byStatus,
      byGroup,
      byProvider,
      monitoredCompanies: monitored,
      jobsOpenTotal,
      ukJobsOpenTotal,
      technologyJobsTotal,
      lastFullScanAt: (state["last_full_scan_at"] as string) ?? null,
      lastFullScanTrigger: (state["last_full_scan_trigger"] as string) ?? null,
      lastFullScanStatus: (state["last_full_scan_status"] as string) ?? null,
      lastScheduledScanAt: (state["last_scheduled_scan_at"] as string) ?? null,
      jobsFetchedLastScan: Number(state["jobs_fetched_last_scan"] ?? 0),
      technologyJobsLastScan: Number(state["technology_jobs_last_scan"] ?? 0),
      newTechnologyJobsLastScan: Number(state["new_technology_jobs_last_scan"] ?? 0),
      problems: problems.slice(0, 500),
    };
  });

export const listMonitorCompaniesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitorCompany[]> => {
    const { data, error } = await context.supabase
      .from("job_source_companies")
      .select("*")
      .eq("user_id", context.userId)
      .order("company_name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
  });

/** Re-validate and rescan a single company's career source on demand. */
export const revalidateCompanyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("A company is required");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { validateCompany } = await import("./company-monitor.server");
    const { targetUniverse } = await import("./sources/target-registry");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as { from: (t: string) => any };

    const { data: row } = await context.supabase
      .from("job_source_companies")
      .select("*")
      .eq("user_id", context.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Company not found");

    const record = row as Record<string, unknown>;
    const target =
      targetUniverse.find((t) => t.name.toLowerCase() === String(record["company_name"]).toLowerCase()) ?? {
        name: String(record["company_name"]),
        domain: (record["official_domain"] as string) ?? null,
        sector: (record["sector"] as string) ?? "Unknown",
        group: ((record["company_group"] as string) ?? "established") as "established" | "startup",
      };

    const result = await validateCompany(target);
    const now = new Date().toISOString();
    const healthy = result.provider !== null && result.sourceStatus.startsWith("healthy");
    await db
      .from("job_source_companies")
      .update({
        source_status: result.sourceStatus,
        needs_config_reason: result.reason,
        validation_evidence: result.evidence,
        discovery_method: result.discoveryMethod,
        source_endpoint: result.endpoint,
        validated_at: now,
        last_attempt_at: now,
        ...(healthy
          ? {
              provider: result.provider,
              provider_identifier: result.identifier,
              careers_url: result.careersUrl,
              enabled: true,
              validation_status: "validated",
              validation_error: null,
              health: "healthy",
              jobs_open: result.jobCount,
              uk_jobs_open: result.ukJobCount,
            }
          : { validation_status: "failed", validation_error: result.reason }),
      })
      .eq("id", data.id);

    return {
      company: target.name,
      status: result.sourceStatus,
      provider: result.provider,
      identifier: result.identifier,
      jobs: result.jobCount,
      ukJobs: result.ukJobCount,
      reason: result.reason,
      evidence: result.evidence,
    };
  });
