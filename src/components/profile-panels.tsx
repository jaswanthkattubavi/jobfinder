import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Plus, RefreshCw, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { SkillChip } from "@/components/badges";
import { SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { dbReplaceRoles, dbUpdateSeniority } from "@/lib/api/radar-api";
import type { CvExtraction } from "@/lib/services/cv-parse.server";
import { useRadar } from "@/lib/store";
import type { RemoteStatus, RoleCategory, Seniority } from "@/lib/types";

/* --------------------------------------------------------------- primitives */

const SKILL_CATEGORIES = ["Language", "Framework", "Cloud", "Database", "ML", "Data", "General"];

const ROLE_CATEGORIES: RoleCategory[] = [
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

const SENIORITY_LEVELS: Seniority[] = ["Graduate", "Junior", "Associate", "Mid"];
const REMOTE_OPTIONS: RemoteStatus[] = ["Remote", "Hybrid", "On-site"];

/** A small add/remove list editor used for titles, locations and similar. */
function ListEditor({
  label,
  items,
  placeholder,
  tone,
  onChange,
}: {
  label: string;
  items: string[];
  placeholder: string;
  tone?: "match" | "miss";
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length === 0 && <span className="text-sm text-muted-foreground">None yet.</span>}
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1">
            <SkillChip tone={tone ?? "muted"}>{item}</SkillChip>
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i !== item))}
              className="text-muted-foreground transition-colors hover:text-destructive"
              aria-label={`Remove ${item}`}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- candidate profile */

export function CandidateProfilePanel() {
  const { profile, saveProfile, recalculateRanking } = useRadar();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: profile.name,
    headline: profile.headline,
    summary: profile.summary,
    education: profile.education,
    yearsExperience: String(profile.yearsExperience),
  });

  useEffect(() => {
    if (!editing) {
      setForm({
        name: profile.name,
        headline: profile.headline,
        summary: profile.summary,
        education: profile.education,
        yearsExperience: String(profile.yearsExperience),
      });
    }
  }, [editing, profile]);

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({
        name: form.name.trim(),
        headline: form.headline.trim(),
        summary: form.summary.trim(),
        education: form.education.trim(),
        yearsExperience: Number(form.yearsExperience) || 0,
      });
      const result = await recalculateRanking();
      toast.success("Profile saved", { description: result.note });
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading title="Candidate profile" />
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={form.name}
            disabled={!editing}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            value={form.headline}
            disabled={!editing}
            onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="education">Education</Label>
          <Input
            id="education"
            value={form.education}
            disabled={!editing}
            onChange={(e) => setForm((f) => ({ ...f, education: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="experience">Years of experience</Label>
          <Input
            id="experience"
            type="number"
            step="0.5"
            min="0"
            value={form.yearsExperience}
            disabled={!editing}
            onChange={(e) => setForm((f) => ({ ...f, yearsExperience: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            rows={3}
            value={form.summary}
            disabled={!editing}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
          />
        </div>
      </div>

      {editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save changes
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      )}

      <Separator className="my-5" />
      <SkillsEditor />
    </section>
  );
}

/* ------------------------------------------------------------------- skills */

function SkillsEditor() {
  const { skillDetails, addSkill, removeSkill, recalculateRanking } = useRadar();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("General");
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof skillDetails>();
    for (const skill of skillDetails) {
      map.set(skill.category, [...(map.get(skill.category) ?? []), skill]);
    }
    return SKILL_CATEGORIES.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c) ?? [] }));
  }, [skillDetails]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addSkill(name, category);
      setName("");
      const result = await recalculateRanking();
      toast.success("Skill added", { description: result.note });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add that skill.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await removeSkill(id);
      await recalculateRanking();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove that skill.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Skills</p>
        <p className="text-xs text-muted-foreground">
          Skills read from a CV are marked “from CV”. Anything you add by hand is kept even when a CV is
          read again.
        </p>
      </div>

      {grouped.length === 0 && (
        <p className="text-sm text-muted-foreground">No skills stored yet. Add one below or read a CV.</p>
      )}

      {grouped.map((group) => (
        <div key={group.category}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{group.category}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.items.map((skill) => (
              <span key={skill.id} className="inline-flex items-center gap-1">
                <SkillChip tone={skill.source === "user" ? "match" : "muted"}>
                  {skill.name}
                  {skill.source === "cv" ? " · from CV" : ""}
                </SkillChip>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(skill.id)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Remove ${skill.name}`}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="new-skill">Add a skill</Label>
          <Input
            id="new-skill"
            value={name}
            placeholder="e.g. PyTorch"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKILL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void add()} disabled={busy}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- CV */

const EXTRACTION_GROUPS: Array<{ key: keyof CvExtraction; label: string; category: string }> = [
  { key: "programmingLanguages", label: "Languages", category: "Language" },
  { key: "frameworks", label: "Frameworks", category: "Framework" },
  { key: "cloud", label: "Cloud", category: "Cloud" },
  { key: "databases", label: "Databases", category: "Database" },
  { key: "mlAi", label: "AI / ML", category: "ML" },
  { key: "dataTools", label: "Data tools", category: "Data" },
  { key: "skills", label: "Other skills", category: "General" },
];

export function CvVersionsPanel() {
  const { cvVersions, uploadCv, replaceCvFile, renameCv, setPrimaryCv, deleteCv, cvDownloadUrl, readCv } =
    useRadar();
  const uploadRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState<{ cvId: string; extraction: CvExtraction } | null>(null);

  const runRead = async (cvId: string) => {
    setBusyId(cvId);
    try {
      const result = await readCv(cvId);
      if (!result.ok || !result.extraction) {
        toast.error("We couldn't read that CV", { description: result.error ?? undefined });
        return;
      }
      setReview({ cvId, extraction: result.extraction });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reading that CV failed.");
    } finally {
      setBusyId(null);
    }
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const name = file.name.replace(/\.[^.]+$/, "");
      const id = await uploadCv(file, name);
      toast.success("CV uploaded", { description: "Stored privately. Reading it now…" });
      await runRead(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That upload didn't work.");
    } finally {
      setUploading(false);
    }
  };

  const onReplace = async (file: File) => {
    if (!replaceTarget) return;
    const id = replaceTarget;
    setBusyId(id);
    try {
      await replaceCvFile(id, file);
      toast.success("CV replaced", { description: "Applications that reference it are unchanged." });
      await runRead(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That replacement didn't work.");
    } finally {
      setBusyId(null);
      setReplaceTarget(null);
    }
  };

  const download = async (id: string) => {
    try {
      const url = await cvDownloadUrl(id);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't open that file.");
    }
  };

  const rename = async (id: string, current: string) => {
    const next = window.prompt("Name for this CV version", current);
    if (!next || next.trim() === current) return;
    try {
      await renameCv(id, next.trim());
      toast.success("Renamed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't rename that CV.");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this CV version? The file is removed from private storage.")) return;
    setBusyId(id);
    try {
      await deleteCv(id);
      toast.success("CV deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete that CV.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="surface p-5">
      <SectionHeading
        title="CV versions"
        hint="Stored privately — only you can open them, through a short-lived link"
      />

      {cvVersions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No CV uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {cvVersions.map((cv) => (
            <li key={cv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {cv.name}
                  {cv.isPrimary && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      <Star className="size-3" aria-hidden />
                      Primary
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Uploaded {new Date(cv.uploadedAt).toLocaleDateString("en-GB")} ·{" "}
                  {cv.parseStatus === "parsed"
                    ? `read ${cv.parsedAt ? new Date(cv.parsedAt).toLocaleDateString("en-GB") : ""}`
                    : cv.parseStatus === "failed"
                      ? `could not be read — ${cv.parseError ?? "unknown reason"}`
                      : "not read yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === cv.id}
                  onClick={() => void runRead(cv.id)}
                >
                  {busyId === cv.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  {cv.parseStatus === "parsed" ? "Read again" : "Read CV"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void download(cv.id)}>
                  <Download className="size-4" aria-hidden />
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReplaceTarget(cv.id);
                    replaceRef.current?.click();
                  }}
                >
                  <RefreshCw className="size-4" aria-hidden />
                  Replace file
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void rename(cv.id, cv.name)}>
                  Rename
                </Button>
                {!cv.isPrimary && (
                  <Button size="sm" variant="ghost" onClick={() => void setPrimaryCv(cv.id)}>
                    <Star className="size-4" aria-hidden />
                    Make primary
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === cv.id}
                  onClick={() => void remove(cv.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-medium">Upload a CV</p>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF or Word (.docx), up to 10 MB. It is read on the server and you review everything found
          before anything is saved to your profile.
        </p>
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => uploadRef.current?.click()}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          Upload CV
        </Button>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onUpload(file);
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onReplace(file);
        }}
      />

      {review && (
        <CvReviewDialog
          cvId={review.cvId}
          extraction={review.extraction}
          onClose={() => setReview(null)}
        />
      )}
    </section>
  );
}

function CvReviewDialog({
  cvId,
  extraction,
  onClose,
}: {
  cvId: string;
  extraction: CvExtraction;
  onClose: () => void;
}) {
  const { applyCvExtraction } = useRadar();
  const [groups, setGroups] = useState(() =>
    EXTRACTION_GROUPS.map((g) => ({
      ...g,
      items: (extraction[g.key] as string[] | null) ?? [],
    })),
  );
  const [headline, setHeadline] = useState(extraction.headline ?? "");
  const [summary, setSummary] = useState(extraction.summary ?? "");
  const [education, setEducation] = useState(extraction.education.join("; "));
  const [years, setYears] = useState(
    extraction.yearsExperience === null ? "" : String(extraction.yearsExperience),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const skills = groups.flatMap((g) => g.items.map((name) => ({ name, category: g.category })));
      const result = await applyCvExtraction({
        cvId,
        headline: headline.trim() || null,
        summary: summary.trim() || null,
        education: education.trim() || null,
        yearsExperience: years === "" ? null : Number(years),
        certifications: extraction.certifications,
        skills,
      });
      toast.success("Profile updated from your CV", { description: result.note });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save those details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review what we read from your CV</DialogTitle>
          <DialogDescription>
            Nothing is saved until you confirm. Remove anything that is wrong — only what you keep is
            stored, and your hand-added skills are untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cv-headline">Headline</Label>
              <Input id="cv-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-years">Years of experience</Label>
              <Input
                id="cv-years"
                type="number"
                step="0.5"
                min="0"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cv-education">Education</Label>
              <Input id="cv-education" value={education} onChange={(e) => setEducation(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cv-summary">Summary</Label>
              <Textarea
                id="cv-summary"
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
          </div>

          {groups.map((group, index) => (
            <div key={group.label}>
              <ListEditor
                label={group.label}
                items={group.items}
                placeholder="Add one we missed"
                onChange={(next) =>
                  setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, items: next } : g)))
                }
              />
            </div>
          ))}

          {extraction.experience.length > 0 && (
            <div>
              <p className="text-sm font-medium">Experience found</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {extraction.experience.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save to my profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------- work authorisation */

const AUTH_OPTIONS = [
  "Not set",
  "British citizen",
  "Indefinite leave to remain",
  "Skilled Worker visa",
  "Graduate visa",
  "Student visa",
  "Dependant visa",
  "Youth Mobility visa",
  "EU Settlement Scheme",
  "Sponsorship required",
  "Other",
];

export function WorkAuthorisationPanel() {
  const { profile, saveProfile, recalculateRanking } = useRadar();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const initial = () => ({
    workAuthorization: profile.workAuthorization || "Not set",
    visaType: profile.visaType || "Not set",
    sponsorshipRequiredNow: profile.sponsorshipRequiredNow,
    sponsorshipRequiredLater: profile.sponsorshipRequiredLater,
    visaExpiry: profile.visaExpiry ?? "",
    workAuthNotes: profile.workAuthNotes ?? "",
  });
  const [form, setForm] = useState(initial);

  useEffect(() => {
    if (!editing) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, profile]);

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({
        workAuthorization: form.workAuthorization,
        visaType: form.visaType,
        sponsorshipRequiredNow: form.sponsorshipRequiredNow,
        sponsorshipRequiredLater: form.sponsorshipRequiredLater,
        visaExpiry: form.visaExpiry || null,
        workAuthNotes: form.workAuthNotes,
      });
      const result = await recalculateRanking();
      toast.success("Work authorisation saved", {
        description: `Sponsorship compatibility re-checked — ${result.note}`,
      });
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading title="Work authorisation" hint="Kept private — never shown publicly" />
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Current right to work</Label>
          <Select
            value={form.workAuthorization}
            disabled={!editing}
            onValueChange={(v) => setForm((f) => ({ ...f, workAuthorization: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTH_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visa-type">Visa type</Label>
          <Input
            id="visa-type"
            value={form.visaType}
            disabled={!editing}
            onChange={(e) => setForm((f) => ({ ...f, visaType: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visa-expiry">Right-to-work expiry</Label>
          <Input
            id="visa-expiry"
            type="date"
            value={form.visaExpiry}
            disabled={!editing}
            onChange={(e) => setForm((f) => ({ ...f, visaExpiry: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="auth-notes">Notes</Label>
          <Textarea
            id="auth-notes"
            rows={2}
            placeholder="Anything an employer would need to know about your right to work."
            value={form.workAuthNotes}
            disabled={!editing}
            onChange={(e) => setForm((f) => ({ ...f, workAuthNotes: e.target.value }))}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {(
          [
            ["Sponsorship needed now", "sponsorshipRequiredNow"],
            ["Sponsorship needed later", "sponsorshipRequiredLater"],
          ] as const
        ).map(([label, key]) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-lg border border-border bg-elevated px-3 py-2.5"
          >
            <Label className="text-sm">{label}</Label>
            <Switch
              checked={form[key]}
              disabled={!editing}
              onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              aria-label={label}
            />
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save changes
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Changing this re-checks sponsorship compatibility and re-ranks your existing roles. It never
        re-searches job boards and never re-reads job adverts.
      </p>
    </section>
  );
}

/* --------------------------------------------------------- search targeting */

export function TargetingPanel() {
  const { profile, preferences, updatePreferences, reload, userId, recalculateRanking } = useRadar();
  const [savingRoles, setSavingRoles] = useState(false);

  const toggleRole = async (role: RoleCategory) => {
    const next = profile.targetRoles.includes(role)
      ? profile.targetRoles.filter((r) => r !== role)
      : [...profile.targetRoles, role];
    if (next.length === 0) {
      toast.error("Keep at least one role type so the radar knows what to look for.");
      return;
    }
    setSavingRoles(true);
    try {
      await dbReplaceRoles(userId, next);
      reload();
      const result = await recalculateRanking();
      toast.success("Role types saved", { description: result.note });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your role types.");
    } finally {
      setSavingRoles(false);
    }
  };

  const toggleSeniority = async (level: Seniority) => {
    const next = profile.preferredSeniority.includes(level)
      ? profile.preferredSeniority.filter((l) => l !== level)
      : [...profile.preferredSeniority, level];
    try {
      await dbUpdateSeniority(userId, next);
      reload();
      await recalculateRanking();
      toast.success("Seniority levels saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that.");
    }
  };

  const toggleRemote = (option: RemoteStatus) => {
    const next = preferences.remotePreference.includes(option)
      ? preferences.remotePreference.filter((r) => r !== option)
      : [...preferences.remotePreference, option];
    updatePreferences({ remotePreference: next });
  };

  return (
    <>
      <section className="surface p-5">
        <SectionHeading title="Target roles" hint="Everything the radar is allowed to surface" />
        <div className="flex flex-wrap gap-1.5">
          {ROLE_CATEGORIES.map((role) => {
            const on = profile.targetRoles.includes(role);
            return (
              <button
                key={role}
                type="button"
                disabled={savingRoles}
                onClick={() => void toggleRole(role)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  on
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={on}
              >
                {role}
              </button>
            );
          })}
        </div>

        <Separator className="my-4" />
        <div className="space-y-4">
          <ListEditor
            label="Preferred titles"
            items={preferences.targetTitles}
            tone="match"
            placeholder="e.g. Machine Learning Engineer"
            onChange={(next) => updatePreferences({ targetTitles: next })}
          />
          <ListEditor
            label="Excluded titles"
            items={preferences.excludedTitles}
            tone="miss"
            placeholder="e.g. Sales Engineer"
            onChange={(next) => updatePreferences({ excludedTitles: next })}
          />
          <ListEditor
            label="Preferred locations"
            items={preferences.locations}
            placeholder="e.g. London"
            onChange={(next) => updatePreferences({ locations: next })}
          />
          <ListEditor
            label="Excluded companies"
            items={preferences.excludedCompanies}
            tone="miss"
            placeholder="Company name"
            onChange={(next) => updatePreferences({ excludedCompanies: next })}
          />
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <SectionHeading title="Work style, salary and seniority" />
        <div>
          <p className="text-sm font-medium">Working pattern</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REMOTE_OPTIONS.map((option) => {
              const on = preferences.remotePreference.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleRemote(option)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    on
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={on}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Seniority levels accepted</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SENIORITY_LEVELS.map((level) => {
              const on = profile.preferredSeniority.includes(level);
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => void toggleSeniority(level)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    on
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={on}
                >
                  {level}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="salary-min">Minimum salary (£)</Label>
          <Input
            id="salary-min"
            type="number"
            step="1000"
            min="0"
            defaultValue={preferences.salaryMin}
            onBlur={(e) => {
              const value = Number(e.target.value) || 0;
              if (value !== preferences.salaryMin) updatePreferences({ salaryMin: value });
            }}
          />
        </div>
      </section>
    </>
  );
}
