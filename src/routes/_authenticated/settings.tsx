import { createFileRoute } from "@tanstack/react-router";
import {
  AutomationStatusPanel,
  IntelligencePanel,
  JobSourcesPanel,
  SponsorRegisterPanel,
} from "@/components/job-sources-panel";
import { CompanyMonitorPanel } from "@/components/company-monitor-panel";
import { EmailDigestPanel, SystemHealthPanel } from "@/components/email-panel";
import {
  CandidateProfilePanel,
  CvVersionsPanel,
  TargetingPanel,
  WorkAuthorisationPanel,
} from "@/components/profile-panels";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { learnFromFeedback } from "@/lib/services/pipeline";
import { useRadar } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Profile & search settings — Job Radar AI" },
      {
        name: "description",
        content:
          "Manage your candidate profile, target roles, work authorisation, scoring weights, notifications and integration status.",
      },
      { property: "og:title", content: "Profile & search settings — Job Radar AI" },
      { property: "og:description", content: "Tune what your radar looks for and how it ranks it." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const {
    profile,
    preferences,
    updatePreferences,
    weights,
    updateWeights,
    notifications,
    toggleNotification,
    feedback,
  } = useRadar();

  const learned = Array.from(
    feedback
      .reduce((map, entry) => {
        const label = learnFromFeedback(entry.reason).adjustment;
        map.set(label, (map.get(label) ?? 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  ).map(([label, count]) => ({
    label,
    evidence: `${count} ${count === 1 ? "role" : "roles"} of feedback`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile & search settings"
        description="Everything the radar uses to find, filter and rank roles for you."
      />

      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5 space-y-5">
          <CandidateProfilePanel />
          <CvVersionsPanel />
          <WorkAuthorisationPanel />


          <section className="surface p-5">
            <SectionHeading title="Learned preferences" hint="Built from the feedback you've given on roles" />
            {learned.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing learned yet. Use the feedback buttons on a role and your ranking adjusts here.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {learned.map((item) => (
                  <li key={item.label} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.evidence}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="search" className="mt-5 space-y-5">
          <TargetingPanel />


          <section className="surface space-y-5 p-5">
            <SectionHeading title="Thresholds" hint="Roles below these never reach your Today page" />
            {[
              { label: "Minimum CV match", key: "minMatchScore" as const, value: preferences.minMatchScore },
              {
                label: "Minimum opportunity score",
                key: "minOpportunityScore" as const,
                value: preferences.minOpportunityScore,
              },
              {
                label: "Minimum sponsorship confidence",
                key: "minSponsorshipConfidence" as const,
                value: preferences.minSponsorshipConfidence,
              },
              { label: "Job age limit (days)", key: "jobAgeDays" as const, value: preferences.jobAgeDays },
            ].map((row) => (
              <div key={row.key}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <Label>{row.label}</Label>
                  <span className="font-medium tabular-nums">{row.value}</span>
                </div>
                <Slider
                  value={[row.value]}
                  min={row.key === "jobAgeDays" ? 1 : 0}
                  max={row.key === "jobAgeDays" ? 30 : 100}
                  step={row.key === "jobAgeDays" ? 1 : 5}
                  onValueChange={([v]) => updatePreferences({ [row.key]: v ?? row.value })}
                />
              </div>
            ))}
          </section>

          <section className="surface space-y-3 p-5">
            <SectionHeading title="Eligibility rules" hint="Cheap filters applied before any AI analysis" />
            {[
              {
                id: "citizenship",
                label: "Reject roles requiring UK citizenship",
                value: preferences.rejectCitizenshipRequired,
                key: "rejectCitizenshipRequired" as const,
              },
              {
                id: "clearance",
                label: "Reject roles requiring security clearance",
                value: preferences.rejectSecurityClearance,
                key: "rejectSecurityClearance" as const,
              },
              {
                id: "seniority",
                label: "Reject roles far above my seniority",
                value: preferences.rejectAboveSeniority,
                key: "rejectAboveSeniority" as const,
              },
            ].map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border border-border bg-elevated px-3 py-2.5"
              >
                <Label htmlFor={rule.id} className="text-sm">
                  {rule.label}
                </Label>
                <Switch
                  id={rule.id}
                  checked={rule.value}
                  onCheckedChange={(v) => updatePreferences({ [rule.key]: v })}
                />
              </div>
            ))}
          </section>
        </TabsContent>

        <TabsContent value="scoring" className="mt-5">
          <section className="surface space-y-5 p-5">
            <SectionHeading title="Opportunity score weighting" hint="Weights are relative and applied instantly" />
            {(
              [
                ["CV match", "cvMatch"],
                ["Sponsorship fit", "sponsorshipFit"],
                ["Seniority fit", "seniorityFit"],
                ["Location fit", "locationFit"],
                ["Recency", "recency"],
                ["Company priority", "companyPriority"],
                ["Salary / work style fit", "salaryFit"],
              ] as const
            ).map(([label, key]) => (
              <div key={key}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <Label>{label}</Label>
                  <span className="font-medium tabular-nums">{weights[key]}%</span>
                </div>
                <Slider
                  value={[weights[key]]}
                  min={0}
                  max={60}
                  step={5}
                  onValueChange={([v]) => updateWeights({ [key]: v ?? weights[key] })}
                />
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              90+ Apply ASAP · 80–89 Strong match · 70–79 Review · 60–69 Low priority · below 60 hidden.
            </p>
          </section>
        </TabsContent>

        <TabsContent value="notifications" className="mt-5 space-y-5">
          <EmailDigestPanel />
          <section className="surface divide-y divide-border">
            {notifications.map((n) => (
              <div key={n.category} className="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-medium">{n.category}</p>
                  <p className="text-xs text-muted-foreground">Channels: {n.channels.join(", ")}</p>
                </div>
                <Switch
                  checked={n.enabled}
                  onCheckedChange={() => toggleNotification(n.category)}
                  aria-label={`Toggle ${n.category}`}
                />
              </div>
            ))}
            <p className="px-5 py-4 text-sm text-muted-foreground">
              Delivery channels (email, browser, Telegram, Slack, mobile push) are not connected yet — your
              preferences are stored and will apply as soon as they are.
            </p>
          </section>
        </TabsContent>

        <TabsContent value="automation" className="mt-5 space-y-5">
          <CompanyMonitorPanel />
          <JobSourcesPanel />
          <AutomationStatusPanel />
          <SponsorRegisterPanel />
          <IntelligencePanel />
          <SystemHealthPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
