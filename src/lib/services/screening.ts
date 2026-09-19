/** Conservative advert-only screening. Absence or a bare mention is not proof. */
export type ClearanceStatus = "required" | "not_required" | "desirable" | "unknown";
export interface ClearanceAssessment {
  status: ClearanceStatus;
  evidence: string[];
}

// BPSS is deliberately absent: baseline screening is not national security clearance.
const CLEARANCE =
  /\b(?:security clearance|security check|developed vetting|(?:sc|dv)(?:\s*\(security check\))?(?:[- ]clear(?:ance|ed))?|security[- ]cleared|nppv)\b/i;
const clauses = (text: string) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/[’‘]/g, "'")
    .split(/[.!?;\n]+|\bbut\b|\bhowever\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

export function classifyClearance(text: string): ClearanceAssessment {
  const found: Array<{ status: ClearanceStatus; evidence: string }> = [];
  for (const clause of clauses(text)) {
    if (!CLEARANCE.test(clause)) continue;
    // 'No existing clearance required' still demands clearance when eligibility is explicit.
    const eligibility =
      /\b(?:must|need(?:s)? to|required to|will (?:need|be required) to)\b.{0,100}\b(?:eligible|obtain|undergo|achieve|pass)\b/i.test(
        clause,
      ) ||
      /\b(?:eligible|eligibility|able to obtain)\b.{0,70}\b(?:sc|dv|security clearance|security check|developed vetting)\b/i.test(
        clause,
      );
    const negated =
      /\b(?:no|without)\s+(?:existing\s+|current\s+|active\s+|prior\s+)?(?:security clearance|sc(?: clearance)?|dv(?: clearance)?|security check)\b/i.test(
        clause,
      ) ||
      /\b(?:not|never)\s+(?:required|necessary|needed|mandatory)\b/i.test(clause) ||
      /\b(?:do not|does not|don't|doesn't)\s+(?:require|need)\b/i.test(clause);
    const desirable = /\b(?:desirable|preferred|optional|advantage|nice[- ]to[- ]have)\b/i.test(
      clause,
    );
    const required =
      /\b(?:must|required|require|requires|mandatory|essential|need to|needs to|subject to|will undergo|will be cleared|will obtain)\b/i.test(
        clause,
      ) || /\b(?:sc|dv)[- ]cleared\b/i.test(clause);
    const status: ClearanceStatus =
      eligibility && (!negated || /\bmust\b.{0,80}\b(?:obtain|eligible|undergo)\b/i.test(clause))
        ? "required"
        : negated
          ? "not_required"
          : desirable
            ? "desirable"
            : required
              ? "required"
              : "unknown";
    found.push({ status, evidence: clause });
  }
  const status =
    (["required", "unknown", "desirable", "not_required"] as const).find((s) =>
      found.some((f) => f.status === s),
    ) ?? "unknown";
  return { status, evidence: found.filter((f) => f.status === status).map((f) => f.evidence) };
}

export function classifySponsorship(text: string): "offered" | "unavailable" | "unknown" {
  let offered = false;
  for (const clause of clauses(text)) {
    if (!/\b(?:sponsor(?:ship|ing)?|skilled worker visa)\b/i.test(clause)) continue;
    if (
      /\bapplicants requiring sponsorship cannot be considered\b/i.test(clause) ||
      /\b(?:cannot|can not|can't|unable to|not able to|do not|don't|does not|doesn't|will not|won't|not in a position to)\b.{0,80}\b(?:sponsor(?:ship)?|skilled worker visa)\b/i.test(
        clause,
      ) ||
      /\bno\s+(?:(?:visa|skilled worker)\s+)?sponsorship\b/i.test(clause) ||
      /\bsponsorship\b.{0,35}\b(?:not\s+available|unavailable)\b/i.test(clause) ||
      /\bsponsorship\b.{0,35}\bnot\s+(?:offered|provided|supported|possible)\b/i.test(clause)
    )
      return "unavailable";
    if (
      /\b(?:can|will|able to)\s+(?:offer\s+|provide\s+)?(?:visa\s+)?sponsor(?:ship)?\b/i.test(
        clause,
      ) ||
      /\b(?:offer|provide|support)\s+(?:(?:skilled worker\s+)?visa\s+)?sponsorship\b/i.test(
        clause,
      ) ||
      /\b(?:visa\s+)?sponsorship\s+(?:is\s+)?(?:available|offered|provided)\b/i.test(clause)
    ) {
      // Conditional language never proves that this vacancy offers sponsorship.
      if (!/\b(?:may|might|could|if|not|no)\b/i.test(clause)) offered = true;
    }
  }
  return offered ? "offered" : "unknown";
}

/** Whole skill phrases only; RAG must not match GraphRAG and Java not JavaScript. */
export function containsSkill(text: string, skill: string): boolean {
  const escaped = skill.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !!escaped && new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, "i").test(text);
}

/** A mention of nationality is not itself a mandatory citizenship requirement. */
export function requiresUkCitizenship(text: string): boolean {
  return clauses(text).some((clause) => {
    if (!/\b(?:uk|british)\s+(?:citizen(?:ship)?|national(?:ity|s)?)\b/i.test(clause)) return false;
    if (
      /\b(?:not required|not necessary|do not require|does not require|no requirement|regardless of)\b/i.test(
        clause,
      )
    )
      return false;
    return /\b(?:must|required|requires|only|sole)\b/i.test(clause);
  });
}
