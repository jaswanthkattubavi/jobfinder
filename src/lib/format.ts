import type { Job } from "./types";

export function formatSalary(job: Pick<Job, "salaryMin" | "salaryMax" | "currency">): string {
  if (job.salaryMin === undefined && job.salaryMax === undefined) return "Salary not listed";
  const fmt = (n: number) => `£${Math.round(n / 1000)}k`;
  if (job.salaryMin !== undefined && job.salaryMax !== undefined)
    return `${fmt(job.salaryMin)}–${fmt(job.salaryMax)}`;
  return fmt((job.salaryMin ?? job.salaryMax)!);
}

export function daysBetween(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function formatPosted(iso: string): string {
  const days = daysBetween(iso);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 7) return `Posted ${days} days ago`;
  const weeks = Math.round(days / 7);
  return `Posted ${weeks} week${weeks > 1 ? "s" : ""} ago`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}
