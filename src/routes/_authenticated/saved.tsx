import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { JobCard } from "@/components/job-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { savedFolders } from "@/lib/demo-data";
import { useRadar } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/saved")({
  head: () => ({
    meta: [
      { title: "Saved jobs — Job Radar AI" },
      {
        name: "description",
        content:
          "Your shortlisted UK roles, organised into folders like Apply Tonight, Weekend and Sponsorship Check, with expiry alerts.",
      },
      { property: "og:title", content: "Saved jobs — Job Radar AI" },
      { property: "og:description", content: "Shortlisted roles, organised and kept up to date." },
    ],
  }),
  component: SavedPage,
});

function SavedPage() {
  const { saved, jobById, saveJob } = useRadar();

  const grouped = savedFolders
    .map((folder) => ({
      folder,
      items: saved.filter((s) => s.folder === folder),
    }))
    .filter((g) => g.items.length > 0);

  const expiring = saved
    .map((s) => jobById(s.jobId))
    .filter((j) => j && j.linkStatus !== "Live");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Saved"
        description="Shortlisted roles grouped into folders. We keep checking each link and warn you before one expires."
      />

      {expiring.length ? (
        <div className="surface flex flex-wrap items-center gap-3 border-warning/30 bg-warning/10 p-4">
          <TriangleAlert className="size-5 text-warning" aria-hidden />
          <p className="text-sm">
            {expiring.length} saved role{expiring.length > 1 ? "s" : ""} could not be verified as live in
            the last scan. Apply soon or re-check the link.
          </p>
        </div>
      ) : null}

      {saved.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          message="Save a role from Today or the Job Feed and it will appear here, sorted into the folder you choose."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link to="/feed">Open the Job Feed</Link>
            </Button>
          }
        />
      ) : (
        grouped.map((group) => (
          <section key={group.folder}>
            <SectionHeading title={group.folder} count={group.items.length} />
            <div className="space-y-3">
              {group.items.map((item) => {
                const job = jobById(item.jobId);
                if (!job) return null;
                return (
                  <div key={item.jobId} className="space-y-2">
                    <JobCard job={job} compact />
                    <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
                      <span>Move to folder</span>
                      <Select value={item.folder} onValueChange={(v) => saveJob(job.id, v)}>
                        <SelectTrigger className="h-8 w-52" aria-label={`Folder for ${job.title}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {savedFolders.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
