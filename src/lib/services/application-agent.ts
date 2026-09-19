/** Pure policies shared by the queue and its regression tests. */
export type Verdict = "APPLY" | "STRETCH" | "SKIP";
export interface AgentQuestion {
  key: string;
  label: string;
  required: boolean;
  options: string[];
  type: string;
  answer: string | null;
}
export interface AgentTask {
  id: string;
  job_id: string;
  title: string;
  company: string;
  apply_url: string;
  verdict: Verdict;
  fit: number;
  status: "queued" | "needs_input" | "ready" | "submitted" | "dismissed" | "blocked";
  reasons: string[];
  cv_text: string | null;
  cv_notes: string[];
  questions: AgentQuestion[];
  last_error: string | null;
  updated_at: string;
}
export interface MemoryAnswer {
  id: string;
  question: string;
  answer: string;
  scope: string;
  confirmed_at: string;
  expires_at: string;
}
export interface AgentSettings {
  enabled: boolean;
  daily_limit: number;
  min_fit: number;
  include_stretch: boolean;
}
export const defaultAgentSettings: AgentSettings = {
  enabled: false,
  daily_limit: 5,
  min_fit: 70,
  include_stretch: false,
};
export function questionKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
/** Never put authentication secrets in an application answer database. */
export function isSecretQuestion(label: string): boolean {
  return /\b(password|passcode|otp|one[- ]time|verification code|security code|captcha|credit card|bank account|national insurance|passport number)\b/i.test(
    label,
  );
}
/** Context-sensitive answers are application-only, even if remember is requested. */
export function isSensitiveQuestion(label: string): boolean {
  return (
    isSecretQuestion(label) ||
    /\b(sponsor\w*|visa|citizen\w*|right to work|authori[sz]\w*|eligible|salary|compensation|pay|notice|relocat\w*|disab\w*|health|ethnic\w*|gender|religio\w*|criminal|convict\w*|consent|agree|certif\w*|declar\w*|signat\w*|veteran|sexual|date of birth|age|race|years? of|experience|current\w*|previous\w*|have you|are you|will you|do you|willing|require|country|residen\w*)\b/i.test(
      label,
    )
  );
}
export function reusableAnswer(
  question: string,
  answers: MemoryAnswer[],
  now = Date.now(),
): string | null {
  if (isSensitiveQuestion(question)) return null;
  const matches = answers.filter(
    (a) =>
      a.scope === "global" &&
      questionKey(a.question) === questionKey(question) &&
      Date.parse(a.expires_at) > now,
  );
  // Conflicting memories never silently win by array ordering.
  return matches.length && new Set(matches.map((a) => a.answer)).size === 1
    ? matches[0]!.answer
    : null;
}
export function safeApplicationUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !u.hostname.includes(".") ||
      /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        u.hostname,
      ) ||
      u.hostname.endsWith(".local") ||
      u.hostname.includes(":")
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function classifyForQueue(input: {
  fit: number;
  minFit: number;
  clearance: string;
  eligibility: string;
  active: boolean;
  liveStatus: string;
  analysed: boolean;
  missing: number;
  seniority: number;
}): { verdict: Verdict; reasons: string[] } {
  if (input.clearance === "required")
    return {
      verdict: "SKIP",
      reasons: ["The advert requires UK security clearance or eligibility."],
    };
  if (
    !input.active ||
    ["expired", "broken"].includes(input.liveStatus) ||
    input.eligibility === "ineligible"
  )
    return {
      verdict: "SKIP",
      reasons: ["The vacancy is inactive, unavailable, or fails your eligibility rules."],
    };
  if (!input.analysed)
    return {
      verdict: "STRETCH",
      reasons: ["Full job analysis is not available; fit needs review."],
    };
  if (!Number.isFinite(input.fit) || input.fit < input.minFit || input.seniority < 50)
    return { verdict: "SKIP", reasons: ["Fit or seniority is below the preparation threshold."] };
  if (input.clearance !== "none" && input.clearance !== "not_required")
    return { verdict: "STRETCH", reasons: ["Clearance wording needs human review."] };
  if (
    input.missing > 0 ||
    input.eligibility === "review" ||
    input.seniority < 80 ||
    input.liveStatus !== "live"
  )
    return {
      verdict: "STRETCH",
      reasons: [
        "Review missing evidence, seniority, eligibility or the application link before applying.",
      ],
    };
  return {
    verdict: "APPLY",
    reasons: [
      "Meets the configured fit threshold with no identified essential-skill gaps or hard blockers.",
    ],
  };
}
/** Conservative tailoring: move only existing skill bullets within an explicit skills section.
 * Never rewrite employment, add keywords, infer metrics or discard source lines. */
export function prepareCvText(
  source: string,
  description: string,
): { text: string; notes: string[] } {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) =>
    /^\s*(technical\s+|key\s+|core\s+)?skills\s*:?\s*$/i.test(line),
  );
  const notes = [
    "Employment, dates, qualifications and achievements are preserved from the uploaded CV.",
  ];
  if (start < 0)
    return {
      text: source,
      notes: [
        ...notes,
        "No explicit Skills section found. Original CV text retained; no unsupported rewriting.",
      ],
    };
  let end = start + 1;
  while (
    end < lines.length &&
    !/^\s*(professional experience|work experience|experience|employment|education|projects|certifications|interests|references|awards|summary|profile)\s*:?\s*$/i.test(
      lines[end]!,
    )
  )
    end++;
  const indices = lines
    .slice(start + 1, end)
    .map((line, i) => ({ line, index: i + start + 1 }))
    .filter((x) => /^\s*[-•*]\s+/.test(x.line));
  const jd = questionKey(description);
  const weight = (line: string) =>
    questionKey(line)
      .split(" ")
      .filter((w) => w.length > 2 && ` ${jd} `.includes(` ${w} `)).length;
  const sorted = [...indices].sort((a, b) => weight(b.line) - weight(a.line));
  const changed = indices.some((x, i) => x.line !== sorted[i]?.line);
  indices.forEach((x, i) => {
    lines[x.index] = sorted[i]!.line;
  });
  notes.push(
    changed
      ? "Existing Skills bullets reordered by job-description overlap. No new claims added."
      : "Original skills order retained; no supported change was needed.",
  );
  notes.push(
    "Text export does not preserve the original PDF/Word layout. Review formatting before uploading.",
  );
  return { text: lines.join("\n"), notes };
}
