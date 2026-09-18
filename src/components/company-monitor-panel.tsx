import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Radar, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/page-header";
import {
  monitorSummaryFn,
  syncTargetUniverseFn,
  validateCompanyBatchFn,
} from "@/lib/services/company-monitor.functions";
import { runScanServerFn } from "@/lib/services/scan.functions";
import { providerName } from "@/lib/services/sources/providers";

const statusLabels: Record<string, string> = {
  healthy: "Monitored",
  healthy_no_vacancies: "Monitored — no current vacancies",
  warning: "Needs review",
  failed: "Failing",
  needs_configuration: "Needs configuration",
  validating: "Validating",
  disabled: "Off",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function CompanyMonitorPanel() {
  const queryClient = useQueryClient();
  const summaryFn = useServerFn(monitorSummaryFn);
  const syncFn = useServerFn(syncTargetUniverseFn);
  const validateFn = useServerFn(validateCompanyBatchFn);
  const scanFn = useServerFn(runScanServerFn);
  const [progress, setProgress] = useState<string | null>(null);

  const summary = useQuery({ queryKey: ["company-monitor"], queryFn: () => summaryFn() });

  const validateAll = useMutation({
    mutationFn: async () => {
      await syncFn({ data: undefined as never });
      let done = false;
      let cursor = 0;
      let reset = true;
      let healthy = 0;
      while (!done) {
        const step = await validateFn({ data: { batchSize: 25, reset } });
        reset = false;
        cursor = step.cursor;
        healthy += step.healthy;
        done = step.done;
        setProgress(`Checked ${cursor} of ${step.total} companies · ${healthy} career sources working`);
      }
      return { cursor, healthy };
    },
    onSuccess: (r) => {
      toast.success(`Career-source check finished — ${r.healthy} sources working`);
      void queryClient.invalidateQueries({ queryKey: ["company-monitor"] });
      void queryClient.invalidateQueries({ queryKey: ["job-sources"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const fullScan = useMutation({
    mutationFn: () => scanFn({ data: undefined as never }),
    onSuccess: (r) => {
      toast.success(`Scan finished — ${r.discoveredNew} new roles from ${r.sourcesConnected} employers`);
      void queryClient.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const data = summary.data;

  return (
    <section className="surface space-y-5 p-5">
      <SectionHeading
        title="Direct company monitor"
        hint="Official career sources for a fixed list of 400 employers — 200 established companies and 200 startups and scale-ups. A company only counts as monitored once its real vacancies have been read from its own careers source."
      />

      {summary.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading monitor status…</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Monitor status is unavailable right now.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Target companies" value={data.registryTotal} />
            <Stat label="Monitored" value={data.monitoredCompanies} />
            <Stat label="Open vacancies seen" value={data.jobsOpenTotal} />
            <Stat label="UK vacancies seen" value={data.ukJobsOpenTotal} />
            <Stat
              label="Established working"
              value={`${data.byGroup["established"]?.healthy ?? 0} / ${data.registryEstablished}`}
            />
            <Stat
              label="Startups working"
              value={`${data.byGroup["startup"]?.healthy ?? 0} / ${data.registryStartup}`}
            />
            <Stat
              label="Needs configuration"
              value={
                (data.byGroup["established"]?.needsConfig ?? 0) + (data.byGroup["startup"]?.needsConfig ?? 0)
              }
            />
            <Stat
              label="Last automatic scan"
              value={
                data.lastScheduledScanAt
                  ? new Date(data.lastScheduledScanAt).toLocaleString("en-GB")
                  : "not yet"
              }
            />
          </dl>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Career-source check
            </p>
            <p className="text-sm text-muted-foreground">
              {data.validationStatus === "completed"
                ? `All ${data.registryTotal} companies checked${
                    data.validationCompletedAt
                      ? ` on ${new Date(data.validationCompletedAt).toLocaleString("en-GB")}`
                      : ""
                  }.`
                : data.validationStatus === "running"
                  ? `In progress — ${data.validationCursor} of ${data.registryTotal} checked.`
                  : "Not run yet."}
            </p>
            {progress ? <p className="text-sm text-primary">{progress}</p> : null}
          </div>

          {Object.keys(data.byProvider).length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Where the sources live
              </p>
              <ul className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                {Object.entries(data.byProvider)
                  .sort((a, b) => b[1].companies - a[1].companies)
                  .map(([provider, stats]) => (
                    <li key={provider}>
                      · {providerName(provider)} — {stats.companies} companies, {stats.jobsOpen} vacancies (
                      {stats.ukJobsOpen} UK)
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => validateAll.mutate()}
              disabled={validateAll.isPending}
            >
              {validateAll.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              Find &amp; check all career sources
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fullScan.mutate()}
              disabled={fullScan.isPending}
            >
              {fullScan.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Radar className="size-4" aria-hidden />
              )}
              Run full company scan
            </Button>
          </div>

          {data.problems.length > 0 ? (
            <details className="rounded-xl border border-border bg-muted/40 p-4">
              <summary className="cursor-pointer text-sm font-medium">
                {data.problems.length} companies not currently monitored — see why
              </summary>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {data.problems.map((p) => (
                  <li key={p.company}>
                    <span className="text-foreground">{p.company}</span> —{" "}
                    {statusLabels[p.status] ?? p.status}
                    {p.reason ? `: ${p.reason}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <p className="text-xs text-muted-foreground">
            General job search stays a supplementary source only — it never counts towards these 400 companies
            and never replaces a vacancy found on an employer's own careers source.
          </p>
        </>
      )}
    </section>
  );
}
