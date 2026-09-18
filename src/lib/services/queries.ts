/**
 * Search query generation from the user's enabled role categories.
 * Users can add their own queries in settings; those are merged in.
 */

export const QUERIES_BY_CATEGORY: Record<string, string[]> = {
  "Data Science": [
    "Data Scientist",
    "Junior Data Scientist",
    "Associate Data Scientist",
    "Graduate Data Scientist",
    "Applied Scientist",
  ],
  "Machine Learning": ["Machine Learning Engineer", "ML Engineer", "Applied ML Engineer"],
  "AI Engineering": ["AI Engineer", "Applied AI Engineer", "GenAI Engineer", "LLM Engineer"],
  MLOps: ["MLOps Engineer", "ML Platform Engineer", "Machine Learning Infrastructure Engineer"],
  "Data Engineering": ["Data Engineer", "Analytics Engineer", "Junior Data Engineer", "Graduate Data Engineer"],
  "Data Analytics": [
    "Data Analyst",
    "BI Analyst",
    "Business Intelligence Analyst",
    "Insight Analyst",
    "Technical Analyst",
  ],
  "Software Engineering": [
    "Software Engineer",
    "Software Developer",
    "Graduate Software Engineer",
    "Junior Software Engineer",
    "Software Engineer I",
  ],
  "Backend Engineering": [
    "Backend Engineer",
    "Backend Developer",
    "Python Developer",
    "Backend Software Engineer",
  ],
  "Platform Engineering": ["Platform Engineer", "Infrastructure Engineer", "Site Reliability Engineer"],
  "Cloud Engineering": ["Cloud Engineer", "Cloud Solutions Engineer", "AWS Engineer"],
  "Solutions Engineering": ["Solutions Engineer", "Sales Engineer", "Customer Engineer"],
  "Solutions Architecture": ["Solutions Architect", "Cloud Solutions Architect"],
  "AI Product": [
    "AI Product Associate",
    "AI Product Analyst",
    "Product Associate AI",
    "GenAI Product Manager",
    "Technical Product Manager",
  ],
};

export function generateQueries(categories: string[], custom: string[] = []): string[] {
  const generated = categories.flatMap((c) => QUERIES_BY_CATEGORY[c] ?? []);
  return [...new Set([...custom.filter(Boolean), ...generated])];
}

/** Location priority for UK searching. */
export function searchLocations(preferred: string[], allowUkWide = true): string[] {
  const base = preferred.length > 0 ? preferred : ["London"];
  const list = [...base];
  if (allowUkWide) list.push("United Kingdom");
  return [...new Set(list)];
}
