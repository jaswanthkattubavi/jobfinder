import test from "node:test";
import assert from "node:assert/strict";
import { acquireSchedulerLease } from "../src/lib/services/scheduler-lease.server.ts";

test("lease contention returns without starting work", async () => {
  const calls = [];
  const lease = await acquireSchedulerLease(
    {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: false, error: null };
      },
    },
    "daily-discovery",
  );
  assert.equal(lease, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "acquire_scheduler_lease");
});

test("database errors fail closed during acquisition", async () => {
  await assert.rejects(
    () =>
      acquireSchedulerLease(
        { rpc: async () => ({ data: null, error: { message: "offline" } }) },
        "daily-discovery",
      ),
    /database unavailable/,
  );
  await assert.rejects(
    () =>
      acquireSchedulerLease(
        {
          rpc: async () => {
            throw new Error("connection failed");
          },
        },
        "daily-discovery",
      ),
    /connection failed/,
  );
});

test("renewal and release retain the unique acquired owner token", async () => {
  const calls = [];
  const lease = await acquireSchedulerLease(
    {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: true, error: null };
      },
    },
    "daily-discovery",
  );
  try {
    assert.ok(lease);
    await lease.assertOwned();
  } finally {
    await lease?.release();
  }
  assert.deepEqual(
    calls.map((c) => c.name),
    ["acquire_scheduler_lease", "renew_scheduler_lease", "release_scheduler_lease"],
  );
  const { p_owner: owner, p_key: key, p_seconds: seconds } = calls[0].args;
  assert.match(owner, /^[0-9a-f-]{36}$/i);
  assert.equal(key, "daily-discovery");
  assert.ok(seconds >= 60 && seconds <= 86400);
  assert.equal(calls[1].args.p_owner, owner);
  assert.deepEqual(calls[2].args, { p_key: key, p_owner: owner });
});

for (const failure of ["lost", "db", "transport"]) {
  test(`renewal ${failure} failure permanently stops further work`, async () => {
    let renewalCalls = 0;
    const lease = await acquireSchedulerLease(
      {
        rpc: async (name) => {
          if (name === "renew_scheduler_lease") {
            renewalCalls++;
            if (failure === "transport") throw new Error("offline");
            return {
              data: failure === "lost" ? false : null,
              error: failure === "db" ? { message: "offline" } : null,
            };
          }
          return { data: true, error: null };
        },
      },
      "daily-discovery",
    );
    try {
      await assert.rejects(() => lease.assertOwned(), /stopping further work/);
      await assert.rejects(() => lease.assertOwned(), /stopping further work/);
      assert.equal(renewalCalls, 1);
    } finally {
      await lease?.release();
    }
  });
}

test("release errors are surfaced after clearing the heartbeat", async () => {
  const lease = await acquireSchedulerLease(
    { rpc: async (name) => ({ data: name !== "release_scheduler_lease", error: null }) },
    "daily-discovery",
  );
  await assert.rejects(() => lease.release(), /release failed/);
});
