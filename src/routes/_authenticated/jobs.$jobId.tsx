import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  MapPin,
  ShieldQuestion,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DemoBadge,
  LinkStatusBadge,
  PriorityBadge,
  SkillChip,
  SponsorshipBadge,
} from "@/components/badges";
import { ScoreBar, ScoreRing } from "@/components/score-ring";
import { EmptyState } from "@/components/empty-state";
import { useRadar } from "@/lib/store";
import { formatDate, formatPosted, formatSalary } from "@/lib/format";
import type { FeedbackReason } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({
    meta: [
      { title: "Job analysis — Job Radar AI" },
      {
        name: "description",
        content:
          "Full analysis of a discovered role: CV match breakdown, sponsorship evidence, skill gaps and an application strategy.",
      },
      { property: "og:title", content: "Job analysis — Job Radar AI" },
      { property: "og:description", content: "Match breakdown, sponsorship evidence and how to apply." },
    ],
  }),
  component: JobDetailPage,
  notFoundComponent: () => (
    <EmptyState
      icon={TriangleAlert}
      title="Role not found"
      message="This vacancy may have expired or been removed from your feed."
    />
  ),
});

const feedbackReasons: FeedbackReason[] = [
  "Interested",
  "Not Interested",
  "Too Senior",
  "Wrong Role",
  "No Sponsorship",
  "Wrong Location",
  "Already Seen",
  "Bad Company Fit",
];

function JobDetailPage() {
  const { jobId } = Route.useParams();
  const {
    jobById,
    companyById,
    scoreOf,
    priorityOf,
    isSaved,
    saveJob,
    unsaveJob,
    ignoreJob,
    markApplied,
    giveFeedback,
    applicationForJob,
    profile,
  } = useRadar();

  const job = jobById(jobId);
  if (!job) throw notFound();
  const company = companyById(job.companyId);
  const application = applicationForJob(job.id);
  const savedAlready = isSaved(job.id);

  const locationFit = profile.preferredLocations.some((l) =>
    job.city.toLowerCase().includes(l.toLowerCase().replace(" uk", "")),
  )
    ? 100
    : job.remote === "Remote"
      ? 90
      : 55;
  const seniorityFit = profile.preferredSeniority.includes(job.seniority) ? 100 : 50;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/feed">
          <ArrowLeft className="size-4" aria-hidden />
          Back to feed
        </Link>
      </Button>

      <header className="surface radar-glow p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-elevated font-display font-semibold text-primary">
              {company.logo}
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold">{job.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link to="/companies" className="hover:text-primary">
                  {company.name}
                </Link>{" "}
                · {job.employmentType} · {job.seniority}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-4" aria-hidden />
                  {job.location} · {job.remote}
                </span>
                <span>{formatSalary(job)}</span>
                <span>{formatPosted(job.datePosted)}</span>
                <span>Source: {job.source}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <PriorityBadge priority={priorityOf(job)} />
                <LinkStatusBadge status={job.linkStatus} />
                <SponsorshipBadge
                  status={job.sponsorship.status}
                  confidence={job.sponsorship.confidence}
                />
                {job.demo ? <DemoBadge /> : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <ScoreRing value={job.match.overall} label="CV match" size={78} />
            <ScoreRing value={scoreOf(job)} label="Opportunity" size={78} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              window.open(job.applyUrl, "_blank", "noopener");
            }}
          >
            <ExternalLink className="size-4" aria-hidden />
            Apply on company website
          </Button>
          <Button
            variant="secondary"
            onClick={() => markApplied(job.id, { cvVersion: profile.cvVersions[2] })}
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {application?.stage === "Applied" ? "Marked applied" : "Mark applied"}
          </Button>
          <Button variant="ghost" onClick={() => (savedAlready ? unsaveJob(job.id) : saveJob(job.id))}>
            {savedAlready ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
            {savedAlready ? "Saved" : "Save"}
          </Button>
          <Button variant="ghost" onClick={() => ignoreJob(job.id)}>
            <EyeOff className="size-4" aria-hidden />
            Ignore
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="surface p-5">
            <h2 className="font-display text-lg font-semibold">Why this job matches</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{job.match.explanation}</p>
            {job.match.whyRecommended.length ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {job.match.whyRecommended.map((r) => (
                  <li key={r} className="text-foreground">
                    · {r}
                  </li>
                ))}
              </ul>
            ) : null}
            {job.match.gapsSummary ? (
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Gaps:</span> {job.match.gapsSummary}
              </p>
            ) : null}
            {job.analysisStatus !== "completed" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {job.analysisStatus === "failed"
                  ? `Detailed description analysis failed and will be retried${job.analysisError ? ` (${job.analysisError})` : ""}. Scores use the wording that could be read.`
                  : job.analysisStatus === "skipped"
                    ? "This advert was too short for a full description analysis, so scoring uses the listed requirements only."
                    : "Detailed description analysis is still queued for this role, so this breakdown may improve after the next scan."}
              </p>
            ) : null}
            {job.match.learnedAdjustment !== 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Adjusted by {job.match.learnedAdjustment > 0 ? "+" : ""}
                {job.match.learnedAdjustment} from what you have saved, applied to and dismissed before.
              </p>
            ) : null}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Strengths to emphasise</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {job.match.strengths.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">What may hurt your application</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {job.match.risks.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-lg font-semibold">Skills match</h2>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-medium">Matched</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.match.matchedSkills.map((s) => (
                    <SkillChip key={s} tone="match">
                      {s}
                    </SkillChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Missing</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.match.missingSkills.length ? (
                    job.match.missingSkills.map((s) => (
                      <SkillChip key={s} tone="miss">
                        {s}
                      </SkillChip>
                    ))
                  ) : (
                    <SkillChip tone="match">Nothing missing</SkillChip>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Partial</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.match.partialSkills.map((s) => (
                    <SkillChip key={s} tone="partial">
                      {s}
                    </SkillChip>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-lg font-semibold">Requirements</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Required</p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {job.requiredSkills.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium">Preferred</p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {job.preferredSkills.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground">
              Experience: {job.yearsExperience} · Education: {job.education}
            </p>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-lg font-semibold">Sponsorship analysis</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <SponsorshipBadge
                status={job.sponsorship.status}
                confidence={job.sponsorship.confidence}
              />
              <span className="text-sm text-muted-foreground">
                Confidence is an estimate — never treat it as a guarantee.
              </span>
            </div>
            {job.sponsorship.details ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Employer sponsor licence
                  </dt>
                  <dd className="mt-0.5">
                    {job.sponsorship.details.employerMatch === "matched"
                      ? "Matched on the UK sponsor register"
                      : job.sponsorship.details.employerMatch === "possible"
                        ? "Possible match — needs review"
                        : job.sponsorship.details.employerMatch === "not_found"
                          ? "Not found on the current register"
                          : "Unknown — no register dataset loaded"}
                    {job.sponsorship.details.matchConfidence
                      ? ` (${job.sponsorship.details.matchConfidence}% name confidence)`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Matched legal entity
                  </dt>
                  <dd className="mt-0.5">{job.sponsorship.details.matchedEntity ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Job-level sponsorship wording
                  </dt>
                  <dd className="mt-0.5">{job.sponsorship.details.jobWording}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Work-authorisation restriction
                  </dt>
                  <dd className="mt-0.5">{job.sponsorship.details.workAuthorisation}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Citizenship / security restriction
                  </dt>
                  <dd className="mt-0.5">{job.sponsorship.details.restriction}</dd>
                </div>
              </dl>
            ) : null}
            <div className="mt-4">
              <p className="text-sm font-medium">Evidence</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {job.sponsorship.details?.items.length
                  ? job.sponsorship.details.items.map((item) => (
                      <li key={item.text} className="flex gap-2">
                        <span
                          aria-hidden
                          className={
                            item.tone === "positive"
                              ? "text-success"
                              : item.tone === "negative"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }
                        >
                          {item.tone === "positive" ? "✓" : item.tone === "negative" ? "✕" : "?"}
                        </span>
                        <span>
                          {item.text}
                          <span className="ml-1 text-xs uppercase tracking-wide text-muted-foreground">
                            {item.source === "company" ? "employer" : "vacancy"}
                          </span>
                          {item.snippet ? (
                            <span className="mt-1 block text-xs italic text-muted-foreground">
                              “{item.snippet}”
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))
                  : job.sponsorship.evidence.map((e) => <li key={e}>· {e}</li>)}
              </ul>
            </div>
            {job.sponsorship.details?.conclusion ? (
              <p className="mt-4 rounded-lg border border-border bg-elevated p-3 text-sm text-muted-foreground">
                {job.sponsorship.details.conclusion}
              </p>
            ) : null}
            {job.sponsorship.warnings.length ? (
              <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-warning">
                  <ShieldQuestion className="size-4" aria-hidden />
                  Warnings
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {job.sponsorship.warnings.map((w) => (
                    <li key={w}>· {w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-lg font-semibold">Application strategy</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="font-medium">Keywords to include in your CV</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.atsKeywords.map((k) => (
                    <SkillChip key={k}>{k}</SkillChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-medium">Recommended emphasis</p>
                <p className="mt-1 text-muted-foreground">
                  Lead with your strongest shipped project using{" "}
                  {job.match.matchedSkills.slice(0, 2).join(" and ")}, then mirror the advert's language
                  around {job.roleCategory.toLowerCase()} delivery. Address the{" "}
                  {job.match.missingSkills[0] ?? "domain"} gap honestly — show adjacent experience rather
                  than claiming it.
                </p>
              </div>
            </div>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-lg font-semibold">Job description</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {job.description}
            </p>
            <p className="mt-4 text-sm font-medium">Responsibilities</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {job.responsibilities.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="surface p-5">
            <h2 className="font-display text-base font-semibold">Opportunity summary</h2>
            <div className="mt-4 space-y-3">
              <ScoreBar label="CV match" value={job.match.overall} />
              <ScoreBar label="Opportunity score" value={scoreOf(job)} />
              <ScoreBar label="Sponsorship confidence" value={job.sponsorship.confidence} />
              <ScoreBar label="Seniority fit" value={seniorityFit} />
              <ScoreBar label="Location fit" value={locationFit} />
            </div>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-base font-semibold">CV match breakdown</h2>
            <div className="mt-4 space-y-3">
              <ScoreBar label="Essential skills" value={job.match.requiredSkills} />
              <ScoreBar label="Nice-to-have skills" value={job.match.preferredSkills} />
              <ScoreBar label="Experience" value={job.match.experience} />
              <ScoreBar label="Seniority" value={job.match.seniority} />
              <ScoreBar label="Responsibilities" value={job.match.responsibilities} />
              <ScoreBar label="Education" value={job.match.education} />
              <ScoreBar label="Domain" value={job.match.domain} />
              <ScoreBar label="Advert keywords" value={job.match.keywords} />

            </div>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-base font-semibold">Verification</h2>
            <dl className="mt-3 space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>Link status</dt>
                <dd className="text-foreground">{job.linkStatus}</dd>
              </div>
              {job.verificationReason ? (
                <p className="text-xs">{job.verificationReason}</p>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt>Last verified</dt>
                <dd className="text-foreground">{formatDate(job.lastVerified)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Discovered</dt>
                <dd className="text-foreground">{formatDate(job.dateDiscovered)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Source</dt>
                <dd className="text-foreground">{job.source}</dd>
              </div>
            </dl>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-base font-semibold">Improve future matches</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your feedback tunes ranking. Nothing critical changes without your say.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {feedbackReasons.map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant="secondary"
                  onClick={() => giveFeedback(job.id, r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
