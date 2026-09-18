/**
 * Transactional email provider (Resend).
 *
 * Nothing here ever reports a delivery that the provider did not accept: a send
 * is only recorded as `sent` when Resend returns a message id.
 *
 * Secrets: RESEND_API_KEY (required), RESEND_FROM (optional, e.g.
 * "Job Radar AI <radar@yourdomain.com>").
 */

export interface EmailProviderConfig {
  connected: boolean;
  name: string;
  from: string;
  requiredSecrets: string[];
  usingTestSender: boolean;
}

const DEFAULT_FROM = "Job Radar AI <onboarding@resend.dev>";

export function emailProviderConfig(): EmailProviderConfig {
  const key = process.env["RESEND_API_KEY"] ?? null;
  const from = process.env["RESEND_FROM"] ?? DEFAULT_FROM;
  return {
    connected: Boolean(key),
    name: "Resend",
    from,
    requiredSecrets: ["RESEND_API_KEY"],
    usingTestSender: from === DEFAULT_FROM,
  };
}

export interface SendResult {
  sent: boolean;
  providerMessageId: string | null;
  error: string | null;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  const key = process.env["RESEND_API_KEY"];
  const cfg = emailProviderConfig();
  if (!key) {
    return { sent: false, providerMessageId: null, error: "Resend is not connected (RESEND_API_KEY missing)." };
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: cfg.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { sent: false, providerMessageId: null, error: `Email provider unreachable: ${(err as Error).message}` };
  }

  const body = await res.text();
  if (!res.ok) {
    return { sent: false, providerMessageId: null, error: `Resend returned ${res.status}: ${body.slice(0, 300)}` };
  }
  let id: string | null = null;
  try {
    id = (JSON.parse(body) as { id?: string }).id ?? null;
  } catch {
    id = null;
  }
  return { sent: Boolean(id), providerMessageId: id, error: id ? null : `Resend accepted but returned no message id: ${body.slice(0, 200)}` };
}

/** Live credential check — no send. */
export async function testEmailProvider(): Promise<{ ok: boolean; message: string }> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    return {
      ok: false,
      message: "Not connected. Add RESEND_API_KEY (from resend.com → API Keys) to switch email on.",
    };
  }
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    const cfgEarly = emailProviderConfig();
    // A send-only ("restricted") key cannot list domains but can send mail —
    // that is a valid, working setup, not a failure.
    if (body.includes("restricted_api_key")) {
      return {
        ok: true,
        message: `Connected with a send-only Resend key. Sending as ${cfgEarly.from}${cfgEarly.usingTestSender ? ", which only reaches your own Resend account address until you add a verified domain" : ""}.`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Resend rejected the API key (${res.status}).` };
    }
    if (!res.ok) return { ok: false, message: `Resend returned ${res.status}: ${body.slice(0, 200)}` };
    const domains = (JSON.parse(body) as { data?: Array<{ name?: string; status?: string }> }).data ?? [];
    const verified = domains.filter((d) => d.status === "verified").map((d) => d.name);
    const cfg = emailProviderConfig();
    return {
      ok: true,
      message: verified.length
        ? `Connected — verified sending domain(s): ${verified.join(", ")}. Sending as ${cfg.from}.`
        : `Connected. No verified sending domain yet, so email can only reach your own Resend account address (sending as ${cfg.from}).`,
    };
  } catch (err) {
    return { ok: false, message: `Could not reach Resend: ${(err as Error).message}` };
  }
}
