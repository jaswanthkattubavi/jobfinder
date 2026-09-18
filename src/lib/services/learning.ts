/**
 * Behaviour learning. Pure and deliberately conservative.
 *
 * What the user *does* (saves, applies, ignores, explicit feedback) can only
 * nudge ranking by a few points. It can never unlock a role their own rules
 * exclude, and it never edits their profile, skills or hard filters.
 */

export type LearningSignalKind = "role_category" | "company" | "seniority" | "remote_type" | "city";

export interface LearningEvent {
  kind: LearningSignalKind;
  value: string;
  /** true for saved/applied/interested, false for ignored/not-interested. */
  positive: boolean;
}

export interface LearnedSignal {
  kind: LearningSignalKind;
  value: string;
  positiveCount: number;
  negativeCount: number;
  adjustment: number;
  confidenceNote: string;
}

/** Minimum evidence before behaviour is allowed to affect ranking at all. */
export const MIN_EVENTS_TO_LEARN = 3;
const MAX_PER_SIGNAL = 4;

export function aggregateSignals(events: LearningEvent[]): LearnedSignal[] {
  const map = new Map<string, LearnedSignal>();
  for (const e of events) {
    const value = e.value?.trim();
    if (!value) continue;
    const key = `${e.kind}::${value.toLowerCase()}`;
    const current =
      map.get(key) ??
      ({
        kind: e.kind,
        value,
        positiveCount: 0,
        negativeCount: 0,
        adjustment: 0,
        confidenceNote: "",
      } satisfies LearnedSignal);
    if (e.positive) current.positiveCount += 1;
    else current.negativeCount += 1;
    map.set(key, current);
  }

  const out: LearnedSignal[] = [];
  for (const signal of map.values()) {
    const total = signal.positiveCount + signal.negativeCount;
    if (total < MIN_EVENTS_TO_LEARN) {
      signal.adjustment = 0;
      signal.confidenceNote = `Only ${total} signal${total === 1 ? "" : "s"} so far — not used in ranking yet`;
      out.push(signal);
      continue;
    }
    const lean = (signal.positiveCount - signal.negativeCount) / total;
    signal.adjustment = Math.round(lean * MAX_PER_SIGNAL);
    signal.confidenceNote =
      signal.adjustment > 0
        ? `You keep these — ranked up by ${signal.adjustment}`
        : signal.adjustment < 0
          ? `You keep dismissing these — ranked down by ${Math.abs(signal.adjustment)}`
          : "Mixed signals — no effect on ranking";
    out.push(signal);
  }
  return out.sort((a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment));
}

/** Total nudge for one job, still clamped again by the scoring engine. */
export function adjustmentFor(
  signals: LearnedSignal[],
  job: { roleCategory: string | null; companyName: string | null; seniority: string | null; remoteType: string | null; city: string | null },
): number {
  const match = (kind: LearningSignalKind, value: string | null) =>
    value
      ? signals.find((s) => s.kind === kind && s.value.toLowerCase() === value.toLowerCase())?.adjustment ?? 0
      : 0;
  return (
    match("role_category", job.roleCategory) +
    match("company", job.companyName) +
    match("seniority", job.seniority) +
    match("remote_type", job.remoteType) +
    match("city", job.city)
  );
}

const POSITIVE_FEEDBACK = new Set(["interested"]);

export function feedbackIsPositive(reason: string): boolean {
  return POSITIVE_FEEDBACK.has(reason);
}
