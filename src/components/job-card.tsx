import { Link } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, ExternalLink, EyeOff, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge, LinkStatusBadge, SkillChip, SponsorshipBadge } from "@/components/badges";
import { ScoreRing } from "@/components/score-ring";
import { useRadar } from "@/lib/store";
import { formatPosted, formatSalary } from "@/lib/format";
import type { Job } from "@/lib/types";

export function JobCard({ job, compact = false }: { job: Job; compact?: boolean }) {
  const { companyById, isSaved, saveJob, unsaveJob, ignoreJob, markApplied, scoreOf } = useRadar();
  const company = companyById(job.companyId);
  const savedAlready = isSaved(job.id);

  return (
    <article className="surface surface-hover p-4 sm:p-5">
      <div className="flex gap-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-elevated font-display text-sm font-semibold text-primary"
          aria-hidden
        >
          {company.logo}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to="/jobs/$jobId"
                params={{ jobId: job.id }}
                className="font-display text-base font-semibold leading-tight hover:text-primary sm:text-lg"
              >
                {job.title}
              </Link>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {company.name} · {job.remote} · {job.source}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden />
                  {job.location}
                </span>
                <span>{formatSalary(job)}</span>
                <span>{formatPosted(job.datePosted)}</span>
              </p>
            </div>

            <div className="flex items-center gap-4">
              <ScoreRing value={job.match.overall} label="CV match" size={56} />
              <ScoreRing value={scoreOf(job)} label="Opportunity" size={56} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SponsorshipBadge status={job.sponsorship.status} confidence={job.sponsorship.confidence} />
            <LinkStatusBadge status={job.linkStatus} />
            <SkillChip>{job.seniority} fit</SkillChip>
            {job.match.missingSkills.length ? (
              <SkillChip tone="miss">{job.match.missingSkills.length} skills missing</SkillChip>
            ) : (
              <SkillChip tone="match">No skill gaps</SkillChip>
            )}
            {job.demo ? <DemoBadge /> : null}
            {job.analysisStatus === "pending" ? <SkillChip>Analysis queued</SkillChip> : null}
          </div>

          {job.match.whyRecommended.length ? (
            <p className="mt-2 text-sm text-muted-foreground">{job.match.whyRecommended[0]}</p>
          ) : null}


          {!compact ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.match.matchedSkills.slice(0, 5).map((s) => (
                <SkillChip key={s} tone="match">
                  {s}
                </SkillChip>
              ))}
              {job.match.missingSkills.map((s) => (
                <SkillChip key={s} tone="miss">
                  {s}
                </SkillChip>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/jobs/$jobId" params={{ jobId: job.id }}>
                <Sparkles className="size-4" aria-hidden />
                View analysis
              </Link>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                window.open(job.applyUrl, "_blank", "noopener");
                markApplied(job.id, { cvVersion: "CV v3 — Data Science" });
              }}
            >
              <ExternalLink className="size-4" aria-hidden />
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (savedAlready ? unsaveJob(job.id) : saveJob(job.id))}
              aria-pressed={savedAlready}
            >
              {savedAlready ? (
                <BookmarkCheck className="size-4" aria-hidden />
              ) : (
                <Bookmark className="size-4" aria-hidden />
              )}
              {savedAlready ? "Saved" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => ignoreJob(job.id)}>
              <EyeOff className="size-4" aria-hidden />
              Ignore
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
