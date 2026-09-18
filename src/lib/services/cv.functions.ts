import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CvExtraction } from "./cv-parse.server";

/**
 * Authenticated CV reading and candidate-side recalculation.
 *
 * - Files stay in the private bucket; only the owner's rows are ever touched.
 * - Reading a CV never writes to the profile. The user reviews the extraction
 *   and confirms it, and only then are skills stored (marked as CV-derived).
 * - Recalculation reuses the stored job analysis and sponsor evidence: it only
 *   recomputes the candidate-dependent match/eligibility/ranking parts.
 */

export interface CvParseResult {
  ok: boolean;
  cvId: string;
  error: string | null;
  extraction: CvExtraction | null;
  charactersRead: number;
}

const SKILL_GROUPS: Array<{ key: keyof CvExtraction; category: string }> = [
  { key: "programmingLanguages", category: "Language" },
  { key: "cloud", category: "Cloud" },
  { key: "databases", category: "Database" },
  { key: "mlAi", category: "ML" },
  { key: "frameworks", category: "Framework" },
  { key: "dataTools", category: "Data" },
  { key: "skills", category: "General" },
];

export const parseCvFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cvId: string }) => input)
  .handler(async ({ data, context }): Promise<CvParseResult> => {
    const { data: cv, error } = await context.supabase
      .from("cv_versions")
      .select("id, storage_path")
      .eq("id", data.cvId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !cv) return { ok: false, cvId: data.cvId, error: "That CV could not be found.", extraction: null, charactersRead: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractCvText, analyseCvText, CvParseError } = await import("./cv-parse.server");

    const markFailed = async (message: string) => {
      await supabaseAdmin
        .from("cv_versions")
        .update({ parse_status: "failed", parse_error: message.slice(0, 500) })
        .eq("id", cv.id);
      return { ok: false, cvId: cv.id, error: message, extraction: null, charactersRead: 0 };
    };

    try {
      const download = await supabaseAdmin.storage.from("cvs").download(cv.storage_path);
      if (download.error || !download.data) {
        return await markFailed("The stored file could not be opened.");
      }
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      const text = await extractCvText(bytes, cv.storage_path);
      const extraction = await analyseCvText(text);

      await supabaseAdmin
        .from("cv_versions")
        .update({
          parsed_text: text.slice(0, 60_000),
          parsed_profile_json: JSON.parse(JSON.stringify(extraction)),
          parse_status: "parsed",
          parse_error: null,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", cv.id);

      return { ok: true, cvId: cv.id, error: null, extraction, charactersRead: text.length };
    } catch (err) {
      const message =
        err instanceof CvParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "CV reading failed unexpectedly.";
      return await markFailed(message);
    }
  });

export interface ApplyCvInput {
  cvId: string;
  headline?: string | null;
  summary?: string | null;
  education?: string | null;
  yearsExperience?: number | null;
  certifications?: string[];
  skills: Array<{ name: string; category: string }>;
}

export interface RecalcResult {
  scored: number;
  strongMatches: number;
  applyAsap: number;
  note: string;
}

async function recalculate(userId: string): Promise<RecalcResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { scoreUserMatches } = await import("./scoring.server");
  const outcome = await scoreUserMatches(supabaseAdmin as never, userId);
  return {
    scored: outcome.scored,
    strongMatches: outcome.strongMatches,
    applyAsap: outcome.applyAsap,
    note: `${outcome.scored} live ${outcome.scored === 1 ? "role" : "roles"} re-ranked using the analysis already stored for them.`,
  };
}

/** Store a reviewed CV extraction, then re-rank. Replaces only CV-derived skills. */
export const applyCvExtractionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ApplyCvInput) => input)
  .handler(async ({ data, context }): Promise<RecalcResult> => {
    const { data: cv } = await context.supabase
      .from("cv_versions")
      .select("id")
      .eq("id", data.cvId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!cv) throw new Error("That CV could not be found.");

    const profilePatch: Record<string, unknown> = {};
    if (data.headline !== undefined && data.headline) profilePatch["headline"] = data.headline;
    if (data.summary !== undefined && data.summary) profilePatch["summary"] = data.summary;
    if (data.education !== undefined && data.education) profilePatch["education"] = data.education;
    if (typeof data.yearsExperience === "number") profilePatch["years_experience"] = data.yearsExperience;
    if (data.certifications && data.certifications.length > 0) profilePatch["certifications"] = data.certifications;
    if (Object.keys(profilePatch).length > 0) {
      await context.supabase
        .from("candidate_profiles")
        .upsert({ user_id: context.userId, ...profilePatch }, { onConflict: "user_id" });
    }

    // CV-derived skills are replaced wholesale; anything the user added by hand
    // (source = 'user') is left exactly where it is.
    await context.supabase
      .from("candidate_skills")
      .delete()
      .eq("user_id", context.userId)
      .in("source", ["cv", "onboarding"]);

    const seen = new Set<string>();
    const rows = data.skills
      .map((s) => ({ name: s.name.trim(), category: s.category }))
      .filter((s) => {
        const key = s.name.toLowerCase();
        if (!s.name || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 200)
      .map((s) => ({
        user_id: context.userId,
        skill_name: s.name,
        skill_category: s.category,
        source: "cv",
      }));
    if (rows.length > 0) {
      const { error } = await context.supabase.from("candidate_skills").insert(rows);
      if (error) throw new Error(error.message);
    }

    return await recalculate(context.userId);
  });

/** Re-rank the user's live vacancies. No discovery, no AI job analysis, no sponsor import. */
export const recalculateMatchesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecalcResult> => await recalculate(context.userId));

export const suggestedSkillCategories = SKILL_GROUPS.map((g) => g.category);
export { SKILL_GROUPS };
