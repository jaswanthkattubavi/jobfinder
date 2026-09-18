/**
 * Structured job-description analysis through Lovable AI.
 *
 * Rules honoured here:
 * - Server-side only; the API key never reaches the browser.
 * - Strict JSON schema; malformed output is never stored — the failure is
 *   recorded so it can be retried.
 * - The model only extracts what the posting says. It never scores the
 *   candidate and never invents candidate experience.
 * - Streaming, because reasoning models can run for minutes.
 */

export const ANALYSIS_VERSION = "ai-v2";

export interface JobAnalysis {
  requiredSkills: string[];
  preferredSkills: string[];
  technologies: string[];
  programmingLanguages: string[];
  frameworks: string[];
  cloudPlatforms: string[];
  databases: string[];
  devopsTools: string[];
  mlTools: string[];
  dataTools: string[];
  responsibilities: string[];
  leadershipExpectations: string[];
  yearsExperience: string | null;
  seniority: string | null;
  education: string | null;
  industryDomain: string | null;
  domains: string[];
  visaLanguage: string[];
  citizenshipRequirements: string[];
  securityRequirements: string[];
  atsCritical: string[];
  atsUseful: string[];
  atsOptional: string[];
}

const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

const PROPS = {
  requiredSkills: STRING_ARRAY,
  preferredSkills: STRING_ARRAY,
  technologies: STRING_ARRAY,
  programmingLanguages: STRING_ARRAY,
  frameworks: STRING_ARRAY,
  cloudPlatforms: STRING_ARRAY,
  databases: STRING_ARRAY,
  devopsTools: STRING_ARRAY,
  mlTools: STRING_ARRAY,
  dataTools: STRING_ARRAY,
  responsibilities: STRING_ARRAY,
  leadershipExpectations: STRING_ARRAY,
  yearsExperience: { type: ["string", "null"] },
  seniority: { type: ["string", "null"] },
  education: { type: ["string", "null"] },
  industryDomain: { type: ["string", "null"] },
  domains: STRING_ARRAY,
  visaLanguage: STRING_ARRAY,
  citizenshipRequirements: STRING_ARRAY,
  securityRequirements: STRING_ARRAY,
  atsCritical: STRING_ARRAY,
  atsUseful: STRING_ARRAY,
  atsOptional: STRING_ARRAY,
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(PROPS),
  properties: PROPS,
} as const;

const SYSTEM = `You extract structured facts from UK job descriptions.
Only report what the description actually states. Never infer, embellish or invent.
If the description does not state something, return null or an empty array.
Split skills into requiredSkills (stated as essential/must-have) and preferredSkills (nice-to-have/bonus).
Group named technologies into programmingLanguages, frameworks, cloudPlatforms, databases, devopsTools, mlTools and dataTools; repeat them in technologies.
leadershipExpectations lists explicit people-management, mentoring or ownership-of-team expectations only.
Copy visa/sponsorship wording verbatim into visaLanguage, citizenship requirements into citizenshipRequirements, and clearance/vetting wording into securityRequirements.
atsCritical = terms the advert treats as essential; atsUseful = terms mentioned as desirable; atsOptional = other domain vocabulary worth mirroring.
Never comment on any candidate.`;

export function aiAnalysisAvailable(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"]);
}

export class AnalysisError extends Error {}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 40)
    : [];
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Validates the model output before it is ever persisted. */
export function parseAnalysis(raw: unknown): JobAnalysis {
  if (!raw || typeof raw !== "object") throw new AnalysisError("Model returned no object");
  const o = raw as Record<string, unknown>;
  const analysis: JobAnalysis = {
    requiredSkills: asStringArray(o["requiredSkills"]),
    preferredSkills: asStringArray(o["preferredSkills"]),
    technologies: asStringArray(o["technologies"]),
    programmingLanguages: asStringArray(o["programmingLanguages"]),
    frameworks: asStringArray(o["frameworks"]),
    cloudPlatforms: asStringArray(o["cloudPlatforms"]),
    databases: asStringArray(o["databases"]),
    devopsTools: asStringArray(o["devopsTools"]),
    mlTools: asStringArray(o["mlTools"]),
    dataTools: asStringArray(o["dataTools"]),
    responsibilities: asStringArray(o["responsibilities"]),
    leadershipExpectations: asStringArray(o["leadershipExpectations"]),
    yearsExperience: asNullableString(o["yearsExperience"]),
    seniority: asNullableString(o["seniority"]),
    education: asNullableString(o["education"]),
    industryDomain: asNullableString(o["industryDomain"]),
    domains: asStringArray(o["domains"]),
    visaLanguage: asStringArray(o["visaLanguage"]),
    citizenshipRequirements: asStringArray(o["citizenshipRequirements"]),
    securityRequirements: asStringArray(o["securityRequirements"]),
    atsCritical: asStringArray(o["atsCritical"]),
    atsUseful: asStringArray(o["atsUseful"]),
    atsOptional: asStringArray(o["atsOptional"]),
  };
  if (
    analysis.requiredSkills.length === 0 &&
    analysis.technologies.length === 0 &&
    analysis.responsibilities.length === 0
  ) {
    throw new AnalysisError("Model output contained no usable requirements");
  }
  return analysis;
}

export async function analyseJobDescription(input: {
  title: string;
  companyName: string;
  description: string;
}): Promise<JobAnalysis> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AnalysisError("AI analysis is not connected (no API key configured).");
  if (!input.description || input.description.length < 120) {
    throw new AnalysisError("Description too short to analyse");
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      instructions: SYSTEM,
      reasoning: { effort: "low", summary: "auto" },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Role: ${input.title}\nCompany: ${input.companyName}\n\nDescription:\n${input.description.slice(0, 18_000)}`,
            },
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: "job_analysis", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AnalysisError(`AI analysis failed [${res.status}]: ${body.slice(0, 300)}`);
  }

  // Streaming is required on this endpoint; accumulate the text deltas.
  const reader = res.body?.getReader();
  if (!reader) throw new AnalysisError("AI analysis returned no stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && event.response?.output_text) {
          if (!text) text = event.response.output_text;
        }
      } catch {
        // Ignore keep-alives and partial frames.
      }
    }
  }

  if (!text.trim()) throw new AnalysisError("AI analysis returned empty output");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AnalysisError("AI analysis returned output that was not valid JSON");
  }
  return parseAnalysis(parsed);
}

/** HTTP-status policy from the gateway error contract. */
export function isRetryableAiStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
