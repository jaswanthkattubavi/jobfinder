/** Missing preserves the app default; invalid input fails closed. Zero disables paid analysis. */
export function aiAnalysisLimit(configured: string | undefined): number {
  if (configured === undefined) return 30;
  if (!/^\d+$/.test(configured.trim())) return 0;
  return Math.min(30, Number(configured));
}
