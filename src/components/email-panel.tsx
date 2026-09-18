import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, Loader2, Mail, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { SectionHeading } from "@/components/page-header";
import {
  getEmailStatusFn,
  saveEmailPreferencesFn,
  sendTestDigestFn,
  testEmailProviderFn,
} from "@/lib/services/email.functions";
import { getSystemHealthFn, runHealthCheckFn } from "@/lib/services/diagnostics.functions";

function Pill({ ok, label }: { ok: boolean | null; label: string }) {
  const className =
    ok === true
      ? "border-primary/40 bg-primary/10 text-primary"
      : ok === false
        ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
        : "border-border bg-muted text-muted-foreground";
  const Icon = ok === true ? CheckCircle2 : ok === false ? TriangleAlert : CircleDashed;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${className}`}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** Email digest preferences plus the honest delivery state. */
export function EmailDigestPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(getEmailStatusFn);
  const save = useServerFn(saveEmailPreferencesFn);
  const test = useServerFn(testEmailProviderFn);
  const sendNow = useServerFn(sendTestDigestFn);

  const { data, isLoading } = useQuery({ queryKey: ["email-status"], queryFn: () => load() });
  const [form, setForm] = useState({
    digestEnabled: false,
    emailAddress: "",
    onlyWhenNew: true,
    includeApplyAsap: true,
    includeStrong: true,
    includeReview: false,
    minimumOpportunity: 60,
    priorityAlerts: true,
    priorityAlertThreshold: 85,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      digestEnabled: data.preferences.digestEnabled,
      emailAddress: data.preferences.emailAddress ?? "",
      onlyWhenNew: data.preferences.onlyWhenNew,
      includeApplyAsap: data.preferences.includeApplyAsap,
      includeStrong: data.preferences.includeStrong,
      includeReview: data.preferences.includeReview,
      minimumOpportunity: data.preferences.minimumOpportunity,
      priorityAlerts: data.preferences.priorityAlerts,
      priorityAlertThreshold: data.preferences.priorityAlertThreshold,
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { ...form, emailAddress: form.emailAddress || null } }),
    onSuccess: () => {
      toast.success("Email preferences saved");
      void queryClient.invalidateQueries({ queryKey: ["email-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: () => test({ data: undefined }),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendNow({ data: undefined }),
    onSuccess: (r) => {
      if (r.sent) toast.success(r.reason);
      else toast.error(r.reason);
      void queryClient.invalidateQueries({ queryKey: ["email-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="surface p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          title="Daily email brief"
          hint="One morning email after the 06:00 scan, plus alerts for exceptional roles."
        />
        <Pill
          ok={data ? (data.providerConnected ? true : false) : null}
          label={
            isLoading
              ? "Checking"
              : data?.providerConnected
                ? `${data.providerName} connected`
                : "Email not connected"
          }
        />
      </div>

      {data && !data.providerConnected && (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Email sending needs a Resend API key stored securely as{" "}
          <span className="font-mono text-xs">{data.requiredSecrets.join(", ")}</span>. Until then your
          preferences are saved, in-app alerts keep working, and no email is claimed as sent.
        </p>
      )}
      {data?.providerConnected && (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {data.senderNote}
        </p>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Send the daily brief</p>
            <p className="text-xs text-muted-foreground">Sent only after a scan has actually finished.</p>
          </div>
          <Switch
            checked={form.digestEnabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, digestEnabled: v }))}
            aria-label="Toggle daily brief"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="digest-email">Send to</Label>
          <Input
            id="digest-email"
            type="email"
            placeholder="you@example.com"
            value={form.emailAddress}
            onChange={(e) => setForm((f) => ({ ...f, emailAddress: e.target.value }))}
          />
        </div>

        <Separator />

        {(
          [
            ["includeApplyAsap", "Include Apply ASAP roles"],
            ["includeStrong", "Include strong matches"],
            ["includeReview", "Include roles worth reviewing"],
            ["onlyWhenNew", "Only email when something new was found"],
            ["priorityAlerts", "Alert me about exceptional roles immediately"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <p className="text-sm">{label}</p>
            <Switch
              checked={form[key]}
              onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              aria-label={label}
            />
          </div>
        ))}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label htmlFor="min-opp">Minimum opportunity score to include</Label>
            <span className="tabular-nums text-muted-foreground">{form.minimumOpportunity}</span>
          </div>
          <Slider
            id="min-opp"
            min={40}
            max={95}
            step={5}
            value={[form.minimumOpportunity]}
            onValueChange={([v]) => setForm((f) => ({ ...f, minimumOpportunity: v ?? 60 }))}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label htmlFor="alert-threshold">Priority alert threshold</Label>
            <span className="tabular-nums text-muted-foreground">{form.priorityAlertThreshold}</span>
          </div>
          <Slider
            id="alert-threshold"
            min={70}
            max={100}
            step={5}
            value={[form.priorityAlertThreshold]}
            onValueChange={([v]) => setForm((f) => ({ ...f, priorityAlertThreshold: v ?? 85 }))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save preferences
          </Button>
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            {testMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Mail className="mr-2 size-4" />}
            Test connection
          </Button>
          <Button
            variant="outline"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !data?.providerConnected}
          >
            {sendMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send me one now
          </Button>
        </div>
      </div>

      {data && data.recentDeliveries.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Recent delivery attempts</p>
          {data.recentDeliveries.map((d) => (
            <div key={d.id} className="rounded-lg border border-border px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{d.subject ?? d.kind}</span>
                <Pill ok={d.status === "sent" ? true : d.status === "failed" ? false : null} label={d.status} />
              </div>
              <p className="mt-1 text-muted-foreground">
                {d.recipient} · {new Date(d.createdAt).toLocaleString("en-GB")}
                {d.error ? ` · ${d.error}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Owner-facing self-check: what is genuinely healthy and what needs attention. */
export function SystemHealthPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(getSystemHealthFn);
  const run = useServerFn(runHealthCheckFn);
  const { data, isLoading } = useQuery({ queryKey: ["system-health"], queryFn: () => load() });

  const runMutation = useMutation({
    mutationFn: () => run({ data: undefined }),
    onSuccess: (r) => {
      toast.success(r.ok ? "All checks passed" : `${r.problems.length} thing(s) need attention`);
      void queryClient.invalidateQueries({ queryKey: ["system-health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const report = data?.report;

  return (
    <section className="surface p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          title="System health"
          hint="A daily self-check of jobs, links, employers, sponsor data and deliveries."
        />
        <Pill ok={report ? report.ok : null} label={isLoading ? "Checking" : report?.ok ? "Healthy" : "Needs attention"} />
      </div>

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Live vacancies", report.liveJobs],
              ["Demo vacancies", report.demoJobs],
              ["Employers healthy", report.healthySources],
              ["Employers failing", report.failingSources],
              ["Links failing checks", report.brokenLinks],
              ["Sponsor register entries", report.sponsorEntries.toLocaleString("en-GB")],
              ["Postings over 45 days", report.stalePostings],
              ["Analyses to retry", report.analysisFailures],
              ["Email failures", report.emailFailures],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Last scan:{" "}
            {report.lastScanAt
              ? `${new Date(report.lastScanAt).toLocaleString("en-GB")} (${report.lastScanStatus ?? "unknown"})`
              : "no real scan yet"}
          </p>

          {report.problems.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {report.problems.map((p) => (
                <li key={p} className="flex gap-2 text-amber-500">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {data && data.maintenance.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Background maintenance</p>
          {data.maintenance.map((m) => (
            <div key={m.id} className="rounded-lg border border-border px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {m.id === "sponsor_register_refresh" ? "Sponsor data refresh (weekly)" : "Daily self-check"}
                </span>
                <Pill
                  ok={m.paused ? false : m.lastStatus === "ok" ? true : null}
                  label={m.paused ? "Paused" : (m.lastStatus ?? "not run yet")}
                />
              </div>
              <p className="mt-1 text-muted-foreground">
                {m.lastRunAt ? `Last run ${new Date(m.lastRunAt).toLocaleString("en-GB")}. ` : "Has not run yet. "}
                {m.lastDetail ?? ""}
                {m.paused && m.pauseReason ? ` ${m.pauseReason}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <Button className="mt-4" variant="outline" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
        {runMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        Run check now
      </Button>
    </section>
  );
}
