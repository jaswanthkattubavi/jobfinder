import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DiscoveryOutcome } from "./discovery.server";

/**
 * Run Scan Now.
 *
 * This runs the real pipeline: configured employer job boards are fetched,
 * normalized, deduplicated, link-verified, filtered, sponsorship-checked,
 * analysed, scored and ranked. If no source is configured, the scan says so
 * plainly instead of pretending to discover anything.
 */

export interface ScanSummary {
  scanned: number;
  scored: number;
  strongMatches: number;
  applyAsap: number;
  sourcesConnected: number;
  sourcesFailed: number;
  discoveredNew: number;
  duplicates: number;
  verified: number;
  expired: number;
  analysed: number;
  status: DiscoveryOutcome["status"];
  note: string;
}

export const runScanServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ScanSummary> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runDiscovery } = await import("./discovery.server");
    const result = await runDiscovery(supabaseAdmin as never, context.userId, "manual");
    return {
      scanned: result.discovered,
      scored: result.scored,
      strongMatches: result.strongMatches,
      applyAsap: result.applyAsap,
      sourcesConnected: result.sourcesSucceeded,
      sourcesFailed: result.sourcesFailed,
      discoveredNew: result.inserted,
      duplicates: result.duplicates,
      verified: result.verified,
      expired: result.expired,
      analysed: result.analysed,
      status: result.status,
      note: result.note,
    };
  });
