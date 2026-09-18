/**
 * Official UK sponsor-register import, employer matching and vacancy
 * re-analysis.
 *
 * The dataset is the GOV.UK "Register of Worker and Temporary Worker licensed
 * sponsors" CSV, located through the GOV.UK content API so a monthly re-publish
 * is picked up without any code change. Nothing here ever invents a row: if the
 * download fails, the import is recorded as failed and the previous dataset is
 * left untouched.
 *
 * The file is ~11 MB / ~140k rows, so it is imported in byte-ranged chunks and
 * the caller keeps calling until `done` is true.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyseSponsorship,
  matchSponsorRegister,
  normalizeLegalName,
  roleLooksSponsorable,
  type CompanySponsorMatch,
  type SponsorRegisterEntry,
} from "./sponsorship";

type Db = SupabaseClient<any, "public", any>;

const CONTENT_API =
  "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";
export const SPONSOR_SOURCE_NAME =
  "GOV.UK Register of Worker and Temporary Worker licensed sponsors";

const CHUNK_BYTES = 700_000;

export interface RegisterSource {
  sourceUrl: string;
  datasetDate: string | null;
  updatedAt: string | null;
}

/** Locates the current official CSV. Throws if GOV.UK does not offer one. */
export async function findRegisterSource(): Promise<RegisterSource> {
  const res = await fetch(CONTENT_API, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GOV.UK content API returned ${res.status}`);
  const body = (await res.json()) as {
    public_updated_at?: string;
    details?: { attachments?: Array<{ url?: string; content_type?: string; title?: string }> };
  };
  const attachments = body.details?.attachments ?? [];
  const csv = attachments.find(
    (a) => a.content_type === "text/csv" && /worker/i.test(a.title ?? "") && a.url,
  );
  if (!csv?.url) throw new Error("No Worker register CSV attachment published on GOV.UK right now");
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(csv.url);
  return {
    sourceUrl: csv.url,
    datasetDate: dateMatch?.[1] ?? (body.public_updated_at ? body.public_updated_at.slice(0, 10) : null),
    updatedAt: body.public_updated_at ?? null,
  };
}

/** Minimal RFC4180-ish CSV row parser (quoted fields, embedded commas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

interface RegisterRow {
  organisation_name: string;
  normalized_name: string;
  town_city: string | null;
  county: string | null;
  licence_type: string | null;
  licence_rating: string | null;
  route: string | null;
  data_source: string;
  register_date: string | null;
  batch_id: string;
}

function toRows(text: string, batchId: string, datasetDate: string | null, skipHeader: boolean): RegisterRow[] {
  const lines = text.split(/\r?\n/);
  const rows: RegisterRow[] = [];
  for (let i = skipHeader ? 1 : 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const name = (cells[0] ?? "").trim();
    if (!name) continue;
    const typeRating = (cells[3] ?? "").trim();
    const rating = /\(([^)]+)\)/.exec(typeRating)?.[1] ?? null;
    rows.push({
      organisation_name: name,
      normalized_name: normalizeLegalName(name),
      town_city: (cells[1] ?? "").trim() || null,
      county: (cells[2] ?? "").trim() || null,
      licence_type: typeRating.replace(/\s*\([^)]*\)\s*/, "").trim() || null,
      licence_rating: rating,
      route: (cells[4] ?? "").trim() || null,
      data_source: SPONSOR_SOURCE_NAME,
      register_date: datasetDate,
      batch_id: batchId,
    });
  }
  return rows;
}

export interface ImportChunkResult {
  batchId: string;
  offset: number;
  nextOffset: number;
  totalBytes: number;
  rowsImported: number;
  totalRows: number;
  done: boolean;
  datasetDate: string | null;
  sourceUrl: string;
}

/**
 * Imports one chunk of the official register. Pass no batchId to start a fresh
 * import; pass the returned batchId/nextOffset back to continue.
 */
export async function importRegisterChunk(
  db: Db,
  input: { batchId?: string | null; offset?: number },
): Promise<ImportChunkResult> {
  let batchId = input.batchId ?? null;
  const offset = Math.max(0, input.offset ?? 0);
  let sourceUrl: string;
  let datasetDate: string | null;

  if (!batchId) {
    const source = await findRegisterSource();
    sourceUrl = source.sourceUrl;
    datasetDate = source.datasetDate;
    const { data, error } = await db
      .from("sponsor_register_imports")
      .insert({
        source_url: sourceUrl,
        source_name: SPONSOR_SOURCE_NAME,
        dataset_date: datasetDate,
        method: "automatic",
        status: "running",
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    batchId = (data as { id: string }).id;
  } else {
    const { data, error } = await db
      .from("sponsor_register_imports")
      .select("source_url, dataset_date, rows_imported")
      .eq("id", batchId)
      .maybeSingle();
    if (error || !data) throw new Error("Unknown sponsor import batch");
    const row = data as { source_url: string; dataset_date: string | null };
    sourceUrl = row.source_url;
    datasetDate = row.dataset_date;
  }

  try {
    const res = await fetch(sourceUrl, { headers: { Range: `bytes=${offset}-${offset + CHUNK_BYTES - 1}` } });
    if (!res.ok && res.status !== 206) throw new Error(`Register download returned ${res.status}`);
    const contentRange = res.headers.get("content-range");
    const totalBytes = contentRange
      ? Number(contentRange.split("/")[1] ?? 0)
      : Number(res.headers.get("content-length") ?? 0) + offset;

    let bytes = new Uint8Array(await res.arrayBuffer());
    const reachedEnd = offset + bytes.length >= totalBytes;
    if (!reachedEnd) {
      let cut = -1;
      for (let i = bytes.length - 1; i >= 0; i -= 1) {
        if (bytes[i] === 10) {
          cut = i;
          break;
        }
      }
      if (cut < 0) throw new Error("Register chunk contained no complete row");
      bytes = bytes.subarray(0, cut + 1);
    }
    const text = new TextDecoder("utf-8").decode(bytes);
    const rows = toRows(text, batchId, datasetDate, offset === 0);

    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await db.from("sponsor_register_entries").insert(rows.slice(i, i + 1000) as never);
      if (error) throw new Error(error.message);
    }

    const nextOffset = offset + bytes.length;
    const done = nextOffset >= totalBytes;

    const { data: batchRow } = await db
      .from("sponsor_register_imports")
      .select("rows_imported")
      .eq("id", batchId)
      .maybeSingle();
    const totalRows = Number((batchRow as { rows_imported?: number } | null)?.rows_imported ?? 0) + rows.length;

    await db
      .from("sponsor_register_imports")
      .update({
        rows_imported: totalRows,
        bytes_processed: nextOffset,
        status: done ? "completed" : "running",
        completed_at: done ? new Date().toISOString() : null,
      } as never)
      .eq("id", batchId);

    if (done) {
      // Replace the previous dataset only once the new one is fully loaded.
      await db.from("sponsor_register_entries").delete().neq("batch_id", batchId);
      await db.from("sponsor_register_entries").delete().is("batch_id", null);
    }

    return {
      batchId,
      offset,
      nextOffset,
      totalBytes,
      rowsImported: rows.length,
      totalRows,
      done,
      datasetDate,
      sourceUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("sponsor_register_imports")
      .update({ status: "failed", error_text: message, completed_at: new Date().toISOString() } as never)
      .eq("id", batchId);
    throw new Error(message);
  }
}

/** Loads register rows that could plausibly match the employers we track. */
async function candidateEntries(db: Db, companyNames: string[]): Promise<SponsorRegisterEntry[]> {
  const seen = new Map<string, SponsorRegisterEntry>();
  for (const name of companyNames) {
    const core = normalizeLegalName(name).split(" ")[0] ?? "";
    if (core.length < 3) continue;
    const { data } = await db
      .from("sponsor_register_entries")
      .select("organisation_name, normalized_name, town_city, county, licence_type, route, register_date")
      .ilike("normalized_name", `${core}%`)
      .limit(400);
    for (const row of (data ?? []) as SponsorRegisterEntry[]) {
      seen.set(`${row.organisation_name}|${row.route ?? ""}`, row);
    }
  }
  return [...seen.values()];
}

export interface RematchOutcome {
  companies: number;
  matched: number;
  possible: number;
  notFound: number;
  unknown: number;
  matches: Array<{ companyId: string; name: string; match: CompanySponsorMatch }>;
}

/** Re-runs employer → legal-entity matching for every stored company. */
export async function rematchCompanies(db: Db): Promise<RematchOutcome> {
  const { data: companyRows } = await db.from("companies").select("id, name, is_demo").eq("is_demo", false);
  const companies = (companyRows ?? []) as Array<{ id: string; name: string }>;
  const entries = await candidateEntries(db, companies.map((c) => c.name));

  const out: RematchOutcome = {
    companies: companies.length,
    matched: 0,
    possible: 0,
    notFound: 0,
    unknown: 0,
    matches: [],
  };

  for (const company of companies) {
    const match = matchSponsorRegister(company.name, entries);
    if (match.status === "matched") out.matched += 1;
    else if (match.status === "possible") out.possible += 1;
    else if (match.status === "not_found") out.notFound += 1;
    else out.unknown += 1;

    await db
      .from("companies")
      .update({
        sponsor_licence_match_status: match.status,
        sponsor_register_matched_entity: match.entity,
        sponsor_register_match_confidence: match.confidence,
        sponsor_register_match_method: match.method,
        sponsor_licence_type: match.licenceType,
        sponsor_register_data_date: match.registerDate,
        sponsorship_confidence: match.confidence,
        sponsorship_last_checked: new Date().toISOString(),
      } as never)
      .eq("id", company.id);

    out.matches.push({ companyId: company.id, name: company.name, match });
  }
  return out;
}

export interface ReanalyseOutcome extends RematchOutcome {
  jobsAnalysed: number;
  byStatus: Record<string, number>;
}

/**
 * Re-runs sponsorship analysis for every active live vacancy. Canonical apply
 * URLs and every other job field are left untouched.
 */
export async function reanalyseSponsorship(db: Db): Promise<ReanalyseOutcome> {
  const rematch = await rematchCompanies(db);
  const matchByCompany = new Map(rematch.matches.map((m) => [m.companyId, m.match]));

  const { data: jobRows } = await db
    .from("jobs")
    .select("id, company_id, description, role_category, salary_min")
    .eq("is_active", true)
    .eq("is_demo", false)
    .limit(2000);
  const jobs = (jobRows ?? []) as Array<{
    id: string;
    company_id: string;
    description: string | null;
    role_category: string | null;
    salary_min: number | null;
  }>;

  const byStatus: Record<string, number> = {
    confirmed: 0,
    likely: 0,
    possible: 0,
    unclear: 0,
    unlikely: 0,
    no_sponsorship: 0,
  };
  let jobsAnalysed = 0;

  for (const job of jobs) {
    const match =
      matchByCompany.get(job.company_id) ??
      matchSponsorRegister("", []);
    const result = analyseSponsorship({
      description: job.description ?? "",
      companyMatch: match,
      roleLooksSponsorable: roleLooksSponsorable(job.role_category),
      salaryMin: job.salary_min,
    });
    const { error } = await db.from("job_sponsorship_analysis").upsert(
      {
        job_id: job.id,
        status: result.status,
        confidence: result.confidence,
        evidence_json: result.evidence,
        warnings_json: result.warnings,
        company_match_status: result.companyMatch.status,
        company_matched_entity: result.companyMatch.entity,
        company_match_confidence: result.companyMatch.confidence,
        job_wording_summary: result.jobWordingSummary,
        work_authorisation_summary: result.workAuthorisationSummary,
        restriction_summary: result.restrictionSummary,
        conclusion: result.conclusion,
        analysed_at: new Date().toISOString(),
      } as never,
      { onConflict: "job_id" },
    );
    if (error) throw new Error(error.message);
    byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
    jobsAnalysed += 1;
  }

  return { ...rematch, jobsAnalysed, byStatus };
}

export interface SponsorRegisterStatus {
  connected: boolean;
  method: "automatic" | "manual" | null;
  sourceName: string;
  datasetDate: string | null;
  entries: number;
  lastRefresh: string | null;
  lastStatus: string | null;
  lastError: string | null;
  companiesMatched: number;
  companiesReview: number;
  companiesNotFound: number;
}

export async function sponsorRegisterStatus(db: Db): Promise<SponsorRegisterStatus> {
  const [entriesRes, importRes, companiesRes] = await Promise.all([
    db.from("sponsor_register_entries").select("id", { count: "exact", head: true }),
    db
      .from("sponsor_register_imports")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("companies").select("sponsor_licence_match_status").eq("is_demo", false),
  ]);

  const last = (importRes.data ?? null) as Record<string, unknown> | null;
  const companies = (companiesRes.data ?? []) as Array<{ sponsor_licence_match_status: string }>;
  const entries = entriesRes.count ?? 0;

  return {
    connected: entries > 0 && last?.["status"] === "completed",
    method: (last?.["method"] as "automatic" | "manual") ?? null,
    sourceName: (last?.["source_name"] as string) ?? SPONSOR_SOURCE_NAME,
    datasetDate: (last?.["dataset_date"] as string) ?? null,
    entries,
    lastRefresh: (last?.["completed_at"] as string) ?? (last?.["started_at"] as string) ?? null,
    lastStatus: (last?.["status"] as string) ?? null,
    lastError: (last?.["error_text"] as string) ?? null,
    companiesMatched: companies.filter((c) => c.sponsor_licence_match_status === "matched").length,
    companiesReview: companies.filter((c) => c.sponsor_licence_match_status === "possible").length,
    companiesNotFound: companies.filter((c) => c.sponsor_licence_match_status === "not_found").length,
  };
}
