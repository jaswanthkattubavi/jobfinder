import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlarmClock,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  Radar,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { JobCard } from "@/components/job-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { useRadar } from "@/lib/store";
import { getAutomationStatusFn } from "@/lib/services/discovery.functions";
import { formatDate, greeting } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { title: "Today — Job Radar AI" },
      {
        name: "description",
        content:
          "Your daily UK job scan: new relevant roles, strong matches, Apply ASAP opportunities and application follow-ups in one calm view.",
      },
      { property: "og:title", content: "Today — Job Radar AI" },
      {
        property: "og:description",
        content: "What should I apply to today? Job Radar AI answers it in one screen.",
      },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  const {
    visibleJobs,
    saved,
    applications,
    scans,
    profile,
    priorityOf,
    runScan,
    scanning,
    jobById,
    companyById,
  } = useRadar();

  const latest = scans[0];
  // Time-of-day greeting is resolved after mount so server and client agree.
  const [hello, setHello] = useState(`Hello, ${profile.name}`);
  useEffect(() => setHello(greeting(profile.name)), [profile.name]);
  // Today leads with genuine vacancies; demo roles only fill the view while no
  // real ones have been discovered yet.
  const rankedJobs = useMemo(() => {
    const real = visibleJobs.filter((j) => !j.demo);
    return real.length ? real : visibleJobs;
  }, [visibleJobs]);
  const applyAsap = rankedJobs.filter((j) => priorityOf(j) === "Apply ASAP");
  const strong = rankedJobs.filter((j) => priorityOf(j) === "Strong Match");
  const review = rankedJobs.filter((j) => priorityOf(j) === "Review");

  const getStatus = useServerFn(getAutomationStatusFn);
  const automation = useQuery({ queryKey: ["automation-status"], queryFn: () => getStatus() });
  const scheduler = automation.data?.statuses.find((i) => i.key === "scheduler");
  const followUps = applications.filter((a) => a.needsFollowUp);

  return (
    <div className="space-y-8">
      <PageHeader
        title={hello}
        description={
          latest
            ? `Last scan finished at ${latest.finishedAt}. Here's only what needs your attention.`
            : "No scan has run yet. Run one to score today's roles against your profile."
        }
        action={
          <Button onClick={runScan} disabled={scanning} variant="secondary">
            <RefreshCw className={scanning ? "size-4 animate-spin" : "size-4"} aria-hidden />
            {scanning ? "Scanning…" : "Run scan now"}
          </Button>
        }
      />

      <section className="surface radar-glow p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Latest job scan
            </p>
            <p className="mt-2 font-display text-lg font-semibold">
              {latest
                ? `${latest.discovered} jobs reviewed · ${strong.length + applyAsap.length} strong · ${applyAsap.length} Apply ASAP`
                : "No scan has run yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {latest
                ? `${latest.duplicatesRemoved} duplicates removed · ${latest.expired} expired vacancies retired · ${latest.sources} live sources connected`
                : "Run a scan to score the roles in your radar against your profile."}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Last scan: {latest ? `${formatDate(latest.date)}, ${latest.finishedAt}` : "never"}</p>
            <p>
              Automatic daily scans:{" "}
              {scheduler?.state === "working_live"
                ? "running each morning (06:00 UK time)"
                : scheduler?.state === "requires_configuration"
                  ? "scheduled, first run not seen yet"
                  : "not connected yet"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={Radar}
          label="Jobs reviewed"
          value={latest?.discovered ?? 0}
          hint={`${latest?.sources ?? 0} live sources connected`}
        />
        <StatCard
          icon={Sparkles}
          label="New relevant jobs"
          value={latest?.newJobs ?? 0}
          hint="Passed your filters"
        />
        <StatCard
          icon={AlarmClock}
          label="Apply ASAP"
          value={applyAsap.length}
          hint="Opportunity score 80+"
          tone="urgent"
        />
        <StatCard icon={Target} label="Strong matches" value={strong.length} hint="Scores 70–79" tone="positive" />
        <StatCard icon={Bookmark} label="Saved jobs" value={saved.length} hint="Across your folders" />
        <StatCard
          icon={CalendarClock}
          label="Follow-ups due"
          value={followUps.length}
          hint="Applications needing action"
          tone="urgent"
        />
      </section>

      <section>
        <SectionHeading title="Apply ASAP" count={applyAsap.length} hint="Highest priority — act today" />
        {applyAsap.length ? (
          <div className="space-y-3">
            {applyAsap.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No Apply ASAP jobs today"
            message="Nothing urgent right now. We'll keep scanning and surface new opportunities the moment they meet your criteria."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link to="/feed">Browse the full feed</Link>
              </Button>
            }
          />
        )}
      </section>

      <section>
        <SectionHeading title="Strong matches" count={strong.length} hint="Worth applying this week" />
        {strong.length ? (
          <div className="space-y-3">
            {strong.map((job) => (
              <JobCard key={job.id} job={job} compact />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Target}
            title="No strong matches yet"
            message="Your next scan may surface some. You can loosen your minimum scores in Settings if you'd like a wider net."
          />
        )}
      </section>

      <section>
        <SectionHeading title="Review later" count={review.length} hint="Scores 60–69" />
        {review.length ? (
          <div className="space-y-3">
            {review.map((job) => (
              <JobCard key={job.id} job={job} compact />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Radar}
            title="Nothing waiting for review"
            message="Everything found today was either a strong match or filtered out by your rules."
          />
        )}
      </section>

      <section>
        <SectionHeading title="Application follow-ups" count={followUps.length} />
        {followUps.length ? (
          <div className="space-y-3">
            {followUps.map((app) => {
              const job = jobById(app.jobId);
              if (!job) return null;
              return (
                <div key={app.id} className="surface surface-hover flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">
                      {job.title} · {companyById(job.companyId).name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {app.stage} · applied {formatDate(app.appliedOn)} · next: {app.nextStep ?? "—"}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/applications">Open tracker</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No follow-ups needed"
            message="Every application is up to date. We'll flag anything that goes quiet or has a deadline approaching."
          />
        )}
      </section>
    </div>
  );
}
