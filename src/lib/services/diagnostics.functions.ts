import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { HealthReport } from "./automation.server";

/** System health and background-maintenance state, for the signed-in owner. */

export interface MaintenanceJobState {
  id: string;
  enabled: boolean;
  paused: boolean;
  pauseReason: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastDetail: string | null;
  nextRunAfter: string | null;
  consecutiveFailures: number;
}

export interface SystemHealth {
  report: HealthReport;
  maintenance: MaintenanceJobState[];
}

export const getSystemHealthFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemHealth> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildHealthReport } = await import("./automation.server");
    const report = await buildHealthReport(supabaseAdmin as never);
    const { data } = await context.supabase.from("automation_jobs").select("*");
    return {
      report,
      maintenance: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r["id"] as string,
        enabled: r["enabled"] !== false,
        paused: r["paused"] === true,
        pauseReason: (r["pause_reason"] as string) ?? null,
        lastRunAt: (r["last_run_at"] as string) ?? null,
        lastSuccessAt: (r["last_success_at"] as string) ?? null,
        lastStatus: (r["last_status"] as string) ?? null,
        lastDetail: (r["last_detail"] as string) ?? null,
        nextRunAfter: (r["next_run_after"] as string) ?? null,
        consecutiveFailures: Number(r["consecutive_failures"] ?? 0),
      })),
    };
  });

/** Runs the self-check on demand. Reads stored state only; spends nothing. */
export const runHealthCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildHealthReport } = await import("./automation.server");
    const report = await buildHealthReport(supabaseAdmin as never);
    await supabaseAdmin
      .from("automation_jobs")
      .update({
        last_run_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        last_status: "ok",
        last_detail: report.ok ? "All checks passed." : report.problems.join(" ").slice(0, 500),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", "health_check");
    return report;
  });
