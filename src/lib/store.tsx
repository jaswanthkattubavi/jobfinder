import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  dbAddSkill,
  dbCompleteOnboarding,
  dbCvSignedUrl,
  dbDeleteCv,
  dbDeleteSkill,
  dbMarkApplied,
  dbMarkNotificationsRead,
  dbMoveStage,
  dbRenameCv,
  dbReplaceCvFile,
  dbSaveJob,
  dbSetFeedback,
  dbSetPrimaryCv,
  dbToggleFollow,
  dbToggleNotification,
  dbUnsaveJob,
  dbUpdateApplication,
  dbUpdatePreferences,
  dbUpdateProfile,
  dbUpdateWeights,
  dbUploadCvReturningId,
  loadSnapshot,
  type ApplicationEventItem,
  type CvVersionItem,
  type NotificationItem,
  type RadarSnapshot,
} from "./api/radar-api";
import {
  applyCvExtractionFn,
  parseCvFn,
  recalculateMatchesFn,
  type ApplyCvInput,
  type CvParseResult,
  type RecalcResult,
} from "./services/cv.functions";
import { learnFromFeedback } from "./services/pipeline";
import { runScanNow } from "./services/scan-client";
import { calculateOpportunityScore, classifyOpportunity, filterJob } from "./services/scoring";
import type {
  Application,
  ApplicationStage,
  CandidateProfile,
  CandidateSkill,
  Company,
  FeedbackReason,
  Job,
  NotificationPreference,
  SavedJob,
  ScanRun,
  ScoringWeights,
  SearchPreferences,
} from "./types";

interface RadarState {
  loading: boolean;
  error: string | null;
  reload: () => void;
  userId: string;
  jobs: Job[];
  companies: Company[];
  saved: SavedJob[];
  applications: Application[];
  applicationEvents: ApplicationEventItem[];
  scans: ScanRun[];
  profile: CandidateProfile;
  preferences: SearchPreferences;
  weights: ScoringWeights;
  notifications: NotificationPreference[];
  alerts: NotificationItem[];
  unreadAlerts: number;
  cvVersions: CvVersionItem[];
  skillDetails: CandidateSkill[];
  onboardingCompleted: boolean;
  hasDemoData: boolean;
  ignored: string[];
  feedback: Array<{ jobId: string; reason: FeedbackReason }>;
  scanning: boolean;
  visibleJobs: Job[];
  companyById: (id: string) => Company;
  jobById: (id: string) => Job | undefined;
  isSaved: (id: string) => boolean;
  applicationForJob: (id: string) => Application | undefined;
  scoreOf: (job: Job) => number;
  priorityOf: (job: Job) => ReturnType<typeof classifyOpportunity>;
  filterOf: (job: Job) => ReturnType<typeof filterJob>;
  saveJob: (id: string, folder?: string) => void;
  unsaveJob: (id: string) => void;
  ignoreJob: (id: string) => void;
  markApplied: (id: string, details?: Partial<Application>) => void;
  moveStage: (applicationId: string, stage: ApplicationStage) => void;
  updateApplication: (applicationId: string, patch: Partial<Application>) => void;
  toggleFollow: (companyId: string) => void;
  giveFeedback: (jobId: string, reason: FeedbackReason) => void;
  updatePreferences: (patch: Partial<SearchPreferences>) => void;
  updateProfile: (patch: Partial<CandidateProfile>) => void;
  updateWeights: (patch: Partial<ScoringWeights>) => void;
  toggleNotification: (category: string) => void;
  markAlertsRead: () => void;
  completeOnboarding: () => Promise<void>;
  runScan: () => Promise<void>;
  /** Awaited profile save (explicit Save buttons), then refresh. */
  saveProfile: (patch: Partial<CandidateProfile>) => Promise<void>;
  uploadCv: (file: File, name: string) => Promise<string>;
  replaceCvFile: (id: string, file: File) => Promise<void>;
  renameCv: (id: string, name: string) => Promise<void>;
  setPrimaryCv: (id: string) => Promise<void>;
  deleteCv: (id: string) => Promise<void>;
  cvDownloadUrl: (id: string) => Promise<string>;
  readCv: (id: string) => Promise<CvParseResult>;
  applyCvExtraction: (input: ApplyCvInput) => Promise<RecalcResult>;
  addSkill: (name: string, category: string) => Promise<void>;
  removeSkill: (id: string) => Promise<void>;
  recalculateRanking: () => Promise<RecalcResult>;
}

const RadarContext = createContext<RadarState | null>(null);

const emptyProfile: CandidateProfile = {
  name: "there",
  headline: "",
  summary: "",
  targetRoles: [],
  preferredLocations: [],
  remotePreference: [],
  salaryExpectation: { min: 0, max: 0 },
  industries: [],
  preferredSeniority: [],
  skills: [],
  languages: [],
  cloud: [],
  databases: [],
  mlSkills: [],
  yearsExperience: 0,
  education: "",
  certifications: [],
  workAuthorization: "Not set",
  visaType: "Not set",
  sponsorshipRequiredNow: false,
  sponsorshipRequiredLater: false,
  cvVersions: [],
};

const emptyPreferences: SearchPreferences = {
  targetTitles: [],
  excludedTitles: [],
  locations: [],
  remotePreference: [],
  salaryMin: 0,
  jobAgeDays: 7,
  minMatchScore: 0,
  minOpportunityScore: 0,
  minSponsorshipConfidence: 0,
  excludedIndustries: [],
  excludedCompanies: [],
  rejectCitizenshipRequired: false,
  rejectSecurityClearance: false,
  rejectAboveSeniority: false,
};

const emptyWeights: ScoringWeights = {
  cvMatch: 40,
  sponsorshipFit: 20,
  seniorityFit: 10,
  locationFit: 10,
  recency: 10,
  companyPriority: 5,
  salaryFit: 5,
};

const emptySnapshot: RadarSnapshot = {
  jobs: [],
  companies: [],
  saved: [],
  applications: [],
  applicationEvents: [],
  scans: [],
  profile: emptyProfile,
  preferences: emptyPreferences,
  weights: emptyWeights,
  notifications: [],
  notificationPreferences: [],
  ignored: [],
  feedback: [],
  cvVersions: [],
  skillDetails: [],
  onboardingCompleted: false,
  hasDemoData: false,
};

export function RadarProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const query = useQuery({
    queryKey: ["radar", userId],
    queryFn: () => loadSnapshot(userId),
    staleTime: 30_000,
  });

  const [snap, setSnap] = useState<RadarSnapshot>(emptySnapshot);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (query.data) setSnap(query.data);
  }, [query.data]);

  const patch = useCallback(
    (updater: (prev: RadarSnapshot) => RadarSnapshot) => setSnap((prev) => updater(prev)),
    [],
  );

  const persist = useCallback(
    async (action: () => Promise<unknown>, failureMessage: string) => {
      try {
        await action();
      } catch (error) {
        console.error(error);
        toast.error(failureMessage);
        void query.refetch();
      }
    },
    [query],
  );

  const companyById = useCallback(
    (id: string) =>
      snap.companies.find((c) => c.id === id) ??
      ({
        id,
        name: "Unknown company",
        logo: "??",
        industry: "—",
        size: "—",
        headquarters: "—",
        ukLocations: [],
        sponsorshipStatus: "Unclear",
        sponsorshipConfidence: 0,
        sponsorEvidence: [],
        openMatchingRoles: 0,
        previousApplications: 0,
        averageMatchScore: 0,
        priority: "Normal",
        followed: false,
        tags: [],
      } satisfies Company),
    [snap.companies],
  );

  const scoreOf = useCallback(
    (job: Job) =>
      job.opportunityScore > 0
        ? job.opportunityScore
        : calculateOpportunityScore({
            job,
            profile: snap.profile,
            weights: snap.weights,
            companyPriority: companyById(job.companyId).priority,
          }),
    [companyById, snap.profile, snap.weights],
  );

  const filterOf = useCallback((job: Job) => filterJob(job, snap.preferences), [snap.preferences]);

  const visibleJobs = useMemo(
    () =>
      snap.jobs
        .filter((j) => !snap.ignored.includes(j.id))
        .filter((j) => filterOf(j).passed)
        .sort((a, b) => scoreOf(b) - scoreOf(a)),
    [snap.jobs, snap.ignored, filterOf, scoreOf],
  );

  const value: RadarState = {
    loading: query.isPending,
    error: query.error ? (query.error as Error).message : null,
    reload: () => void query.refetch(),
    userId,
    jobs: snap.jobs,
    companies: snap.companies,
    saved: snap.saved,
    applications: snap.applications,
    applicationEvents: snap.applicationEvents,
    scans: snap.scans,
    profile: snap.profile,
    preferences: snap.preferences,
    weights: snap.weights,
    notifications: snap.notificationPreferences,
    alerts: snap.notifications,
    unreadAlerts: snap.notifications.filter((n) => !n.readAt).length,
    cvVersions: snap.cvVersions,
    skillDetails: snap.skillDetails,
    onboardingCompleted: snap.onboardingCompleted,
    hasDemoData: snap.hasDemoData,
    ignored: snap.ignored,
    feedback: snap.feedback,
    scanning,
    visibleJobs,
    companyById,
    jobById: (id) => snap.jobs.find((j) => j.id === id),
    isSaved: (id) => snap.saved.some((s) => s.jobId === id),
    applicationForJob: (id) => snap.applications.find((a) => a.jobId === id),
    scoreOf,
    priorityOf: (job) => classifyOpportunity(scoreOf(job)),
    filterOf,

    saveJob: (id, folder = "Apply Tonight") => {
      patch((prev) => ({
        ...prev,
        saved: prev.saved.some((s) => s.jobId === id)
          ? prev.saved.map((s) => (s.jobId === id ? { ...s, folder } : s))
          : [{ jobId: id, folder, savedOn: new Date().toISOString() }, ...prev.saved],
      }));
      toast.success(`Saved to ${folder}`);
      void persist(() => dbSaveJob(userId, id, folder), "Couldn't save that role.");
    },
    unsaveJob: (id) => {
      patch((prev) => ({ ...prev, saved: prev.saved.filter((s) => s.jobId !== id) }));
      toast("Removed from saved");
      void persist(() => dbUnsaveJob(userId, id), "Couldn't remove that role.");
    },
    ignoreJob: (id) => {
      patch((prev) => ({ ...prev, ignored: [...prev.ignored, id] }));
      toast("Hidden from your feed");
      void persist(
        () => dbSetFeedback(userId, id, "Not Interested"),
        "Couldn't hide that role.",
      );
    },
    markApplied: (id, details) => {
      const now = new Date().toISOString();
      patch((prev) => ({
        ...prev,
        applications: prev.applications.some((a) => a.jobId === id)
          ? prev.applications.map((a) =>
              a.jobId === id ? { ...a, stage: "Applied", appliedOn: now, ...details } : a,
            )
          : [
              {
                id: `pending-${id}`,
                jobId: id,
                stage: "Applied",
                appliedOn: now,
                needsFollowUp: false,
                ...details,
              },
              ...prev.applications,
            ],
      }));
      toast.success("Moved to Applications");
      void persist(async () => {
        await dbMarkApplied(userId, id, details ?? {});
        await query.refetch();
      }, "Couldn't record that application.");
    },
    moveStage: (applicationId, stage) => {
      const previous = snap.applications.find((a) => a.id === applicationId)?.stage ?? "Applied";
      patch((prev) => ({
        ...prev,
        applications: prev.applications.map((a) => (a.id === applicationId ? { ...a, stage } : a)),
      }));
      void persist(
        () => dbMoveStage(userId, applicationId, previous, stage),
        "Couldn't move that application.",
      );
    },
    updateApplication: (applicationId, appPatch) => {
      patch((prev) => ({
        ...prev,
        applications: prev.applications.map((a) =>
          a.id === applicationId ? { ...a, ...appPatch } : a,
        ),
      }));
      void persist(
        () => dbUpdateApplication(userId, applicationId, appPatch),
        "Couldn't save that change.",
      );
    },
    toggleFollow: (companyId) => {
      const wasFollowed = companyById(companyId).followed;
      patch((prev) => ({
        ...prev,
        companies: prev.companies.map((c) =>
          c.id === companyId
            ? { ...c, followed: !wasFollowed, priority: !wasFollowed ? "High" : "Normal" }
            : c,
        ),
      }));
      void persist(
        () => dbToggleFollow(userId, companyId, wasFollowed),
        "Couldn't update your watchlist.",
      );
    },
    giveFeedback: (jobId, reason) => {
      patch((prev) => ({
        ...prev,
        feedback: [{ jobId, reason }, ...prev.feedback.filter((f) => f.jobId !== jobId)],
        ignored: reason === "Interested" ? prev.ignored : [...prev.ignored, jobId],
      }));
      toast.success(`Noted — ${learnFromFeedback(reason).adjustment}`);
      void persist(() => dbSetFeedback(userId, jobId, reason), "Couldn't record that feedback.");
    },
    updatePreferences: (prefPatch) => {
      patch((prev) => ({ ...prev, preferences: { ...prev.preferences, ...prefPatch } }));
      void persist(
        () => dbUpdatePreferences(userId, prefPatch),
        "Couldn't save your search settings.",
      );
    },
    updateProfile: (profilePatch) => {
      patch((prev) => ({ ...prev, profile: { ...prev.profile, ...profilePatch } }));
      void persist(() => dbUpdateProfile(userId, profilePatch), "Couldn't save your profile.");
    },
    updateWeights: (weightPatch) => {
      const next = { ...snap.weights, ...weightPatch };
      patch((prev) => ({ ...prev, weights: next }));
      void persist(() => dbUpdateWeights(userId, next), "Couldn't save your scoring settings.");
    },
    toggleNotification: (category) => {
      const nextEnabled = !snap.notificationPreferences.find((n) => n.category === category)?.enabled;
      patch((prev) => ({
        ...prev,
        notificationPreferences: prev.notificationPreferences.map((n) =>
          n.category === category ? { ...n, enabled: nextEnabled } : n,
        ),
      }));
      void persist(
        () => dbToggleNotification(userId, category, nextEnabled),
        "Couldn't save that notification setting.",
      );
    },
    markAlertsRead: () => {
      const now = new Date().toISOString();
      patch((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) => (n.readAt ? n : { ...n, readAt: now })),
      }));
      void persist(() => dbMarkNotificationsRead(userId), "Couldn't mark those as read.");
    },
    completeOnboarding: async () => {
      await dbCompleteOnboarding(userId);
      patch((prev) => ({ ...prev, onboardingCompleted: true }));
      await query.refetch();
    },
    runScan: async () => {
      setScanning(true);
      try {
        const result = await runScanNow();
        await query.refetch();
        toast.success(result.headline, { description: result.detail });
      } catch (error) {
        console.error(error);
        toast.error("The scan didn't finish. Please try again.");
      } finally {
        setScanning(false);
      }
    },

    saveProfile: async (profilePatch) => {
      await dbUpdateProfile(userId, profilePatch);
      patch((prev) => ({ ...prev, profile: { ...prev.profile, ...profilePatch } }));
      await query.refetch();
    },
    uploadCv: async (file, name) => {
      const id = await dbUploadCvReturningId(userId, file, name);
      await query.refetch();
      return id;
    },
    replaceCvFile: async (id, file) => {
      await dbReplaceCvFile(userId, id, file);
      await query.refetch();
    },
    renameCv: async (id, name) => {
      await dbRenameCv(userId, id, name);
      await query.refetch();
    },
    setPrimaryCv: async (id) => {
      await dbSetPrimaryCv(userId, id);
      await query.refetch();
    },
    deleteCv: async (id) => {
      const version = snap.cvVersions.find((c) => c.id === id);
      if (!version) return;
      await dbDeleteCv(userId, id, version.storagePath);
      await query.refetch();
    },
    cvDownloadUrl: async (id) => {
      const version = snap.cvVersions.find((c) => c.id === id);
      if (!version) throw new Error("That CV could not be found.");
      return dbCvSignedUrl(version.storagePath);
    },
    readCv: async (id) => {
      const result = await parseCvFn({ data: { cvId: id } });
      await query.refetch();
      return result;
    },
    applyCvExtraction: async (input) => {
      const result = await applyCvExtractionFn({ data: input });
      await query.refetch();
      return result;
    },
    addSkill: async (name, category) => {
      await dbAddSkill(userId, name, category);
      await query.refetch();
    },
    removeSkill: async (id) => {
      await dbDeleteSkill(userId, id);
      await query.refetch();
    },
    recalculateRanking: async () => {
      const result = await recalculateMatchesFn();
      await query.refetch();
      return result;
    },
  };

  return <RadarContext.Provider value={value}>{children}</RadarContext.Provider>;
}

export function useRadar() {
  const ctx = useContext(RadarContext);
  if (!ctx) throw new Error("useRadar must be used inside RadarProvider");
  return ctx;
}
