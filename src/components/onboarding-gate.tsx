import { useState } from "react";
import { Loader2, Radar, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  dbReplaceRoles,
  dbReplaceSkills,
  dbUpdatePreferences,
  dbUpdateProfile,
  dbUploadCv,
} from "@/lib/api/radar-api";
import { useRadar } from "@/lib/store";
import type { RoleCategory } from "@/lib/types";

const roleOptions: RoleCategory[] = [
  "Data Science",
  "Machine Learning",
  "AI Engineering",
  "MLOps",
  "Data Engineering",
  "Software Engineering",
  "Backend Engineering",
  "Cloud Engineering",
  "Solutions Engineering",
  "Solutions Architecture",
  "AI Product",
  "Data Analytics",
  "Platform Engineering",
];

const locationOptions = [
  "London",
  "Manchester",
  "Birmingham",
  "Bristol",
  "Leeds",
  "Edinburgh",
  "Cambridge",
  "Reading",
  "Remote UK",
];

/**
 * Onboarding. Every answer is written straight to the database, so a half-finished
 * onboarding can be resumed on any device — nothing lives only in the browser.
 */
export function OnboardingGate() {
  const { profile, completeOnboarding, userId } = useRadar();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(profile.name === "there" ? "" : profile.name);
  const [headline, setHeadline] = useState(profile.headline);
  const [years, setYears] = useState(String(profile.yearsExperience || ""));
  const [education, setEducation] = useState(profile.education);
  const [roles, setRoles] = useState<string[]>(profile.targetRoles);
  const [skills, setSkills] = useState(profile.skills.join(", "));
  const [locations, setLocations] = useState<string[]>(profile.preferredLocations);
  const [salary, setSalary] = useState(String(profile.salaryExpectation.min || ""));
  const [sponsorNow, setSponsorNow] = useState(profile.sponsorshipRequiredNow);
  const [visa, setVisa] = useState(profile.visaType === "Not set" ? "" : profile.visaType);
  const [cvFile, setCvFile] = useState<File | null>(null);

  const toggle = (list: string[], value: string, set: (next: string[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function saveStep() {
    setBusy(true);
    try {
      if (step === 0) {
        await dbUpdateProfile(userId, {
          name: name.trim() || "there",
          headline,
          yearsExperience: Number(years) || 0,
          education,
        });
      } else if (step === 1) {
        await dbReplaceRoles(userId, roles);
        await dbReplaceSkills(
          userId,
          skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => ({ name: s })),
        );
      } else if (step === 2) {
        await dbUpdatePreferences(userId, {
          locations,
          salaryMin: Number(salary) || 0,
        });
        await dbUpdateProfile(userId, {
          sponsorshipRequiredNow: sponsorNow,
          visaType: visa || "Not set",
          workAuthorization: sponsorNow ? "Requires sponsorship" : "Right to work in the UK",
        });
      } else {
        if (cvFile) await dbUploadCv(userId, cvFile, cvFile.name.replace(/\.[^.]+$/, ""));
        await completeOnboarding();
        return;
      }
      setStep((s) => s + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const canContinue =
    step === 0 ? name.trim().length > 0 : step === 1 ? roles.length > 0 : true;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <span className="radar-glow flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Radar className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Job Radar AI</span>
        </div>

        <div className="surface rounded-xl border p-6">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Step {step + 1} of 4
          </p>

          {step === 0 && (
            <div className="mt-3 space-y-4">
              <h1 className="font-display text-xl font-semibold tracking-tight">About you</h1>
              <div className="space-y-1.5">
                <Label htmlFor="ob-name">What should we call you?</Label>
                <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-headline">One-line headline</Label>
                <Input
                  id="ob-headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Graduate data scientist, Python & cloud"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-years">Years of experience</Label>
                  <Input
                    id="ob-years"
                    type="number"
                    min={0}
                    step={0.5}
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-education">Highest qualification</Label>
                  <Input
                    id="ob-education"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    placeholder="MSc Data Science"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-3 space-y-4">
              <h1 className="font-display text-xl font-semibold tracking-tight">What to watch for</h1>
              <div className="space-y-2">
                <Label>Target roles</Label>
                <div className="flex flex-wrap gap-2">
                  {roleOptions.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggle(roles, role, setRoles)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        roles.includes(role)
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-skills">Your skills (comma separated)</Label>
                <Textarea
                  id="ob-skills"
                  rows={3}
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="Python, SQL, PyTorch, AWS, Docker"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-3 space-y-4">
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Location, pay & sponsorship
              </h1>
              <div className="space-y-2">
                <Label>Where would you work?</Label>
                <div className="flex flex-wrap gap-2">
                  {locationOptions.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => toggle(locations, loc, setLocations)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        locations.includes(loc)
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-salary">Minimum salary you'd accept (£)</Label>
                <Input
                  id="ob-salary"
                  type="number"
                  min={0}
                  step={1000}
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="38000"
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">I need visa sponsorship</p>
                  <p className="text-xs text-muted-foreground">
                    Used to weight roles — sponsorship is always shown with evidence, never as a guarantee.
                  </p>
                </div>
                <Switch checked={sponsorNow} onCheckedChange={setSponsorNow} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-visa">Current visa or status (optional)</Label>
                <Input
                  id="ob-visa"
                  value={visa}
                  onChange={(e) => setVisa(e.target.value)}
                  placeholder="Graduate Route"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-3 space-y-4">
              <h1 className="font-display text-xl font-semibold tracking-tight">Add your CV</h1>
              <p className="text-sm text-muted-foreground">
                Optional, and private to you. PDF or Word, up to 10 MB. Automatic CV reading isn't
                connected yet, so your skills above are what scoring uses for now.
              </p>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:bg-accent">
                <Upload className="h-4 w-4" />
                {cvFile ? cvFile.name : "Choose a file"}
                <input
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || busy}
            >
              Back
            </Button>
            <Button onClick={saveStep} disabled={busy || !canContinue}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {step === 3 ? "Finish setup" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
