/**
 * Morning brief digest.
 *
 * Built only from stored, ranked data after a scan has finished, so an email can
 * never describe results that do not exist. One digest per scan per user:
 * `email_deliveries.dedupe_key` makes a second attempt a no-op.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailProviderConfig, sendEmail } from "./provider.server";

type Db = SupabaseClient<any, "public", any>;

const APP_URL =
  process.env["APP_BASE_URL"] ?? "https://project--250ad2d4-d489-439a-af82-43f04fe0ba9f.lovable.app";

export interface DigestPreferences {
  digestEnabled: boolean;
  emailAddress: string | null;
  onlyWhenNew: boolean;
  includeApplyAsap: boolean;
  includeStrong: boolean;
  includeReview: boolean;
  minimumOpportunity: number;
  priorityAlerts: boolean;
  priorityAlertThreshold: number;
}

export const defaultDigestPreferences: DigestPreferences = {
  digestEnabled: false,
  emailAddress: null,
  onlyWhenNew: true,
  includeApplyAsap: true,
  includeStrong: true,
  includeReview: false,
  minimumOpportunity: 60,
  priorityAlerts: true,
  priorityAlertThreshold: 85,
};

export function mapPreferences(row: Record<string, unknown> | null): DigestPreferences {
  if (!row) return defaultDigestPreferences;
  return {
    digestEnabled: row["digest_enabled"] === true,
    emailAddress: (row["email_address"] as string) ?? null,
    onlyWhenNew: row["only_when_new"] !== false,
    includeApplyAsap: row["include_apply_asap"] !== false,
    includeStrong: row["include_strong"] !== false,
    includeReview: row["include_review"] === true,
    minimumOpportunity: Number(row["minimum_opportunity"] ?? 60),
    priorityAlerts: row["priority_alerts"] !== false,
    priorityAlertThreshold: Number(row["priority_alert_threshold"] ?? 85),
  };
}

interface DigestJob {
  id: string;
  title: string;
  company: string;
  location: string;
  workStyle: string;
  posted: string;
  cvMatch: number;
  opportunity: number;
  sponsorship: string;
  tier: string;
}

export interface DigestOutcome {
  attempted: boolean;
  sent: boolean;
  skipped: boolean;
  reason: string;
  recipient: string | null;
  jobs: number;
}

const sponsorshipLabel: Record<string, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  possible: "Possible",
  unclear: "Unclear",
  unlikely: "Unlikely",
  no_sponsorship: "No sponsorship",
};

function relativePosted(postedAt: string | null): string {
  if (!postedAt) return "Posted date unknown";
  const days = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "Posted date unknown";
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  return `Posted ${days} days ago`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Everything the digest says, gathered from stored data only. */
export async function buildDigest(
  db: Db,
  userId: string,
  scanRunId: string | null,
  prefs: DigestPreferences,
): Promise<{
  subject: string;
  html: string;
  text: string;
  jobs: DigestJob[];
  newJobs: number;
  scanCompletedAt: string | null;
  sourcesChecked: number;
  vacanciesChecked: number;
  applyAsap: number;
  strong: number;
  sponsorshipConfirmed: number;
  sponsorshipPossible: number;
}> {
  const scanRes = scanRunId
    ? await db.from("scan_runs").select("*").eq("id", scanRunId).maybeSingle()
    : await db
        .from("scan_runs")
        .select("*")
        .eq("user_id", userId)
        .eq("is_demo", false)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
  const scan = (scanRes.data ?? {}) as Record<string, unknown>;

  const tiers = [
    ...(prefs.includeApplyAsap ? ["apply_asap"] : []),
    ...(prefs.includeStrong ? ["strong_match"] : []),
    ...(prefs.includeReview ? ["review"] : []),
  ];

  const { data: matchRows } = await db
    .from("job_matches")
    .select("job_id, cv_match_score, opportunity_score, recommendation_tier")
    .eq("user_id", userId)
    .in("recommendation_tier", tiers.length > 0 ? tiers : ["apply_asap"])
    .gte("opportunity_score", prefs.minimumOpportunity)
    .order("opportunity_score", { ascending: false })
    .limit(40);
  const matches = (matchRows ?? []) as Array<Record<string, unknown>>;
  const jobIds = matches.map((m) => m["job_id"] as string);

  const [jobsRes, companiesRes, sponsorRes, appliedRes] = await Promise.all([
    jobIds.length
      ? db
          .from("jobs")
          .select("id, title, city, region, remote_type, posted_at, company_id, is_demo, is_active, live_status")
          .in("id", jobIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    db.from("companies").select("id, name"),
    jobIds.length
      ? db.from("job_sponsorship_analysis").select("job_id, status").in("job_id", jobIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    db.from("applications").select("job_id").eq("user_id", userId),
  ]);

  const jobsById = new Map(
    ((jobsRes.data ?? []) as Array<Record<string, unknown>>).map((j) => [j["id"] as string, j]),
  );
  const companyName = new Map(
    ((companiesRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );
  const sponsorByJob = new Map(
    ((sponsorRes.data ?? []) as Array<Record<string, unknown>>).map((s) => [s["job_id"] as string, s["status"] as string]),
  );
  const appliedJobs = new Set(((appliedRes.data ?? []) as Array<{ job_id: string }>).map((a) => a.job_id));

  const jobs: DigestJob[] = [];
  for (const m of matches) {
    const job = jobsById.get(m["job_id"] as string);
    if (!job) continue;
    if (job["is_demo"] === true || job["is_active"] !== true) continue;
    if (job["live_status"] === "expired" || job["live_status"] === "broken") continue;
    if (appliedJobs.has(job["id"] as string)) continue;
    jobs.push({
      id: job["id"] as string,
      title: (job["title"] as string) ?? "Role",
      company: companyName.get(job["company_id"] as string) ?? "Employer",
      location: [(job["city"] as string) ?? null, (job["region"] as string) ?? null].filter(Boolean).join(", ") || "United Kingdom",
      workStyle: (job["remote_type"] as string) ?? "Unknown work style",
      posted: relativePosted((job["posted_at"] as string) ?? null),
      cvMatch: Number(m["cv_match_score"] ?? 0),
      opportunity: Number(m["opportunity_score"] ?? 0),
      sponsorship: sponsorshipLabel[sponsorByJob.get(job["id"] as string) ?? "unclear"] ?? "Unclear",
      tier: (m["recommendation_tier"] as string) ?? "review",
    });
  }

  const applyAsap = jobs.filter((j) => j.tier === "apply_asap").length;
  const strong = jobs.filter((j) => j.tier === "strong_match").length;
  const sponsorshipConfirmed = jobs.filter((j) => j.sponsorship === "Confirmed").length;
  const sponsorshipPossible = jobs.filter((j) => j.sponsorship === "Possible").length;
  const newJobs = Number(scan["jobs_new"] ?? 0);
  const completedAt = (scan["completed_at"] as string) ?? null;
  const timeLabel = completedAt
    ? new Date(completedAt).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })
    : "unknown";

  const top = jobs.slice(0, 8);
  const rows = top
    .map(
      (j) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e6e8ec">
        <div style="font-size:16px;font-weight:600;color:#0f1115">${escapeHtml(j.title)}</div>
        <div style="font-size:14px;color:#3d4450">${escapeHtml(j.company)}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px">${escapeHtml(j.location)} · ${escapeHtml(j.workStyle)} · ${escapeHtml(j.posted)}</div>
        <div style="font-size:13px;color:#3d4450;margin-top:6px">CV Match: <strong>${j.cvMatch}%</strong> · Opportunity: <strong>${j.opportunity}%</strong> · Sponsorship: <strong>${escapeHtml(j.sponsorship)}</strong></div>
        <a href="${APP_URL}/jobs/${j.id}" style="display:inline-block;margin-top:8px;font-size:13px;color:#0d7d7d;text-decoration:none;font-weight:600">View job →</a>
      </td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 22px;color:#0f1115">
    <div style="font-size:12px;letter-spacing:.14em;color:#6b7280;text-transform:uppercase">Job Radar — Morning brief</div>
    <h1 style="font-size:22px;margin:10px 0 4px">${top.length > 0 ? `${top.length} role${top.length === 1 ? "" : "s"} worth your time today` : "No new priority roles today"}</h1>
    <p style="font-size:14px;color:#3d4450;margin:0 0 18px">Scan completed ${escapeHtml(timeLabel)} · ${Number(scan["sources_checked"] ?? 0)} employers checked · ${Number(scan["jobs_discovered"] ?? 0).toLocaleString("en-GB")} vacancies read · ${newJobs} new relevant vacancies kept</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <tr>
        <td style="font-size:13px;color:#3d4450;padding:8px 0">Apply ASAP: <strong>${applyAsap}</strong> · Strong matches: <strong>${strong}</strong></td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#3d4450;padding:0 0 8px">Sponsorship: <strong>${sponsorshipConfirmed}</strong> confirmed · <strong>${sponsorshipPossible}</strong> possible</td>
      </tr>
    </table>
    <table role="presentation" style="width:100%;border-collapse:collapse">${rows || `<tr><td style="font-size:14px;color:#6b7280;padding:12px 0">Nothing cleared your thresholds this morning. That is a genuine result, not a failure — the radar will look again tomorrow.</td></tr>`}</table>
    <p style="margin:22px 0 0"><a href="${APP_URL}/today" style="display:inline-block;background:#0d7d7d;color:#ffffff;padding:11px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Open Job Radar</a></p>
    <p style="font-size:12px;color:#9aa1ac;margin-top:20px">Sponsorship statuses come from the official UK sponsor register plus the wording of each advert. A company licence never guarantees this vacancy will be sponsored.</p>
  </div></body></html>`;

  const text = [
    "JOB RADAR — MORNING BRIEF",
    `Scan completed: ${timeLabel}`,
    `Employers checked: ${Number(scan["sources_checked"] ?? 0)}`,
    `Vacancies checked: ${Number(scan["jobs_discovered"] ?? 0)}`,
    `New relevant jobs: ${newJobs}`,
    `Apply ASAP: ${applyAsap}`,
    `Strong matches: ${strong}`,
    "",
    ...top.map(
      (j) =>
        `${j.title} — ${j.company}\n${j.location} · ${j.workStyle}\nCV Match: ${j.cvMatch}% · Opportunity: ${j.opportunity}% · Sponsorship: ${j.sponsorship}\n${j.posted}\n${APP_URL}/jobs/${j.id}\n`,
    ),
    `Open Job Radar: ${APP_URL}/today`,
  ].join("\n");

  return {
    subject:
      top.length > 0
        ? `Job Radar — ${applyAsap > 0 ? `${applyAsap} to apply to today` : `${top.length} role${top.length === 1 ? "" : "s"} to review`}`
        : "Job Radar — no priority roles this morning",
    html,
    text,
    jobs,
    newJobs,
    scanCompletedAt: completedAt,
    sourcesChecked: Number(scan["sources_checked"] ?? 0),
    vacanciesChecked: Number(scan["jobs_discovered"] ?? 0),
    applyAsap,
    strong,
    sponsorshipConfirmed,
    sponsorshipPossible,
  };
}

/**
 * Sends the digest for one user, once per scan. Every outcome — including a
 * provider refusal — is stored in `email_deliveries`.
 */
export async function sendDigest(
  db: Db,
  userId: string,
  scanRunId: string | null,
  options: { force?: boolean; kind?: string } = {},
): Promise<DigestOutcome> {
  const provider = emailProviderConfig();
  const { data: prefRow } = await db.from("email_preferences").select("*").eq("user_id", userId).maybeSingle();
  const prefs = mapPreferences((prefRow ?? null) as Record<string, unknown> | null);
  const kind = options.kind ?? "daily_digest";

  if (!provider.connected) {
    return { attempted: false, sent: false, skipped: true, reason: "Email provider is not connected.", recipient: null, jobs: 0 };
  }
  if (!options.force && !prefs.digestEnabled) {
    return { attempted: false, sent: false, skipped: true, reason: "Daily email digest is switched off.", recipient: null, jobs: 0 };
  }
  const recipient = prefs.emailAddress?.trim() || null;
  if (!recipient) {
    return { attempted: false, sent: false, skipped: true, reason: "No digest email address saved.", recipient: null, jobs: 0 };
  }

  const digest = await buildDigest(db, userId, scanRunId, prefs);
  if (!options.force && prefs.onlyWhenNew && digest.newJobs === 0 && digest.jobs.length === 0) {
    return { attempted: false, sent: false, skipped: true, reason: "Nothing new to report this morning.", recipient, jobs: 0 };
  }

  const dedupeKey = `${kind}:${userId}:${scanRunId ?? new Date().toISOString().slice(0, 10)}`;
  const { data: queued, error: queueError } = await db
    .from("email_deliveries")
    .insert({
      user_id: userId,
      kind,
      recipient,
      subject: digest.subject,
      status: "queued",
      provider: provider.name,
      scan_run_id: scanRunId,
      dedupe_key: dedupeKey,
    } as never)
    .select("id")
    .single();

  if (queueError || !queued) {
    // A unique-key collision means this digest was already handled.
    return {
      attempted: false,
      sent: false,
      skipped: true,
      reason: "This digest was already sent for this scan.",
      recipient,
      jobs: digest.jobs.length,
    };
  }

  const result = await sendEmail({ to: recipient, subject: digest.subject, html: digest.html, text: digest.text });
  await db
    .from("email_deliveries")
    .update({
      status: result.sent ? "sent" : "failed",
      provider_message_id: result.providerMessageId,
      error_text: result.error,
      sent_at: result.sent ? new Date().toISOString() : null,
    } as never)
    .eq("id", (queued as { id: string }).id);

  return {
    attempted: true,
    sent: result.sent,
    skipped: false,
    reason: result.sent ? `Delivered to ${recipient} (provider id ${result.providerMessageId}).` : (result.error ?? "Send failed."),
    recipient,
    jobs: digest.jobs.length,
  };
}

/**
 * Priority alert for an exceptionally strong, genuinely new, verified vacancy.
 * In-app first; email only when email is actually connected and switched on.
 */
export async function sendPriorityAlerts(db: Db, userId: string): Promise<{ inApp: number; emailed: number }> {
  const { data: prefRow } = await db.from("email_preferences").select("*").eq("user_id", userId).maybeSingle();
  const prefs = mapPreferences((prefRow ?? null) as Record<string, unknown> | null);
  const provider = emailProviderConfig();

  const { data: rows } = await db
    .from("job_matches")
    .select("job_id, opportunity_score, cv_match_score")
    .eq("user_id", userId)
    .eq("recommendation_tier", "apply_asap")
    .gte("opportunity_score", prefs.priorityAlertThreshold)
    .order("opportunity_score", { ascending: false })
    .limit(10);
  const candidates = (rows ?? []) as Array<Record<string, unknown>>;
  if (candidates.length === 0) return { inApp: 0, emailed: 0 };

  const jobIds = candidates.map((r) => r["job_id"] as string);
  const [jobsRes, sponsorRes, notifiedRes, companiesRes] = await Promise.all([
    db.from("jobs").select("id, title, company_id, live_status, is_demo, is_active, eligibility_status").in("id", jobIds),
    db.from("job_sponsorship_analysis").select("job_id, status").in("job_id", jobIds),
    db.from("notifications").select("job_id").eq("user_id", userId).eq("type", "priority_alert"),
    db.from("companies").select("id, name"),
  ]);
  const sponsor = new Map(
    ((sponsorRes.data ?? []) as Array<Record<string, unknown>>).map((s) => [s["job_id"] as string, s["status"] as string]),
  );
  const already = new Set(((notifiedRes.data ?? []) as Array<{ job_id: string | null }>).map((n) => n.job_id));
  const companyName = new Map(
    ((companiesRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );

  let inApp = 0;
  let emailed = 0;
  for (const job of (jobsRes.data ?? []) as Array<Record<string, unknown>>) {
    const id = job["id"] as string;
    if (already.has(id)) continue;
    if (job["is_demo"] === true || job["is_active"] !== true) continue;
    if (job["live_status"] !== "live") continue;
    if (job["eligibility_status"] === "ineligible") continue;
    if (sponsor.get(id) === "no_sponsorship") continue;
    const match = candidates.find((c) => c["job_id"] === id);
    const score = Number(match?.["opportunity_score"] ?? 0);
    const company = companyName.get(job["company_id"] as string) ?? "an employer";

    await db.from("notifications").insert({
      user_id: userId,
      type: "priority_alert",
      title: `Priority role — ${job["title"] as string}`,
      message: `${company} · Opportunity ${score}/100, application link verified.`,
      job_id: id,
    } as never);
    inApp += 1;

    if (provider.connected && prefs.priorityAlerts && prefs.digestEnabled && prefs.emailAddress) {
      const dedupeKey = `priority_alert:${userId}:${id}`;
      const { data: queued } = await db
        .from("email_deliveries")
        .insert({
          user_id: userId,
          kind: "priority_alert",
          recipient: prefs.emailAddress,
          subject: `Job Radar priority role — ${job["title"] as string}`,
          status: "queued",
          provider: provider.name,
          dedupe_key: dedupeKey,
        } as never)
        .select("id")
        .maybeSingle();
      if (queued) {
        const result = await sendEmail({
          to: prefs.emailAddress,
          subject: `Job Radar priority role — ${job["title"] as string}`,
          html: `<p style="font-family:Arial,sans-serif">A newly discovered vacancy scored <strong>${score}/100</strong>.</p>
                 <p style="font-family:Arial,sans-serif"><strong>${escapeHtml(job["title"] as string)}</strong><br/>${escapeHtml(company)}</p>
                 <p><a href="${APP_URL}/jobs/${id}">Open it in Job Radar</a></p>`,
        });
        await db
          .from("email_deliveries")
          .update({
            status: result.sent ? "sent" : "failed",
            provider_message_id: result.providerMessageId,
            error_text: result.error,
            sent_at: result.sent ? new Date().toISOString() : null,
          } as never)
          .eq("id", (queued as { id: string }).id);
        if (result.sent) emailed += 1;
      }
    }
  }
  return { inApp, emailed };
}
