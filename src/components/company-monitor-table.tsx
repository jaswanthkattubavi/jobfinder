import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/page-header";
import {
  listMonitorCompaniesFn,
  revalidateCompanyFn,
  type MonitorCompany,
} from "@/lib/services/company-monitor.functions";
import { providerName } from "@/lib/services/sources/providers";

const groups = ["All", "Established", "Startups & scale-ups"] as const;
const statuses = ["All", "Monitored", "No current vacancies", "Needs review", "Needs configuration"] as const;

const statusCopy: Record<string, { label: string; className: string }> = {
  healthy: { label: "Monitored", className: "border-primary/40 bg-primary/10 text-primary" },
  healthy_no_vacancies: {
    label: "No current vacancies",
    className: "border-border bg-muted text-muted-foreground",
  },
  warning: { label: "Needs review", className: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  failed: { label: "Failing", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  needs_configuration: {
    label: "Needs configuration",
    className: "border-border bg-muted text-muted-foreground",
  },
  validating: { label: "Checking", className: "border-border bg-muted text-muted-foreground" },
  disabled: { label: "Off", className: "border-border bg-muted text-muted-foreground" },
};

function matchesStatus(row: MonitorCompany, status: (typeof statuses)[number]) {
  if (status === "All") return true;
  if (status === "Monitored") return row.sourceStatus === "healthy";
  if (status === "No current vacancies") return row.sourceStatus === "healthy_no_vacancies";
  if (status === "Needs review") return row.sourceStatus === "warning" || row.sourceStatus === "failed";
  return row.sourceStatus === "needs_configuration";
}

export function CompanyMonitorTable() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMonitorCompaniesFn);
  const recheckFn = useServerFn(revalidateCompanyFn);
  const [group, setGroup] = useState<(typeof groups)[number]>("All");
  const [status, setStatus] = useState<(typeof statuses)[number]>("Monitored");
  const [search, setSearch] = useState("");

  const rows = useQuery({ queryKey: ["monitor-companies"], queryFn: () => listFn() });

  const recheck = useMutation({
    mutationFn: (id: string) => recheckFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(
        r.status.startsWith("healthy")
          ? `${r.company}: ${r.jobs} vacancies via ${r.provider ? providerName(r.provider) : "its careers source"}`
          : `${r.company}: ${r.reason ?? "no career source found"}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["monitor-companies"] });
      void queryClient.invalidateQueries({ queryKey: ["company-monitor"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const filtered = useMemo(() => {
    const all = (rows.data ?? []).filter((r) => r.isTarget || r.provider !== "unknown");
    return all.filter((r) => {
      if (group === "Established" && r.group !== "established") return false;
      if (group === "Startups & scale-ups" && r.group !== "startup") return false;
      if (!matchesStatus(r, status)) return false;
      if (search && !r.company.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows.data, group, status, search]);

  return (
    <section className="surface space-y-4 p-5">
      <SectionHeading
        title="Monitored career sources"
        count={filtered.length}
        hint="Employers whose own careers source is checked directly. Anything not monitored shows the honest reason instead."
      />

      <div className="flex flex-wrap items-center gap-2">
        {groups.map((g) => (
          <Button key={g} size="sm" variant={group === g ? "secondary" : "ghost"} onClick={() => setGroup(g)}>
            {g}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {statuses.map((s) => (
          <Button key={s} size="sm" variant={status === s ? "secondary" : "ghost"} onClick={() => setStatus(s)}>
            {s}
          </Button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employer"
          className="ml-auto w-full sm:w-56"
          aria-label="Search monitored employers"
        />
      </div>

      {rows.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading employers…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No employers match this filter.</p>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((row) => {
            const copy = statusCopy[row.sourceStatus] ?? statusCopy["needs_configuration"]!;
            return (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {row.company}
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${copy.className}`}>
                      {copy.label}
                    </span>
                    {row.group ? (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {row.group === "startup" ? "Startup / scale-up" : "Established"}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {row.sector ?? "Sector unknown"}
                    {row.provider !== "unknown" ? ` · ${providerName(row.provider)}` : ""}
                    {row.jobsOpen !== null ? ` · ${row.jobsOpen} open` : ""}
                    {row.ukJobsOpen !== null ? ` · ${row.ukJobsOpen} UK` : ""}
                    {row.lastSuccessAt
                      ? ` · checked ${new Date(row.lastSuccessAt).toLocaleDateString("en-GB")}`
                      : ""}
                  </p>
                  {row.careersUrl ? (
                    <a
                      href={row.careersUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      Careers source
                    </a>
                  ) : null}
                  {!row.sourceStatus.startsWith("healthy") && (row.reason || row.lastError) ? (
                    <p className="mt-1 text-xs text-muted-foreground">{row.reason ?? row.lastError}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => recheck.mutate(row.id)}
                  disabled={recheck.isPending}
                >
                  {recheck.isPending && recheck.variables === row.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden />
                  )}
                  Check this company
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
