import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DigestPreferences } from "./email/digest.server";

/**
 * Email digest configuration, connection tests and delivery history.
 * Nothing here claims a delivery the provider did not accept.
 */

export interface EmailStatus {
  providerConnected: boolean;
  providerName: string;
  requiredSecrets: string[];
  usingTestSender: boolean;
  senderNote: string;
  preferences: DigestPreferences;
  recentDeliveries: Array<{
    id: string;
    kind: string;
    recipient: string;
    status: string;
    subject: string | null;
    providerMessageId: string | null;
    error: string | null;
    createdAt: string;
    sentAt: string | null;
  }>;
}

export const getEmailStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailStatus> => {
    const { emailProviderConfig } = await import("./email/provider.server");
    const { mapPreferences } = await import("./email/digest.server");
    const cfg = emailProviderConfig();

    const [prefRes, deliveriesRes] = await Promise.all([
      context.supabase.from("email_preferences").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase
        .from("email_deliveries")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return {
      providerConnected: cfg.connected,
      providerName: cfg.name,
      requiredSecrets: cfg.requiredSecrets,
      usingTestSender: cfg.usingTestSender,
      senderNote: cfg.usingTestSender
        ? "Sending from Resend's shared test address, which only delivers to your own Resend account email. Add RESEND_FROM with a verified domain to send anywhere."
        : `Sending as ${cfg.from}.`,
      preferences: mapPreferences((prefRes.data ?? null) as Record<string, unknown> | null),
      recentDeliveries: ((deliveriesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r["id"] as string,
        kind: r["kind"] as string,
        recipient: r["recipient"] as string,
        status: r["status"] as string,
        subject: (r["subject"] as string) ?? null,
        providerMessageId: (r["provider_message_id"] as string) ?? null,
        error: (r["error_text"] as string) ?? null,
        createdAt: r["created_at"] as string,
        sentAt: (r["sent_at"] as string) ?? null,
      })),
    };
  });

export const saveEmailPreferencesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<DigestPreferences>) => input)
  .handler(async ({ data, context }) => {
    const address = data.emailAddress?.trim() ?? null;
    if (data.digestEnabled && (!address || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))) {
      throw new Error("A valid email address is needed before digests can be switched on.");
    }
    const { error } = await context.supabase.from("email_preferences").upsert(
      {
        user_id: context.userId,
        digest_enabled: data.digestEnabled === true,
        email_address: address,
        only_when_new: data.onlyWhenNew !== false,
        include_apply_asap: data.includeApplyAsap !== false,
        include_strong: data.includeStrong !== false,
        include_review: data.includeReview === true,
        minimum_opportunity: Math.min(100, Math.max(0, Number(data.minimumOpportunity ?? 60))),
        priority_alerts: data.priorityAlerts !== false,
        priority_alert_threshold: Math.min(100, Math.max(50, Number(data.priorityAlertThreshold ?? 85))),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { saved: true };
  });

export const testEmailProviderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { testEmailProvider } = await import("./email/provider.server");
    return testEmailProvider();
  });

/** Builds and sends this user's digest right now, for verification. */
export const sendTestDigestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendDigest } = await import("./email/digest.server");
    return sendDigest(supabaseAdmin as never, context.userId, null, { force: true, kind: "manual_digest" });
  });

export const testGeneralSearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { testGeneralSearch } = await import("./sources/search-provider");
    return testGeneralSearch();
  });
