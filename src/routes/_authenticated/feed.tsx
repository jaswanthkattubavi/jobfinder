import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LayoutGrid, Rows3, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { JobCard } from "@/components/job-card";
import { PageHeader } from "@/components/page-header";
import { LinkStatusBadge, PriorityBadge, SponsorshipBadge } from "@/components/badges";
import { useRadar } from "@/lib/store";
import { formatPosted, formatSalary } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [
      { title: "Job Feed — Job Radar AI" },
      {
        name: "description",
        content:
          "Search, filter and rank every discovered UK tech role by opportunity score, CV match, sponsorship confidence and recency.",
      },
      { property: "og:title", content: "Job Feed — Job Radar AI" },
      { property: "og:description", content: "Every discovered role, ranked and filterable." },
    ],
  }),
  component: FeedPage,
});

type Sort = "opportunity" | "match" | "newest" | "sponsorship" | "salary";

function FeedPage() {
  const { visibleJobs, companyById, scoreOf, priorityOf, isSaved, applicationForJob } = useRadar();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("opportunity");
  const [minScore, setMinScore] = useState(60);
  const [sponsorshipOnly, setSponsorshipOnly] = useState(false);
  const [remoteFilter, setRemoteFilter] = useState("all");
  const [dataFilter, setDataFilter] = useState<"all" | "real" | "demo">("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(1);
  const perPage = 6;

  const results = useMemo(() => {
    const filtered = visibleJobs.filter((job) => {
      const company = companyById(job.companyId);
      const haystack = `${job.title} ${company.name} ${job.city} ${job.match.matchedSkills.join(" ")}`.toLowerCase();
      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (scoreOf(job) < minScore) return false;
      if (sponsorshipOnly && !["Confirmed", "Likely"].includes(job.sponsorship.status)) return false;
      if (remoteFilter !== "all" && job.remote !== remoteFilter) return false;
      if (dataFilter === "real" && job.demo) return false;
      if (dataFilter === "demo" && !job.demo) return false;
      return true;
    });

    const sorters: Record<Sort, (a: typeof filtered[number], b: typeof filtered[number]) => number> = {
      opportunity: (a, b) => scoreOf(b) - scoreOf(a),
      match: (a, b) => b.match.overall - a.match.overall,
      newest: (a, b) => +new Date(b.datePosted) - +new Date(a.datePosted),
      sponsorship: (a, b) => b.sponsorship.confidence - a.sponsorship.confidence,
      salary: (a, b) => (b.salaryMax ?? 0) - (a.salaryMax ?? 0),
    };

    return [...filtered].sort(sorters[sort]);
  }, [visibleJobs, companyById, query, minScore, sponsorshipOnly, remoteFilter, dataFilter, sort, scoreOf]);

  const shown = results.slice(0, page * perPage);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Feed"
        description="Everything discovered and analysed, ranked by how strongly we recommend applying."
        action={
          <div className="flex gap-1 rounded-lg border border-border bg-elevated p-1">
            <Button
              size="sm"
              variant={view === "cards" ? "secondary" : "ghost"}
              onClick={() => setView("cards")}
            >
              <LayoutGrid className="size-4" aria-hidden />
              Cards
            </Button>
            <Button
              size="sm"
              variant={view === "table" ? "secondary" : "ghost"}
              onClick={() => setView("table")}
            >
              <Rows3 className="size-4" aria-hidden />
              Table
            </Button>
          </div>
        }
      />

      <section className="surface space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, company, city or skill"
              className="pl-9"
              aria-label="Search jobs"
            />
          </div>

          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-48" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opportunity">Opportunity score</SelectItem>
              <SelectItem value="match">CV match</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="sponsorship">Sponsorship probability</SelectItem>
              <SelectItem value="salary">Salary</SelectItem>
            </SelectContent>
          </Select>

          <Select value={remoteFilter} onValueChange={setRemoteFilter}>
            <SelectTrigger className="w-40" aria-label="Work style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any work style</SelectItem>
              <SelectItem value="Remote">Remote</SelectItem>
              <SelectItem value="Hybrid">Hybrid</SelectItem>
              <SelectItem value="On-site">On-site</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dataFilter} onValueChange={(v) => setDataFilter(v as typeof dataFilter)}>
            <SelectTrigger className="w-44" aria-label="Real or demo roles">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Real + demo roles</SelectItem>
              <SelectItem value="real">Real vacancies only</SelectItem>
              <SelectItem value="demo">Demo roles only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <Label className="inline-flex items-center gap-2">
                <SlidersHorizontal className="size-4" aria-hidden />
                Minimum opportunity score
              </Label>
              <span className="font-medium tabular-nums">{minScore}</span>
            </div>
            <Slider
              value={[minScore]}
              min={40}
              max={95}
              step={5}
              onValueChange={([v]) => setMinScore(v ?? 60)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-elevated px-3 py-2">
            <Label htmlFor="sponsor-only" className="text-sm">
              Sponsorship confirmed or likely only
            </Label>
            <Switch id="sponsor-only" checked={sponsorshipOnly} onCheckedChange={setSponsorshipOnly} />
          </div>
        </div>
      </section>

      {shown.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No roles match these filters"
          message="Try lowering the minimum opportunity score, widening work style, or clearing your search."
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setQuery("");
                setMinScore(60);
                setSponsorshipOnly(false);
                setRemoteFilter("all");
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : view === "cards" ? (
        <div className="space-y-3">
          {shown.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Salary</th>
                <th className="px-4 py-3 font-medium">Match</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Sponsorship</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((job) => (
                <tr key={job.id} className="border-b border-border/60 last:border-0 hover:bg-elevated">
                  <td className="px-4 py-3">
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: job.id }}
                      className="font-medium hover:text-primary"
                    >
                      {job.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {companyById(job.companyId).name} · {formatPosted(job.datePosted)}
                      {isSaved(job.id) ? " · saved" : ""}
                      {applicationForJob(job.id) ? " · applied" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {job.city} · {job.remote}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSalary(job)}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">{job.match.overall}%</td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={priorityOf(job)} />
                  </td>
                  <td className="px-4 py-3">
                    <SponsorshipBadge
                      status={job.sponsorship.status}
                      confidence={job.sponsorship.confidence}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <LinkStatusBadge status={job.linkStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length < results.length ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
            Load more ({results.length - shown.length} remaining)
          </Button>
        </div>
      ) : null}
    </div>
  );
}
