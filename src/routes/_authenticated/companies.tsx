import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { SponsorshipBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { CompanyMonitorTable } from "@/components/company-monitor-table";
import { useRadar } from "@/lib/store";
import { listJobSourcesFn } from "@/lib/services/discovery.functions";
import { normalizeCompanyName } from "@/lib/services/normalize";

export const Route = createFileRoute("/_authenticated/companies")({
  head: () => ({
    meta: [
      { title: "Companies — Job Radar AI" },
      {
        name: "description",
        content:
          "Company intelligence for your UK search: sponsor licence evidence, open matching roles, past applications and a priority watchlist.",
      },
      { property: "og:title", content: "Companies — Job Radar AI" },
      { property: "og:description", content: "Sponsorship evidence and hiring signal, company by company." },
    ],
  }),
  component: CompaniesPage,
});

const categories = [
  "All",
  "Priority",
  "Sponsorship Friendly",
  "Startup",
  "Large Company",
  "Recently Hiring",
  "Previously Applied",
] as const;

function CompaniesPage() {
  const { companies, toggleFollow, visibleJobs } = useRadar();
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const listSources = useServerFn(listJobSourcesFn);
  const sources = useQuery({ queryKey: ["job-sources"], queryFn: () => listSources() });

  // Which employers actually have a career source being scanned. Anything else
  // is honestly labelled instead of implying it is monitored.
  const monitored = new Set(
    (sources.data ?? [])
      .filter((s) => s.enabled)
      .map((s) => normalizeCompanyName(s.companyName) || s.companyName.toLowerCase()),
  );

  const filtered =
    category === "All" ? companies : companies.filter((c) => c.tags.includes(category as never));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Followed companies get scanning priority — their career pages are checked more often and new roles are highlighted."
      />

      <CompanyMonitorTable />

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={category === c ? "secondary" : "ghost"}
            onClick={() => setCategory(c)}
          >
            {c}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies in this category"
          message="Follow a company or run a scan to build up company intelligence here."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((company) => {
            const companyJobs = visibleJobs.filter((j) => j.companyId === company.id);
            const openRoles = companyJobs.length;
            return (
              <article key={company.id} className="surface surface-hover p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-elevated font-display font-semibold text-primary">
                      {company.logo}
                    </span>
                    <div>
                      <h2 className="font-display text-base font-semibold">{company.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {company.industry} · {company.size} · {company.headquarters}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        UK locations: {company.ukLocations.join(", ")}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={company.followed ? "secondary" : "ghost"}
                    onClick={() => toggleFollow(company.id)}
                    aria-pressed={company.followed}
                  >
                    {company.followed ? <Star className="size-4" aria-hidden /> : <StarOff className="size-4" aria-hidden />}
                    {company.followed ? "Following" : "Follow"}
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <SponsorshipBadge
                    status={company.sponsorshipStatus}
                    confidence={company.sponsorshipConfidence}
                  />
                  <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    Priority: {company.priority}
                  </span>
                  {monitored.has(normalizeCompanyName(company.name) || company.name.toLowerCase()) ? (
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                      Career source monitored
                    </span>
                  ) : (
                    <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      Career source not configured
                    </span>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Open matching roles</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{openRoles}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Your applications</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{company.previousApplications}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Avg match</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{company.averageMatchScore}%</dd>
                  </div>
                </dl>

                <div className="mt-4 space-y-1.5 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sponsor licence
                  </p>
                  <p>
                    {company.sponsorLicenceMatch === "matched"
                      ? "Matched on the UK sponsor register"
                      : company.sponsorLicenceMatch === "possible"
                        ? "Possible match — needs review"
                        : company.sponsorLicenceMatch === "not_found"
                          ? "Not found on the current register"
                          : "Unknown — no register dataset loaded"}
                  </p>
                  <p className="text-muted-foreground">
                    Legal entity: {company.matchedLegalEntity ?? "—"}
                    {company.sponsorLicenceType ? ` · ${company.sponsorLicenceType}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dataset {company.sponsorRegisterDate ?? "unknown"} · last checked{" "}
                    {company.sponsorLastChecked
                      ? new Date(company.sponsorLastChecked).toLocaleDateString("en-GB")
                      : "never"}
                  </p>
                  {company.sponsorEvidence.length ? (
                    <ul className="space-y-1 text-muted-foreground">
                      {company.sponsorEvidence.map((e) => (
                        <li key={e}>· {e}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="mt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Live vacancy sponsorship outcomes
                  </p>
                  {companyJobs.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">No live vacancies right now.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {companyJobs.slice(0, 4).map((j) => (
                        <li key={j.id}>
                          · {j.title} — <span className="text-foreground">{j.sponsorship.status}</span>{" "}
                          ({j.sponsorship.confidence}%)
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    A licence means the employer can sponsor someone — it never means this vacancy will.
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
