/**
 * Server-side CV reading.
 *
 * Two stages, both server only:
 * 1. Text extraction from the stored file (PDF via unpdf, DOCX via the
 *    OOXML document part). The file never becomes public: it is read with the
 *    service client straight from the private bucket.
 * 2. Structured extraction through Lovable AI with a strict JSON schema. The
 *    model is told to extract only what the CV says — nothing is invented, and
 *    nothing is written to the profile until the user confirms it.
 */

export interface CvExtraction {
  summary: string | null;
  headline: string | null;
  education: string[];
  yearsExperience: number | null;
  skills: string[];
  programmingLanguages: string[];
  frameworks: string[];
  cloud: string[];
  databases: string[];
  mlAi: string[];
  dataTools: string[];
  certifications: string[];
  projects: string[];
  experience: string[];
}

export class CvParseError extends Error {}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "headline",
    "education",
    "yearsExperience",
    "skills",
    "programmingLanguages",
    "frameworks",
    "cloud",
    "databases",
    "mlAi",
    "dataTools",
    "certifications",
    "projects",
    "experience",
  ],
  properties: {
    summary: { type: ["string", "null"] },
    headline: { type: ["string", "null"] },
    education: { type: "array", items: { type: "string" } },
    yearsExperience: { type: ["number", "null"] },
    skills: { type: "array", items: { type: "string" } },
    programmingLanguages: { type: "array", items: { type: "string" } },
    frameworks: { type: "array", items: { type: "string" } },
    cloud: { type: "array", items: { type: "string" } },
    databases: { type: "array", items: { type: "string" } },
    mlAi: { type: "array", items: { type: "string" } },
    dataTools: { type: "array", items: { type: "string" } },
    certifications: { type: "array", items: { type: "string" } },
    projects: { type: "array", items: { type: "string" } },
    experience: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM = `You extract structured facts from a candidate CV.

Rules:
- Only report what the CV states. Never infer, never add adjacent technologies, never round experience up.
- If a field is genuinely absent, return null or an empty array.
- Skills, languages, frameworks, cloud, databases and AI/ML tools must be short canonical names (e.g. "Python", "React", "AWS", "PostgreSQL", "PyTorch").
- Do not duplicate the same technology across more than one category; pick the best fit.
- experience: one short line per role, "Title — Employer (dates)".
- projects: one short line per project.
- yearsExperience: total professional years the CV supports; null if it cannot be determined.`;

function stripTags(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(bytes);
  const chunks: string[] = [];
  for (const name of ["word/document.xml", "word/header1.xml", "word/footer1.xml"]) {
    const part = files[name];
    if (part) chunks.push(strFromU8(part));
  }
  if (chunks.length === 0) throw new CvParseError("That Word file did not contain readable text.");
  return stripTags(chunks.join("\n"));
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: true });
  const raw: unknown = result.text;
  return (Array.isArray(raw) ? raw.join("\n") : String(raw ?? ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract plain text from a CV file's bytes. */
export async function extractCvText(bytes: Uint8Array, storagePath: string): Promise<string> {
  const lower = storagePath.toLowerCase();
  const isPdf = lower.endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50);
  const text = isPdf ? await extractPdfText(bytes) : await extractDocxText(bytes);
  if (text.replace(/\s/g, "").length < 200) {
    throw new CvParseError(
      "We could only read a few characters from that file. If it is a scanned CV, please upload a text-based PDF or a Word document.",
    );
  }
  return text;
}

function asStrings(value: unknown, max = 60): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 160) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseCvExtraction(raw: unknown): CvExtraction {
  if (!raw || typeof raw !== "object") throw new CvParseError("CV reading returned no structured output.");
  const o = raw as Record<string, unknown>;
  const years = typeof o["yearsExperience"] === "number" ? o["yearsExperience"] : null;
  const extraction: CvExtraction = {
    summary: asNullableString(o["summary"]),
    headline: asNullableString(o["headline"]),
    education: asStrings(o["education"], 10),
    yearsExperience: years !== null && years >= 0 && years < 60 ? Math.round(years * 10) / 10 : null,
    skills: asStrings(o["skills"]),
    programmingLanguages: asStrings(o["programmingLanguages"], 30),
    frameworks: asStrings(o["frameworks"], 40),
    cloud: asStrings(o["cloud"], 25),
    databases: asStrings(o["databases"], 25),
    mlAi: asStrings(o["mlAi"], 40),
    dataTools: asStrings(o["dataTools"], 30),
    certifications: asStrings(o["certifications"], 20),
    projects: asStrings(o["projects"], 15),
    experience: asStrings(o["experience"], 20),
  };
  const anything =
    extraction.skills.length +
    extraction.programmingLanguages.length +
    extraction.frameworks.length +
    extraction.cloud.length +
    extraction.databases.length +
    extraction.mlAi.length +
    extraction.experience.length;
  if (anything === 0) throw new CvParseError("CV reading found nothing usable in that document.");
  return extraction;
}

/** Structured extraction through Lovable AI. Never invents content. */
export async function analyseCvText(text: string): Promise<CvExtraction> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new CvParseError("CV reading is not connected (no AI key configured).");

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
          content: [{ type: "input_text", text: `CV text:\n\n${text.slice(0, 24_000)}` }],
        },
      ],
      text: { format: { type: "json_schema", name: "cv_extraction", strict: true, schema: SCHEMA } },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CvParseError(`CV reading failed [${res.status}]: ${body.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new CvParseError("CV reading returned no stream.");
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
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
          out += event.delta;
        } else if (event.type === "response.completed" && event.response?.output_text && !out) {
          out = event.response.output_text;
        }
      } catch {
        // keep-alive or partial frame
      }
    }
  }

  if (!out.trim()) throw new CvParseError("CV reading returned empty output.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new CvParseError("CV reading returned output that was not valid JSON.");
  }
  return parseCvExtraction(parsed);
}
