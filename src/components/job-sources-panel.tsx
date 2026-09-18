import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, Loader2, Plug, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionHeading } from "@/components/page-header";
import {
  analyseBacklogFn,
  deleteJobSourceFn,
  getAutomationStatusFn,
  getSponsorRegisterStatusFn,
  importCompanyLibraryFn,
  importSponsorRegisterFn,
  listJobSourcesFn,
  reanalyseSponsorshipFn,
  listLearnedPreferencesFn,
  resetLearnedPreferencesFn,
  saveJobSourceFn,
  testJobSourceFn,
  type AutomationStatus,
  type JobSourceConfig,
} from "@/lib/services/discovery.functions";
import { providerMeta, type ProviderId } from "@/lib/services/sources/providers";
import { LIBRARY_CHECKED_ON, companyLibrary } from "@/lib/services/sources/company-library";

const stateLabel: Record<AutomationStatus["state"], string> = {
  working_live: "Working live",
  partially_working: "Partially working",
  not_connected: "Not connected",
  requires_configuration: "Needs setup",
};

function StatusPill({ state }: { state: AutomationStatus["state"] }) {
  const styles: Record<AutomationStatus["state"], string> = {
    working_live: "border-primary/40 bg-primary/10 text-primary",
    partially_working: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    not_connected: "border-border bg-muted text-muted-foreground",
    requires_configuration: "border-border bg-muted text-muted-foreground",
  };
  const Icon =
    state === "working_live" ? CheckCircle2 : state === "partially_working" ? TriangleAlert : CircleDashed;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${styles[state]}`}>
      <Icon className="size-3.5" aria-hidden />
      {stateLabel[state]}
    </span>
  );
}

const configurable = providerMeta.filter((p) => p.configurable);

const healthCopy: Record<JobSourceConfig["health"], { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "border-primary/40 bg-primary/10 text-primary" },
  warning: { label: "Needs review", className: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  failed: { label: "Failing", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  disabled: { label: "Paused", className: "border-border bg-muted text-muted-foreground" },
  unknown: { label: "Not checked", className: "border-border bg-muted text-muted-foreground" },
};

function HealthPill({ health }: { health: JobSourceConfig["health"] }) {
  const copy = healthCopy[health];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] ${copy.className}`}>
      {copy.label}
    </span>
  );
}

export function JobSourcesPanel() {
  const queryClient = useQueryClient();
  const listSources = useServerFn(listJobSourcesFn);
  const saveSource = useServerFn(saveJobSourceFn);
  const removeSource = useServerFn(deleteJobSourceFn);
  const testSource = useServerFn(testJobSourceFn);
  const importLibrary = useServerFn(importCompanyLibraryFn);
  const [libraryProgress, setLibraryProgress] = useState<string | null>(null);


  const [companyName, setCompanyName] = useState("");
  const [provider, setProvider] = useState<ProviderId>("greenhouse");
  const [identifier, setIdentifier] = useState("");

  const meta = configurable.find((p) => p.id === provider)!;

  const sources = useQuery({ queryKey: ["job-sources"], queryFn: () => listSources() });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["job-sources"] });

  const save = useMutation({
    mutationFn: () => saveSource({ data: { companyName, provider, providerIdentifier: identifier } }),
    onSuccess: () => {
      toast.success(`${companyName} added`, { description: "It will be scanned on the next run." });
      setCompanyName("");
      setIdentifier("");
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["automation-status"] });
    },
    onError: (e: Error) => toast.error("Couldn't add that source", { description: e.message }),
  });

  const test = useMutation({
    mutationFn: () => testSource({ data: { provider, providerIdentifier: identifier } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message, { description: result.sampleTitles.join(" · ") });
      else toast.error("Couldn't reach that board", { description: result.message });
    },
    onError: (e: Error) => toast.error("Test failed", { description: e.message }),
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; companyName: string; provider: ProviderId; providerIdentifier: string; enabled: boolean }) =>
      saveSource({ data: vars }),
    onSuccess: invalidate,
  });

  const del = useMutation({
    mutationFn: (id: string) => removeSource({ data: { id } }),
    onSuccess: () => {
      toast.success("Source removed");
      invalidate();
    },
  });

  // Adds the checked employer library in batches, re-testing every board live.
  const addLibrary = useMutation({
    mutationFn: async () => {
      let offset = 0;
      let added = 0;
      let skipped = 0;
      let failed = 0;
      for (let i = 0; i < 60; i += 1) {
        const batch = await importLibrary({ data: { offset } });
        offset = batch.nextOffset;
        added += batch.added;
        skipped += batch.skipped;
        failed += batch.failed;
        setLibraryProgress(`Checked ${offset} of ${batch.total} employers — ${added} added, ${failed} not responding`);
        if (batch.done) break;
      }
      return { added, skipped, failed };
    },
    onSuccess: (result) => {
      setLibraryProgress(null);
      toast.success(`${result.added} employer boards added`, {
        description: `${result.skipped} already on your list, ${result.failed} did not respond and were left switched off.`,
      });
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["automation-status"] });
    },
    onError: (e: Error) => {
      setLibraryProgress(null);
      toast.error("Couldn't finish adding employers", { description: e.message });
    },
  });



  return (
    <section className="surface p-5">
      <SectionHeading
        title="Job sources"
        hint="Add an employer's job board to start finding their real vacancies"
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_180px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="source-company">Company</Label>
          <Input
            id="source-company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Monzo"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="source-provider">Board type</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
            <SelectTrigger id="source-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {configurable.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.experimental ? " (experimental)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="source-identifier">{meta.identifierLabel}</Label>
          <Input
            id="source-identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={meta.id === "workday" ? "acme.wd3.myworkdayjobs.com|acme|External" : "monzo"}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{meta.identifierHint}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!identifier.trim() || test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plug className="size-4" aria-hidden />}
          Test connection
        </Button>
        <Button
          size="sm"
          disabled={!companyName.trim() || !identifier.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Add source
        </Button>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium">Checked employer library</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {companyLibrary.length} UK-hiring employers whose career systems answered when they were checked on{" "}
          {new Date(LIBRARY_CHECKED_ON).toLocaleDateString("en-GB")}. Each one is tested again as it is added, and any
          board that doesn't answer is added switched off rather than pretended to work.
        </p>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={addLibrary.isPending}
          onClick={() => addLibrary.mutate()}
        >
          {addLibrary.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plug className="size-4" aria-hidden />}
          Add the whole library
        </Button>
        {libraryProgress ? <p className="mt-2 text-xs text-muted-foreground">{libraryProgress}</p> : null}
      </div>



      <div className="mt-5 divide-y divide-border border-t border-border">
        {sources.isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading your sources…</p>
        ) : (sources.data ?? []).length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No sources yet. Until one is added, your radar only holds demo roles.
          </p>
        ) : (
          (sources.data ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {s.companyName}
                  <HealthPill health={s.health} />
                  {s.experimental ? <span className="text-xs text-amber-500">experimental</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {providerMeta.find((p) => p.id === s.provider)?.name ?? s.provider} · {s.providerIdentifier}
                  {s.sector ? ` · ${s.sector}` : ""}
                  {s.priority !== "normal" ? ` · ${s.priority} priority` : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.lastSuccessAt
                    ? `Last worked ${new Date(s.lastSuccessAt).toLocaleDateString("en-GB")}`
                    : s.validationStatus === "validated"
                      ? "Checked and ready — not scanned yet"
                      : "Not scanned yet"}
                  {s.jobsOpen !== null ? ` · ${s.jobsOpen} vacancies open` : ""}
                  {s.ukJobsOpen !== null ? ` · ${s.ukJobsOpen} in the UK` : ""}
                  {s.relevantJobs !== null ? ` · ${s.relevantJobs} kept for you` : ""}
                </p>
                {s.lastError ? (
                  <p className="mt-0.5 truncate text-xs text-amber-500">Last error: {s.lastError}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={s.enabled}
                  aria-label={`Scan ${s.companyName}`}
                  onCheckedChange={(enabled) =>
                    toggle.mutate({
                      id: s.id,
                      companyName: s.companyName,
                      provider: s.provider,
                      providerIdentifier: s.providerIdentifier,
                      enabled,
                    })
                  }
                />
                <Button variant="ghost" size="icon" aria-label={`Remove ${s.companyName}`} onClick={() => del.mutate(s.id)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function AutomationStatusPanel() {
  const getStatus = useServerFn(getAutomationStatusFn);
  const status = useQuery({ queryKey: ["automation-status"], queryFn: () => getStatus() });

  return (
    <>
      <section className="surface p-5">
        <SectionHeading title="Automation status" hint="Exactly what is live and what still needs setting up" />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Real vacancies in your radar</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{status.data?.realJobs ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sources working</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {status.data?.workingSources ?? 0} of {status.data?.configuredSources ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last scan</dt>
            <dd className="mt-0.5 font-medium">
              {status.data?.lastScanAt ? new Date(status.data.lastScanAt).toLocaleString() : "Not run yet"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Daily 06:00 scan</dt>
            <dd className="mt-0.5 font-medium">
              {(() => {
                const s = status.data?.statuses.find((x) => x.key === "scheduler");
                if (!s) return "Checking…";
                return s.state === "working_live"
                  ? "Running every morning"
                  : s.state === "requires_configuration"
                    ? "Scheduled, waiting for its first run"
                    : "Not switched on yet";
              })()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Employers monitored</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {status.data?.monitoredEmployers ?? 0}
              {status.data?.libraryTotal ? ` of ${status.data.libraryTotal} in the checked library` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Healthy / needing attention</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {status.data?.healthySources ?? 0} / {status.data?.sourcesNeedingAttention ?? 0}
            </dd>
          </div>
        </dl>

        {(status.data?.providers ?? []).length > 0 ? (
          <ul className="mt-4 grid gap-2 border-t border-border pt-4 text-xs sm:grid-cols-2">
            {status.data?.providers.map((p) => (
              <li key={p.provider} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">
                  {p.name}
                  {p.experimental ? " (experimental)" : ""}
                </span>
                <span className="tabular-nums">
                  {p.enabled > 0
                    ? `${p.enabled} employer${p.enabled === 1 ? "" : "s"}, ${p.healthy} healthy`
                    : `not set up · ${p.libraryAvailable} available`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {(status.data?.recentErrors ?? []).length > 0 ? (
          <ul className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs text-amber-500">
            {status.data?.recentErrors.map((e, i) => (
              <li key={i}>
                {e.provider}
                {e.identifier ? ` (${e.identifier})` : ""}: {e.error}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="surface divide-y divide-border">
        <div className="px-5 pt-5">
          <SectionHeading title="Integrations" hint="Nothing here pretends to be live" />
        </div>
        {status.isLoading ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Checking each integration…</p>
        ) : (
          (status.data?.statuses ?? []).map((i) => (
            <div key={i.key} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{i.name}</p>
                <p className="text-xs text-muted-foreground">{i.detail}</p>
              </div>
              <StatusPill state={i.state} />
            </div>
          ))
        )}
      </section>
    </>
  );
}

/**
 * Official UK sponsor-register refresh and vacancy re-analysis. The dataset is
 * downloaded in chunks, so the refresh button keeps calling until it finishes.
 */
export function SponsorRegisterPanel() {
  const queryClient = useQueryClient();
  const getSponsorStatus = useServerFn(getSponsorRegisterStatusFn);
  const importChunk = useServerFn(importSponsorRegisterFn);
  const reanalyse = useServerFn(reanalyseSponsorshipFn);
  const [progress, setProgress] = useState<string | null>(null);

  const status = useQuery({ queryKey: ["sponsor-register"], queryFn: () => getSponsorStatus() });

  const refresh = useMutation({
    mutationFn: async () => {
      let batchId: string | null = null;
      let offset = 0;
      let rows = 0;
      for (let i = 0; i < 100; i += 1) {
        const chunk = await importChunk({ data: { batchId, offset } });
        batchId = chunk.batchId;
        offset = chunk.nextOffset;
        rows = chunk.totalRows;
        setProgress(
          `Loaded ${rows.toLocaleString("en-GB")} organisations (${Math.round((offset / Math.max(1, chunk.totalBytes)) * 100)}%)`,
        );
        if (chunk.done) return { rows, datasetDate: chunk.datasetDate };
      }
      throw new Error("Import did not finish — try again");
    },
    onSuccess: async (result) => {
      setProgress(null);
      toast.success(`Imported ${result.rows.toLocaleString("en-GB")} licensed sponsors (dataset ${result.datasetDate})`);
      await reanalyse();
      void queryClient.invalidateQueries();
    },
    onError: (e: Error) => {
      setProgress(null);
      toast.error(e.message);
    },
  });

  const recheck = useMutation({
    mutationFn: () => reanalyse(),
    onSuccess: (result) => {
      const s = result.sponsorship;
      toast.success(
        `Rechecked ${s.jobsAnalysed} vacancies · ${s.matched} employer(s) matched, ${s.possible} need review`,
      );
      void queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = status.data;

  return (
    <section className="surface p-5">
      <SectionHeading
        title="UK sponsor register"
        hint="Official GOV.UK register of Worker and Temporary Worker licensed sponsors"
      />
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Connection</dt>
          <dd className="mt-0.5 font-medium">
            {data?.connected
              ? data.method === "automatic"
                ? "Working live (official GOV.UK download)"
                : "Manual dataset"
              : data?.lastStatus === "failed"
                ? `Last refresh failed: ${data.lastError ?? "unknown error"}`
                : "Not connected"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dataset date</dt>
          <dd className="mt-0.5 font-medium">{data?.datasetDate ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Organisations loaded</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{(data?.entries ?? 0).toLocaleString("en-GB")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last refresh</dt>
          <dd className="mt-0.5 font-medium">
            {data?.lastRefresh ? new Date(data.lastRefresh).toLocaleString("en-GB") : "Never"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Employers matched</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{data?.companiesMatched ?? 0}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Needing review / not found</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {data?.companiesReview ?? 0} / {data?.companiesNotFound ?? 0}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Refresh sponsor dataset
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => recheck.mutate()}
          disabled={recheck.isPending || refresh.isPending}
        >
          {recheck.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Recheck sponsorship for live vacancies
        </Button>
      </div>
      {progress ? <p className="mt-2 text-xs text-muted-foreground">{progress}</p> : null}
      <p className="mt-3 text-xs text-muted-foreground">
        A sponsor licence means an employer can sponsor someone — it never means a particular vacancy will.
      </p>
    </section>
  );
}

/**
 * What the ranking has learned from the user's own behaviour, plus a retry
 * control for description analysis that has not completed yet.
 */
export function IntelligencePanel() {
  const queryClient = useQueryClient();
  const listLearned = useServerFn(listLearnedPreferencesFn);
  const resetLearned = useServerFn(resetLearnedPreferencesFn);
  const analyseBacklog = useServerFn(analyseBacklogFn);

  const learned = useQuery({ queryKey: ["learned-preferences"], queryFn: () => listLearned() });

  const reset = useMutation({
    mutationFn: () => resetLearned(),
    onSuccess: () => {
      toast.success("Learned preferences cleared");
      void queryClient.invalidateQueries({ queryKey: ["learned-preferences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const analyse = useMutation({
    mutationFn: () => analyseBacklog(),
    onSuccess: (result) => {
      toast.success(
        `Analysed ${result.analysis.analysed} role(s), reused ${result.analysis.reused}, ${result.analysis.pending} still queued`,
      );
      void queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kindLabel: Record<string, string> = {
    role_category: "Role type",
    company: "Employer",
    seniority: "Level",
    remote: "Work style",
    city: "Location",
  };

  return (
    <section className="surface p-5">
      <SectionHeading
        title="Ranking intelligence"
        hint="Analysis coverage and what your own choices have taught the ranking"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => analyse.mutate()} disabled={analyse.isPending}>
          {analyse.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Analyse anything outstanding
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => reset.mutate()}
          disabled={reset.isPending || (learned.data ?? []).length === 0}
        >
          Clear what it has learned
        </Button>
      </div>

      {learned.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (learned.data ?? []).length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing learned yet. Once you have saved, applied to or dismissed a few roles, small ranking
          adjustments appear here. They never change your filters or your profile.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border text-sm">
          {(learned.data ?? []).map((l) => (
            <li key={`${l.kind}-${l.value}`} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="text-muted-foreground">{kindLabel[l.kind] ?? l.kind}: </span>
                <span className="font-medium">{l.value}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {l.positiveCount} positive · {l.negativeCount} negative
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {l.adjustment > 0 ? "+" : ""}
                {l.adjustment}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
