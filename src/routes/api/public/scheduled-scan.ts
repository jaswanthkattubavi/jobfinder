import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Daily incremental discovery at 06:00 Europe/London.
 *
 * The database schedule fires at both 05:00 and 06:00 UTC so the run lands on
 * 06:00 local time in British Summer Time and in winter alike; this handler
 * checks the actual London hour and does nothing on the other call.
 *
 * Safety rails required for background AI/network jobs:
 * - single-flight lease so two triggers never scan in parallel,
 * - a hard cap on users processed per run,
 * - each user's scan isolated so one failure cannot stop the rest.
 */

const MAX_USERS_PER_RUN = 20;
const LEASE_MINUTES = 20;

function londonHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

export const Route = createFileRoute("/api/public/scheduled-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Two accepted callers: the platform cron secret, or the token stored
        // in scheduler settings for the database schedule.
        const bearer = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        const { data: settingsRow } = await supabaseAdmin
          .from("scheduler_settings")
          .select("*")
          .eq("id", "default")
          .maybeSingle();
        const settings = (settingsRow ?? {}) as Record<string, unknown>;
        const storedToken = (settings["cron_token"] as string) ?? null;
        const tokenMatches = Boolean(bearer && storedToken && bearer === storedToken);

        if (!tokenMatches) {
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }

        if (settings["enabled"] === false) {
          return Response.json({ skipped: true, reason: "Daily scanning is switched off" });
        }

        const targetHour = Number(settings["local_hour"] ?? 6);
        const url = new URL(request.url);
        const ignoreClock = url.searchParams.get("force") === "1";
        if (!ignoreClock && londonHour() !== targetHour) {
          return Response.json({
            skipped: true,
            reason: `Not ${String(targetHour).padStart(2, "0")}:00 Europe/London yet`,
          });
        }

        const { runDiscovery } = await import("@/lib/services/discovery.server");

        // Single-flight: a run still inside its lease window blocks a second one.
        const leaseCutoff = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString();
        const { data: inFlight } = await supabaseAdmin
          .from("scan_runs")
          .select("id, started_at")
          .eq("trigger_type", "scheduled")
          .eq("status", "running")
          .gte("started_at", leaseCutoff)
          .limit(1);
        if ((inFlight ?? []).length > 0) {
          return Response.json({ skipped: true, reason: "A scheduled scan is already running" });
        }

        const { data: users } = await supabaseAdmin
          .from("candidate_profiles")
          .select("user_id")
          .eq("onboarding_completed", true)
          .limit(MAX_USERS_PER_RUN);

        const { sendDigest, sendPriorityAlerts } = await import("@/lib/services/email/digest.server");

        const results: Array<{
          userId: string;
          status: string;
          newJobs?: number;
          digest?: string;
          error?: string;
        }> = [];
        for (const row of (users ?? []) as Array<{ user_id: string }>) {
          try {
            const outcome = await runDiscovery(supabaseAdmin as never, row.user_id, "scheduled");
            // Notifications and the morning brief are best-effort: a delivery
            // problem must never fail the scan that already succeeded.
            let digestNote = "not attempted";
            try {
              await sendPriorityAlerts(supabaseAdmin as never, row.user_id);
              const digest = await sendDigest(supabaseAdmin as never, row.user_id, outcome.scanRunId ?? null);
              digestNote = digest.sent ? "sent" : digest.reason;
            } catch (error) {
              digestNote = `digest failed: ${(error as Error).message}`;
              console.error("[scheduled-scan] digest failed for", row.user_id, error);
            }
            results.push({
              userId: row.user_id,
              status: outcome.status,
              newJobs: outcome.inserted,
              digest: digestNote,
            });
          } catch (error) {
            console.error("[scheduled-scan] failed for user", row.user_id, error);
            results.push({ userId: row.user_id, status: "failed", error: (error as Error).message });
          }
        }

        // Maintenance runs after the scans, each gated by its own lease and
        // schedule so it cannot pile up or run twice.
        const { runSponsorMaintenance, runHealthCheck } = await import("@/lib/services/automation.server");
        const sponsor = await runSponsorMaintenance(supabaseAdmin as never).catch((e: Error) => ({
          ran: false,
          detail: e.message,
        }));
        const health = await runHealthCheck(supabaseAdmin as never).catch((e: Error) => ({
          ran: false,
          detail: e.message,
        }));

        const failures = results.filter((r) => r.status === "failed").length;
        await supabaseAdmin
          .from("scheduler_settings")
          .update({
            last_triggered_at: new Date().toISOString(),
            last_status: failures > 0 ? "completed_with_errors" : "completed",
            last_detail: `${results.length} account(s) scanned${failures > 0 ? `, ${failures} failed` : ""}`,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", "default");

        return Response.json({ ran: results.length, results, sponsor, health });
      },
    },
  },
});
