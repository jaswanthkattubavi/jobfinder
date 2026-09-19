/** A long, renewable lease avoids overlapping expensive scheduled runs. */
interface LeaseClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

const LEASE_SECONDS = 6 * 60 * 60;
const HEARTBEAT_MS = 60_000;

export async function acquireSchedulerLease(db: LeaseClient, key: string) {
  const owner = crypto.randomUUID();
  const args = { p_key: key, p_owner: owner };
  const acquired = await db.rpc("acquire_scheduler_lease", { ...args, p_seconds: LEASE_SECONDS });
  if (acquired.error) throw new Error("Scheduler lease database unavailable");
  if (acquired.data !== true) return null;

  let failure: Error | null = null;
  let pending: Promise<void> | null = null;
  const renew = async () => {
    try {
      const result = await db.rpc("renew_scheduler_lease", { ...args, p_seconds: LEASE_SECONDS });
      if (result.error || result.data !== true)
        failure = new Error("Scheduler lease lost; stopping further work");
    } catch {
      failure = new Error("Scheduler lease heartbeat unavailable; stopping further work");
    }
  };
  const timer = setInterval(() => {
    if (!pending && !failure)
      pending = renew().finally(() => {
        pending = null;
      });
  }, HEARTBEAT_MS);
  return {
    async assertOwned() {
      if (pending) await pending;
      if (failure) throw failure;
      // Check ownership at work boundaries as well as during long scans.
      await renew();
      if (failure) throw failure;
    },
    async release() {
      clearInterval(timer);
      if (pending) await pending;
      const result = await db.rpc("release_scheduler_lease", args);
      if (result.error || result.data !== true) throw new Error("Scheduler lease release failed");
    },
  };
}
