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
        const { data: settingsRow, error: settingsError } = await supabaseAdmin
          .from("scheduler_settings")
          .select("*")
          .eq("id", "default")
          .maybeSingle();
        if (settingsError || !settingsRow) {
          return Response.json({ error: "Scheduler settings unavailable" }, { status: 503 });
        }
        const settings = settingsRow as Record<string, unknown>;
        const storedToken = (settings["cron_token"] as string) ?? null;
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const hash = (value: string) => createHash("sha256").update(value).digest();
        const tokenMatches = Boolean(
          bearer && storedToken && timingSafeEqual(hash(bearer), hash(storedToken)),
        );

        if (!tokenMatches) {
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }

        if (settings["enabled"] !== true) {
          return Response.json({ skipped: true, reason: "Daily scanning is switched off" });
        }

        const targetHour = Number(settings["local_hour"]);
        if (
          settings["local_hour"] == null ||
          !Number.isInteger(targetHour) ||
          targetHour < 0 ||
          targetHour > 23
        ) {
          return Response.json({ error: "Invalid scheduler hour" }, { status: 503 });
        }
        const url = new URL(request.url);
        const ignoreClock = url.searchParams.get("force") === "1";
        if (!ignoreClock && londonHour() !== targetHour) {
          return Response.json({
            skipped: true,
            reason: `Not ${String(targetHour).padStart(2, "0")}:00 Europe/London yet`,
          });
        }

        const { runDiscovery } = await import("@/lib/services/discovery.server");

        const { acquireSchedulerLease } = await import("@/lib/services/scheduler-lease.server");
        let lease;
        try {
          lease = await acquireSchedulerLease(supabaseAdmin as never, "daily-discovery");
        } catch (error) {
          console.error("[scheduled-scan] lease acquisition failed", error);
          return Response.json({ error: "Scheduler lease unavailable" }, { status: 503 });
        }
        if (!lease) {
          return Response.json({ skipped: true, reason: "A scheduled scan is already running" });
        }

        try {
          const { data: users, error: usersError } = await supabaseAdmin
            .from("candidate_profiles")
            .select("user_id")
            .eq("onboarding_completed", true)
            .limit(MAX_USERS_PER_RUN);

          if (usersError) throw new Error("Unable to load scheduled accounts");

          const { sendDigest, sendPriorityAlerts } =
            await import("@/lib/services/email/digest.server");

          const results: Array<{
            userId: string;
            status: string;
            newJobs?: number;
            digest?: string;
            applications?: unknown;
            error?: string;
          }> = [];
          for (const row of (users ?? []) as Array<{ user_id: string }>) {
            await lease.assertOwned();
            try {
              const outcome = await runDiscovery(supabaseAdmin as never, row.user_id, "scheduled");
              await lease.assertOwned();
              let applications: unknown;
              try {
                const { prepareDailyQueue } =
                  await import("@/lib/services/application-agent.server");
                applications = await prepareDailyQueue(supabaseAdmin as never, row.user_id);
              } catch (error) {
                applications = {
                  status: "failed",
                  error: error instanceof Error ? error.message : "Queue preparation failed",
                };
                console.error(
                  "[scheduled-scan] application preparation failed for",
                  row.user_id,
                  error,
                );
              }
              await lease.assertOwned();
              // Notifications and the morning brief are best-effort: a delivery
              // problem must never fail the scan that already succeeded.
              let digestNote = "not attempted";
              try {
                await sendPriorityAlerts(supabaseAdmin as never, row.user_id);
                const digest = await sendDigest(
                  supabaseAdmin as never,
                  row.user_id,
                  outcome.scanRunId ?? null,
                );
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
                applications,
              });
            } catch (error) {
              console.error("[scheduled-scan] failed for user", row.user_id, error);
              results.push({
                userId: row.user_id,
                status: "failed",
                error: (error as Error).message,
              });
            }
          }

          await lease.assertOwned();
          // Maintenance runs after the scans, each gated by its own lease and
          // schedule so it cannot pile up or run twice.
          const { runSponsorMaintenance, runHealthCheck } =
            await import("@/lib/services/automation.server");
          const sponsor = await runSponsorMaintenance(supabaseAdmin as never).catch((e: Error) => ({
            ran: false,
            detail: e.message,
          }));
          await lease.assertOwned();
          const health = await runHealthCheck(supabaseAdmin as never).catch((e: Error) => ({
            ran: false,
            detail: e.message,
          }));

          const failures = results.filter((r) => r.status === "failed").length;
          await lease.assertOwned();
          const { error: statusError } = await supabaseAdmin
            .from("scheduler_settings")
            .update({
              last_triggered_at: new Date().toISOString(),
              last_status: failures > 0 ? "completed_with_errors" : "completed",
              last_detail: `${results.length} account(s) scanned${failures > 0 ? `, ${failures} failed` : ""}`,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", "default");

          if (statusError) throw new Error("Unable to record scheduler status");
          return Response.json({ ran: results.length, results, sponsor, health });
        } catch (error) {
          console.error("[scheduled-scan] stopped", error);
          return Response.json(
            { error: "Scheduled run stopped; inspect server logs" },
            { status: 503 },
          );
        } finally {
          await lease.release().catch((error: unknown) => {
            // Failed releases remain locked until their bounded expiry.
            console.error("[scheduled-scan] lease release failed", error);
          });
        }
      },
    },
  },
});
