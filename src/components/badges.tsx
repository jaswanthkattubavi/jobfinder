import { CheckCircle2, CircleHelp, Link2Off, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LinkStatus, SponsorshipStatus } from "@/lib/types";
import type { Priority } from "@/lib/services/scoring";

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function SponsorshipBadge({
  status,
  confidence,
  className,
}: {
  status: SponsorshipStatus;
  confidence: number;
  className?: string;
}) {
  const tone =
    status === "Confirmed"
      ? "border-success/30 bg-success/10 text-success"
      : status === "Likely"
        ? "border-primary/30 bg-primary/10 text-primary"
        : status === "Possible"
          ? "border-warning/30 bg-warning/10 text-warning"
          : status === "Unclear"
            ? "border-border bg-muted text-muted-foreground"
            : "border-destructive/30 bg-destructive/10 text-destructive";

  const Icon =
    status === "Confirmed"
      ? ShieldCheck
      : status === "No Sponsorship" || status === "Unlikely"
        ? ShieldX
        : ShieldQuestion;

  return (
    <span className={cn(chip, tone, className)} aria-label={`Sponsorship ${status}, ${confidence}% confidence`}>
      <Icon className="size-3.5" aria-hidden />
      {status} · {confidence}%
    </span>
  );
}

export function LinkStatusBadge({ status }: { status: LinkStatus }) {
  const tone =
    status === "Live"
      ? "border-success/30 bg-success/10 text-success"
      : status === "Possibly Live"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-border bg-muted text-muted-foreground";
  const Icon = status === "Live" ? CheckCircle2 : status === "Broken Link" ? Link2Off : CircleHelp;
  return (
    <span className={cn(chip, tone)}>
      <Icon className="size-3.5" aria-hidden />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone =
    priority === "Apply ASAP"
      ? "border-warning/40 bg-warning/15 text-warning"
      : priority === "Strong Match"
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-border bg-muted text-muted-foreground";
  return <span className={cn(chip, tone)}>{priority}</span>;
}

export function DemoBadge() {
  return (
    <span className={cn(chip, "border-info/30 bg-info/10 text-info uppercase tracking-wide")}>
      Demo
    </span>
  );
}

export function SkillChip({ tone = "muted", children }: { tone?: "match" | "miss" | "partial" | "muted"; children: React.ReactNode }) {
  const tones = {
    match: "border-success/30 bg-success/10 text-success",
    miss: "border-destructive/30 bg-destructive/10 text-destructive",
    partial: "border-warning/30 bg-warning/10 text-warning",
    muted: "border-border bg-muted text-muted-foreground",
  } as const;
  return <span className={cn(chip, tones[tone])}>{children}</span>;
}
