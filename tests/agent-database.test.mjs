import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("agent migrations enforce ownership, duplicate prevention and service-only atomic leases", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  const job = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated,anon;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE public.jobs(id uuid PRIMARY KEY); CREATE TABLE public.cv_versions(id uuid PRIMARY KEY);
 INSERT INTO auth.users VALUES('${a}'),('${b}'); INSERT INTO public.jobs VALUES('${job}');`);
    for (const path of [
      "20260918000100_scheduler_leases.sql",
      "20260918000200_application_agent.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + path, import.meta.url), "utf8"),
      );
    await db.exec(
      `INSERT INTO application_tasks(user_id,job_id,title,company,apply_url,verdict,fit) VALUES('${a}','${job}','Engineer','Example','https://example.com/jobs/1','APPLY',85),('${b}','${job}','Engineer','Example','https://example.com/jobs/1','APPLY',80);`,
    );
    await assert.rejects(
      () =>
        db.exec(
          `INSERT INTO application_tasks(user_id,job_id,title,company,apply_url,verdict,fit) VALUES('${a}','${job}','Engineer','Example','https://example.com/jobs/1','APPLY',85)`,
        ),
      /unique/,
    );
    await db.exec(
      `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${a}',false);`,
    );
    assert.equal((await db.query("SELECT * FROM application_tasks")).rows.length, 1);
    assert.equal((await db.query("SELECT user_id FROM application_tasks")).rows[0].user_id, a);
    await assert.rejects(
      () => db.exec("UPDATE application_tasks SET status='submitted'"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("SELECT acquire_agent_lock('x',$1)", [a]),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("SELECT acquire_scheduler_lease('x',$1,60)", [a]),
      /permission denied/,
    );
    await db.exec("RESET ROLE; SET ROLE service_role;");
    assert.equal(
      (await db.query("SELECT acquire_agent_lock('x',$1) AS acquired", [a])).rows[0].acquired,
      true,
    );
    assert.equal(
      (await db.query("SELECT acquire_agent_lock('x',$1) AS acquired", [b])).rows[0].acquired,
      false,
    );
    await db.query("SELECT release_agent_lock('x',$1)", [b]);
    assert.equal(
      (await db.query("SELECT acquire_agent_lock('x',$1) AS acquired", [b])).rows[0].acquired,
      false,
    );
    await db.query("SELECT release_agent_lock('x',$1)", [a]);
    assert.equal(
      (await db.query("SELECT acquire_agent_lock('x',$1) AS acquired", [b])).rows[0].acquired,
      true,
    );
    assert.equal(
      (await db.query("SELECT acquire_scheduler_lease('daily',$1,60) AS acquired", [a])).rows[0]
        .acquired,
      true,
    );
    assert.equal(
      (await db.query("SELECT acquire_scheduler_lease('daily',$1,60) AS acquired", [b])).rows[0]
        .acquired,
      false,
    );
    assert.equal(
      (await db.query("SELECT release_scheduler_lease('daily',$1) AS released", [b])).rows[0]
        .released,
      false,
    );
  } finally {
    await db.close();
  }
});
