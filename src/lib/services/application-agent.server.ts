import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { classifyClearance, classifySponsorship } from "./screening";
import {
  classifyForQueue,
  defaultAgentSettings,
  isSecretQuestion,
  isSensitiveQuestion,
  prepareCvText,
  questionKey,
  reusableAnswer,
  safeApplicationUrl,
  type AgentQuestion,
  type AgentSettings,
  type AgentTask,
  type MemoryAnswer,
} from "./application-agent";

type Db = SupabaseClient<any, "public", any>;
type Row = Record<string, any>;
function check<T extends { error: any }>(r: T): T {
  if (r.error) throw new Error(r.error.message ?? "Database operation failed");
  return r;
}
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
export async function agentEvent(
  db: Db,
  userId: string,
  taskId: string | null,
  kind: string,
  detail: string,
) {
  check(await db.from("agent_events").insert({ user_id: userId, task_id: taskId, kind, detail }));
}
async function locked<T>(db: Db, key: string, run: () => Promise<T>): Promise<T> {
  const owner = randomUUID();
  const r = check(await db.rpc("acquire_agent_lock", { p_key: key, p_owner: owner }));
  if (r.data !== true) throw new Error("Preparation is already running. Refresh shortly.");
  try {
    return await run();
  } finally {
    const r = await db.rpc("release_agent_lock", { p_key: key, p_owner: owner });
    if (r.error) console.error("Agent lease release failed");
  }
}
export async function getAgentSettings(db: Db, userId: string): Promise<AgentSettings> {
  const r = check(await db.from("agent_settings").select("*").eq("user_id", userId).maybeSingle());
  const row = r.data;
  return row
    ? {
        enabled: row.enabled,
        daily_limit: row.daily_limit,
        min_fit: row.min_fit,
        include_stretch: row.include_stretch,
      }
    : { ...defaultAgentSettings };
}
export async function getAgentState(db: Db, userId: string) {
  const [settings, tasks, answers, events, cv] = await Promise.all([
    getAgentSettings(db, userId),
    db
      .from("application_tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("answer_memory")
      .select("*")
      .eq("user_id", userId)
      .order("confirmed_at", { ascending: false }),
    db
      .from("agent_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("cv_versions")
      .select("id,parsed_text")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .limit(1),
  ]);
  return {
    settings,
    tasks: check(tasks).data as AgentTask[],
    answers: check(answers).data as MemoryAnswer[],
    events: check(events).data as Array<{
      id: string;
      task_id: string | null;
      kind: string;
      detail: string;
      created_at: string;
    }>,
    cvReady: Boolean(check(cv).data?.[0]?.parsed_text?.trim()),
  };
}
async function ownTask(db: Db, userId: string, taskId: string): Promise<Row> {
  const r = check(
    await db
      .from("application_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle(),
  );
  if (!r.data) throw new Error("Application not found.");
  return r.data;
}
async function evidence(db: Db, userId: string, jobId: string, settings: AgentSettings) {
  const [j, m, a, c, p] = await Promise.all([
    db.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    db.from("job_matches").select("*").eq("user_id", userId).eq("job_id", jobId).maybeSingle(),
    db.from("job_analysis").select("analysis_status").eq("job_id", jobId).maybeSingle(),
    db
      .from("applications")
      .select("id,stage")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle(),
    db.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const job = check(j).data as Row | null,
    match = check(m).data as Row | null;
  check(a);
  check(c);
  check(p);
  if (!job || !match)
    throw new Error("Current vacancy and profile match are required. Run a scan first.");
  const clearance = classifyClearance(String(job["description"] ?? ""));
  const result = classifyForQueue({
    fit: Number(match["cv_match_score"]),
    minFit: settings.min_fit,
    clearance: clearance.evidence.length ? clearance.status : "none",
    eligibility: String(job["eligibility_status"] ?? "review"),
    active: job["is_active"] === true && job["is_demo"] !== true,
    liveStatus: String(job["live_status"]),
    analysed: a.data?.analysis_status === "completed",
    missing:
      strings(match["missing_skills_json"]).length + strings(match["partial_skills_json"]).length,
    seniority: Number(match["seniority_score"] ?? 0),
  });
  if (c.data && !["discovered", "saved"].includes(c.data.stage)) {
    result.verdict = "SKIP";
    result.reasons.push("Already recorded in your application tracker.");
  }
  const sponsorship = classifySponsorship(String(job["description"] ?? ""));
  if (
    sponsorship === "unavailable" &&
    (p.data?.sponsorship_required_now || p.data?.sponsorship_required_later)
  ) {
    result.verdict = "SKIP";
    result.reasons.push(
      "The advert refuses sponsorship, conflicting with your stated sponsorship requirement.",
    );
  } else if (sponsorship === "unknown")
    result.reasons.push("Sponsorship is unconfirmed. Verify with the employer.");
  const url = safeApplicationUrl(String(job["canonical_apply_url"] ?? job["apply_url"] ?? ""));
  if (!url) {
    result.verdict = "SKIP";
    result.reasons.push("No supported HTTPS application URL.");
  }
  if (strings(match["risks_json"]).length)
    result.reasons.push(...strings(match["risks_json"]).slice(0, 5));
  return { job, match, result, url };
}
async function prepare(db: Db, userId: string, taskId: string): Promise<void> {
  await locked(db, `application:${taskId}`, async () => {
    const task = await ownTask(db, userId, taskId);
    if (["submitted", "dismissed"].includes(task["status"]))
      throw new Error("This application is closed.");
    const e = await evidence(db, userId, task["job_id"], await getAgentSettings(db, userId));
    const cv = check(
      await db
        .from("cv_versions")
        .select("id,parsed_text")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .limit(1),
    );
    const source = cv.data?.[0];
    const blockers = e.result.verdict === "SKIP";
    const answers = check(await db.from("answer_memory").select("*").eq("user_id", userId))
      .data as MemoryAnswer[];
    const cvHash = source?.parsed_text
      ? createHash("sha256").update(source.parsed_text).digest("hex")
      : null;
    const changed =
      task["source_hash"] !== e.job["description_hash"] || task["cv_source_hash"] !== cvHash;
    const questions = (task["questions"] as AgentQuestion[]).map((q) => ({
      ...q,
      answer: (changed ? null : q.answer) ?? reusableAnswer(q.label, answers),
    }));
    const tailored = source?.parsed_text
      ? prepareCvText(source.parsed_text, String(e.job["description"] ?? ""))
      : null;
    const needsInput = questions.some((q) => q.required && !q.answer);
    const status = blockers ? "blocked" : !tailored || needsInput ? "needs_input" : "ready";
    check(
      await db
        .from("application_tasks")
        .update({
          status,
          verdict: e.result.verdict,
          reasons: e.result.reasons,
          fit: e.match["cv_match_score"],
          apply_url: e.url ?? task["apply_url"],
          source_hash: e.job["description_hash"] ?? null,
          cv_text: tailored?.text ?? null,
          cv_notes: tailored?.notes ?? ["Select and parse a primary CV in Profile settings."],
          cv_version_id: source?.id ?? null,
          cv_source_hash: cvHash,
          questions,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .eq("user_id", userId),
    );
    await agentEvent(
      db,
      userId,
      taskId,
      "prepared",
      blockers
        ? "Blocked by current eligibility evidence."
        : status === "ready"
          ? "Application packet prepared. Site questions and submission still require the browser workflow."
          : "Waiting for CV or required answers.",
    );
  });
}
export const prepareApplication = prepare;
/** Called by daily scheduler, and explicitly by the workspace button. No external application is sent. */
export async function prepareDailyQueue(
  db: Db,
  userId: string,
  manual = false,
): Promise<{ created: number; prepared: number; note: string }> {
  return locked(db, `daily:${userId}`, async () => {
    const settings = await getAgentSettings(db, userId);
    if (!manual && !settings.enabled)
      return { created: 0, prepared: 0, note: "Daily preparation is off." };
    // Rolling 24h cap also protects against duplicate scheduler triggers and repeated clicks.
    const since = new Date(Date.now() - 86400000).toISOString();
    const count = check(
      await db
        .from("application_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since),
    );
    let remaining = Math.max(0, settings.daily_limit - (count.count ?? 0));
    const matches = check(
      await db
        .from("job_matches")
        .select("job_id")
        .eq("user_id", userId)
        .gte("cv_match_score", settings.min_fit)
        .order("opportunity_score", { ascending: false })
        .limit(100),
    );
    const existing = check(
      await db.from("application_tasks").select("job_id").eq("user_id", userId),
    );
    const known = new Set((existing.data ?? []).map((t: Row) => t["job_id"]));
    let created = 0,
      prepared = 0;
    for (const row of matches.data ?? []) {
      if (remaining === 0) break;
      if (known.has(row.job_id)) continue;
      const e = await evidence(db, userId, row.job_id, settings);
      if (
        e.result.verdict === "SKIP" ||
        (e.result.verdict === "STRETCH" && !settings.include_stretch)
      )
        continue;
      const company = check(
        await db.from("companies").select("name").eq("id", e.job["company_id"]).maybeSingle(),
      );
      const inserted = check(
        await db
          .from("application_tasks")
          .insert({
            user_id: userId,
            job_id: row.job_id,
            title: e.job["title"],
            company: company.data?.name ?? "Unknown employer",
            apply_url: e.url,
            verdict: e.result.verdict,
            fit: e.match["cv_match_score"],
            reasons: e.result.reasons,
            source_hash: e.job["description_hash"] ?? null,
          })
          .select("id")
          .single(),
      );
      if (!inserted.data) throw new Error("Queue insert returned no application.");
      created++;
      remaining--;
      await agentEvent(db, userId, inserted.data.id, "queued", "Added from your scored vacancies.");
      try {
        await prepare(db, userId, inserted.data.id);
        prepared++;
      } catch (error) {
        check(
          await db
            .from("application_tasks")
            .update({ last_error: error instanceof Error ? error.message : "Preparation failed" })
            .eq("id", inserted.data.id)
            .eq("user_id", userId),
        );
      }
    }
    return {
      created,
      prepared,
      note: created
        ? `${created} application(s) queued; ${prepared} prepared. No applications submitted.`
        : remaining === 0
          ? "Daily preparation limit reached."
          : "No new eligible matches. Run discovery or review your fit settings.",
    };
  });
}
export async function saveQuestionAnswer(
  db: Db,
  userId: string,
  input: { taskId: string; question: string; answer: string; remember: boolean },
) {
  return locked(db, `application:${input.taskId}`, async () => {
    const task = await ownTask(db, userId, input.taskId);
    if (["submitted", "dismissed", "blocked"].includes(task["status"]))
      throw new Error("This application is not editable.");
    if (isSecretQuestion(input.question))
      throw new Error(
        "Enter login codes and credentials only on the original website. They are never saved here.",
      );
    const questions = task["questions"] as AgentQuestion[];
    const q = questions.find((q) => questionKey(q.label) === questionKey(input.question));
    if (!q) throw new Error("Import this question from the application form first.");
    if (q.options.length && !q.options.includes(input.answer))
      throw new Error("Choose one of the exact form options.");
    q.answer = input.answer;
    const remember = input.remember && !isSensitiveQuestion(input.question);
    if (remember)
      check(
        await db
          .from("answer_memory")
          .upsert(
            {
              user_id: userId,
              question: q.label,
              question_key: questionKey(q.label),
              answer: input.answer,
              scope: "global",
              confirmed_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
            },
            { onConflict: "user_id,question_key" },
          ),
      );
    check(
      await db
        .from("application_tasks")
        .update({
          questions,
          status:
            task["cv_text"] && !questions.some((q) => q.required && !q.answer)
              ? "ready"
              : "needs_input",
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.taskId)
        .eq("user_id", userId),
    );
    await agentEvent(
      db,
      userId,
      input.taskId,
      "answer_confirmed",
      remember
        ? "Answer confirmed and remembered for 90 days."
        : "Answer confirmed for this application only.",
    );
    return { saved: true, remembered: remember };
  });
}
export async function importApplicationQuestions(
  db: Db,
  userId: string,
  taskId: string,
  incoming: Array<Omit<AgentQuestion, "answer">>,
) {
  return locked(db, `application:${taskId}`, async () => {
    const task = await ownTask(db, userId, taskId);
    if (["submitted", "dismissed", "blocked"].includes(task["status"]))
      throw new Error("This application is not editable.");
    const memory = check(await db.from("answer_memory").select("*").eq("user_id", userId))
      .data as MemoryAnswer[];
    const old = task["questions"] as AgentQuestion[];
    const labels = new Set<string>();
    const questions: AgentQuestion[] = [];
    for (const q of incoming) {
      if (isSecretQuestion(q.label)) continue;
      const key = questionKey(q.label);
      if (!key || labels.has(key)) continue;
      labels.add(key);
      const prior = old.find((p) => questionKey(p.label) === key);
      let answer = prior?.answer ?? reusableAnswer(q.label, memory);
      if (answer && q.options.length && !q.options.includes(answer)) answer = null;
      questions.push({ ...q, key, answer });
    }
    check(
      await db
        .from("application_tasks")
        .update({
          questions,
          status:
            task["cv_text"] && !questions.some((q) => q.required && !q.answer)
              ? "ready"
              : "needs_input",
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .eq("user_id", userId),
    );
    await agentEvent(
      db,
      userId,
      taskId,
      "questions_imported",
      `${questions.length} form questions imported; unknown answers require your input.`,
    );
    return { imported: questions.length };
  });
}
export async function downloadApplicationPacket(db: Db, userId: string, taskId: string) {
  // Recheck current evidence and CV before producing a packet. Closed tasks cannot export.
  await prepare(db, userId, taskId);
  const task = await ownTask(db, userId, taskId);
  if (task["status"] === "blocked" || !task["cv_text"])
    throw new Error("Resolve the preparation blockers before downloading.");
  const memory = check(await db.from("answer_memory").select("*").eq("user_id", userId))
    .data as MemoryAnswer[];
  const explicit = (task["questions"] as AgentQuestion[])
    .filter((q) => q.answer && !isSecretQuestion(q.label))
    .map((q) => ({ question: q.label, answer: q.answer!, scope: "application", reuse: true }));
  const keys = new Set(explicit.map((q) => questionKey(q.question)));
  const reusable = memory
    .filter(
      (a) => !keys.has(questionKey(a.question)) && reusableAnswer(a.question, memory) !== null,
    )
    .map((a) => ({ question: a.question, answer: a.answer, scope: "global", reuse: true }));
  await agentEvent(
    db,
    userId,
    taskId,
    "packet_exported",
    "Packet exported for local browser assistance. This does not mean the application was submitted.",
  );
  return {
    version: 1 as const,
    taskId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    job: {
      title: task["title"] as string,
      company: task["company"] as string,
      applyUrl: task["apply_url"] as string,
    },
    cvText: task["cv_text"] as string,
    answers: [...explicit, ...reusable],
  };
}
export async function closeApplicationTask(
  db: Db,
  userId: string,
  taskId: string,
  status: "submitted" | "dismissed",
  confirmation?: string,
) {
  return locked(db, `application:${taskId}`, async () => {
    const task = await ownTask(db, userId, taskId);
    if (["submitted", "dismissed"].includes(task["status"])) return { saved: true };
    if (status === "submitted") {
      if (!confirmation?.trim())
        throw new Error("Record the site confirmation or reference after submitting.");
      // User-reported submission, not a claim that our agent submitted it.
      check(
        await db
          .from("applications")
          .upsert(
            {
              user_id: userId,
              job_id: task["job_id"],
              stage: "applied",
              applied_at: new Date().toISOString(),
              cv_version_id: task["cv_version_id"],
              notes: `User-reported submission: ${confirmation}`,
            },
            { onConflict: "user_id,job_id", ignoreDuplicates: true },
          ),
      );
    }
    check(
      await db
        .from("application_tasks")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("user_id", userId),
    );
    await agentEvent(
      db,
      userId,
      taskId,
      status,
      status === "submitted" ? "User recorded submission confirmation." : "Application dismissed.",
    );
    return { saved: true };
  });
}
