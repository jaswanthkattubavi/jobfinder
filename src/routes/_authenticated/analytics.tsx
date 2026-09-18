import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, GraduationCap, Send, Trophy } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { useRadar } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Job Radar AI" },
      {
        name: "description",
        content:
          "Application funnel, response and interview rates, score averages and the skills gaps costing you the most opportunities.",
      },
      { property: "og:title", content: "Analytics — Job Radar AI" },
      { property: "og:description", content: "Metrics that actually improve your job search." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { applications, jobs, saved, ignored, visibleJobs, scans, jobById } = useRadar();

  const applied = applications.filter((a) => a.appliedOn);
  const interviewing = applications.filter((a) =>
    ["Recruiter Screen", "Interview", "Technical Interview", "Final Interview", "Offer"].includes(a.stage),
  );
  const offers = applications.filter((a) => a.stage === "Offer");

  const avgMatch = Math.round(
    applied.reduce((s, a) => s + (jobById(a.jobId)?.match.overall ?? 0), 0) / (applied.length || 1),
  );
  const avgOpportunity = Math.round(
    applied.reduce((s, a) => s + (jobById(a.jobId)?.opportunityScore ?? 0), 0) / (applied.length || 1),
  );

  const missingSkills = useMemo(() => {
    const counts = new Map<string, number>();
    visibleJobs.forEach((job) =>
      job.match.missingSkills.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1)),
    );
    return [...counts.entries()]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count);
  }, [visibleJobs]);

  const funnel = [
    { stage: "Discovered", value: jobs.length },
    { stage: "Saved", value: saved.length },
    { stage: "Applied", value: applied.length },
    { stage: "Interview", value: interviewing.length },
    { stage: "Offer", value: offers.length },
  ];

  const weekly = scans
    .slice()
    .reverse()
    .map((s, i) => ({
      day: `Scan ${i + 1}`,
      relevant: s.newJobs,
      strong: s.strongMatches,
    }));

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleJobs.forEach((j) => counts.set(j.roleCategory, (counts.get(j.roleCategory) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [visibleJobs]);

  const rate = (n: number) => `${Math.round((n / (applied.length || 1)) * 100)}%`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Only the numbers that change what you do next — conversion, score quality and skill gaps."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Send} label="Applications" value={applied.length} hint="All time" />
        <StatCard icon={Activity} label="Response rate" value={rate(interviewing.length)} hint="Reached a human" tone="positive" />
        <StatCard icon={Trophy} label="Interview rate" value={rate(interviewing.length)} hint="Screen or later" />
        <StatCard icon={GraduationCap} label="Avg match / score" value={`${avgMatch}% · ${avgOpportunity}`} hint="On applied roles" />
      </section>

      <section>
        <SectionHeading title="Application funnel" hint="Discovered through to offer" />
        <div className="surface p-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnel}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="stage" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Bar dataKey="value" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <SectionHeading title="Scan activity" hint="Relevant and strong matches per scan" />
        <div className="surface p-4">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Line type="monotone" dataKey="relevant" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="strong" stroke="var(--color-chart-3)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Skills gap" hint="Most common gaps across strong opportunities" />
          <div className="surface divide-y divide-border">
            {missingSkills.map(({ skill, count }) => (
              <div key={skill} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{skill}</span>
                <span className="flex items-center gap-3">
                  <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-warning"
                      style={{ width: `${(count / (missingSkills[0]?.count ?? 1)) * 100}%` }}
                    />
                  </span>
                  <span className="w-16 text-right text-sm text-muted-foreground tabular-nums">
                    {count} job{count > 1 ? "s" : ""}
                  </span>
                </span>
              </div>
            ))}
            {missingSkills.length ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Potentially worth learning next: {missingSkills.slice(0, 3).map((m) => m.skill).join(", ")}.
              </p>
            ) : null}
          </div>
        </section>

        <section>
          <SectionHeading title="Where your matches come from" hint="Role categories in your active feed" />
          <div className="surface divide-y divide-border">
            {roleCounts.map(([role, count]) => (
              <div key={role} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{role}</span>
                <span className="text-muted-foreground tabular-nums">{count}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-muted-foreground">Ignored / not interested</span>
              <span className="text-muted-foreground tabular-nums">{ignored.length}</span>
            </div>
          </div>
        </section>
      </div>

      <section>
        <SectionHeading title="Scan history" hint="Every automated run" />
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Finished</th>
                <th className="px-4 py-3 font-medium">Sources</th>
                <th className="px-4 py-3 font-medium">Discovered</th>
                <th className="px-4 py-3 font-medium">New</th>
                <th className="px-4 py-3 font-medium">Duplicates</th>
                <th className="px-4 py-3 font-medium">Expired</th>
                <th className="px-4 py-3 font-medium">Strong</th>
                <th className="px-4 py-3 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">{s.startedAt}</td>
                  <td className="px-4 py-3">{s.finishedAt}</td>
                  <td className="px-4 py-3 tabular-nums">{s.sources}</td>
                  <td className="px-4 py-3 tabular-nums">{s.discovered}</td>
                  <td className="px-4 py-3 tabular-nums">{s.newJobs}</td>
                  <td className="px-4 py-3 tabular-nums">{s.duplicatesRemoved}</td>
                  <td className="px-4 py-3 tabular-nums">{s.expired}</td>
                  <td className="px-4 py-3 tabular-nums">{s.strongMatches}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.errors.length ? s.errors.join("; ") : "None"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
