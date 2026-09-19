import { createClient } from "@supabase/supabase-js";
import { appendFile } from "node:fs/promises";
import { runDiscovery } from "../src/lib/services/discovery.server";
import { prepareDailyQueue } from "../src/lib/services/application-agent.server";
import { acquireSchedulerLease } from "../src/lib/services/scheduler-lease.server";

async function main() {
  if (process.argv.includes("--check")) {
    console.log("Daily-run imports validated. No database, AI, email or employer calls made.");
    return;
  }
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const userId = process.env["JOBFINDER_USER_ID"];
  if (!url || !key || !userId)
    throw new Error(
      "Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and JOBFINDER_USER_ID as repository secrets.",
    );
  if (!/^https:\/\//.test(url) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(userId))
    throw new Error("Invalid project URL or user ID.");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60000) }),
    },
  });
  const lease = await acquireSchedulerLease(db, "daily-discovery");
  if (!lease) {
    console.log("Another scan owns the lease; skipped.");
    return;
  }
  try {
    await lease.assertOwned();
    const profile = await db
      .from("candidate_profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile.error || !profile.data?.onboarding_completed)
      throw new Error("Complete the candidate profile in the database before enabling daily runs.");
    const scan = await runDiscovery(db, userId, "scheduled");
    await lease.assertOwned();
    const queue = await prepareDailyQueue(db, userId);
    // Public Actions logs must not contain CV text, answer memory, candidate details or provider responses.
    const summary = `Daily job discovery: ${scan.status}\nNew vacancies: ${scan.inserted}\nApplication packets prepared: ${queue.prepared}\nNo employer applications or emails were submitted by this workflow.\n`;
    console.log(summary);
    if (process.env["GITHUB_STEP_SUMMARY"])
      await appendFile(process.env["GITHUB_STEP_SUMMARY"], summary);
    if (scan.status === "no_sources")
      throw new Error("Configure employer sources before enabling daily runs.");
    if (scan.status === "failed")
      throw new Error("Discovery failed. Inspect private application diagnostics.");
  } finally {
    await lease.release();
  }
}
main().catch(() => {
  // No raw exception: remote services may include confidential URLs or request data.
  console.error(
    "Daily run failed. Check repository secret names, applied migrations, candidate setup and private scan diagnostics.",
  );
  process.exitCode = 1;
});
