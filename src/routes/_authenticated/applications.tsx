import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardList, Columns3, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SponsorshipBadge } from "@/components/badges";
import { useRadar } from "@/lib/store";
import { formatDate } from "@/lib/format";
import type { ApplicationStage } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({
    meta: [
      { title: "Applications — Job Radar AI" },
      {
        name: "description",
        content:
          "Track every UK application through screens, assessments and interviews, with follow-ups surfaced automatically.",
      },
      { property: "og:title", content: "Applications — Job Radar AI" },
      { property: "og:description", content: "Your application pipeline, stage by stage." },
    ],
  }),
  component: ApplicationsPage,
});

const stages: ApplicationStage[] = [
  "Discovered",
  "Saved",
  "Applied",
  "Assessment",
  "Recruiter Screen",
  "Interview",
  "Technical Interview",
  "Final Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];

function ApplicationsPage() {
  const { applications, jobById, companyById, moveStage } = useRadar();
  const [view, setView] = useState<"board" | "table">("board");
  const [dragged, setDragged] = useState<string | null>(null);

  const activeStages = stages.filter((s) => applications.some((a) => a.stage === s));

  if (applications.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Applications" />
        <EmptyState
          icon={ClipboardList}
          title="No applications yet"
          message="Mark a role as applied from Today or a job's analysis page and it will appear here automatically."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link to="/">Open Today</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Drag a card to a new stage, or switch to the table for detail. Follow-ups appear on Today."
        action={
          <div className="flex gap-1 rounded-lg border border-border bg-elevated p-1">
            <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} onClick={() => setView("board")}>
              <Columns3 className="size-4" aria-hidden />
              Board
            </Button>
            <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} onClick={() => setView("table")}>
              <Rows3 className="size-4" aria-hidden />
              Table
            </Button>
          </div>
        }
      />

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex min-w-max gap-3">
            {activeStages.map((stage) => (
              <section
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragged) moveStage(dragged, stage);
                  setDragged(null);
                }}
                className="w-72 shrink-0 rounded-xl border border-border bg-elevated p-3"
              >
                <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
                  {stage}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                    {applications.filter((a) => a.stage === stage).length}
                  </span>
                </h2>
                <div className="space-y-2">
                  {applications
                    .filter((a) => a.stage === stage)
                    .map((app) => {
                      const job = jobById(app.jobId);
                      if (!job) return null;
                      return (
                        <article
                          key={app.id}
                          draggable
                          onDragStart={() => setDragged(app.id)}
                          className="surface cursor-grab p-3 active:cursor-grabbing"
                        >
                          <Link
                            to="/jobs/$jobId"
                            params={{ jobId: job.id }}
                            className="text-sm font-medium hover:text-primary"
                          >
                            {job.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {companyById(job.companyId).name}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Applied {formatDate(app.appliedOn)}
                          </p>
                          {app.nextStep ? (
                            <p className="mt-1 text-xs text-primary">Next: {app.nextStep}</p>
                          ) : null}
                          <div className="mt-2">
                            <Select
                              value={app.stage}
                              onValueChange={(v) => moveStage(app.id, v as ApplicationStage)}
                            >
                              <SelectTrigger className="h-8 text-xs" aria-label={`Stage for ${job.title}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {stages.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </article>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Applied</th>
                <th className="px-4 py-3 font-medium">Scores</th>
                <th className="px-4 py-3 font-medium">Sponsorship</th>
                <th className="px-4 py-3 font-medium">CV used</th>
                <th className="px-4 py-3 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const job = jobById(app.jobId);
                if (!job) return null;
                return (
                  <tr key={app.id} className="border-b border-border/60 last:border-0 hover:bg-elevated">
                    <td className="px-4 py-3">
                      <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="font-medium hover:text-primary">
                        {job.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{companyById(job.companyId).name}</p>
                    </td>
                    <td className="px-4 py-3">{app.stage}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(app.appliedOn)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {job.match.overall}% · {job.opportunityScore}
                    </td>
                    <td className="px-4 py-3">
                      <SponsorshipBadge status={job.sponsorship.status} confidence={job.sponsorship.confidence} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{app.cvVersion ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{app.nextStep ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
