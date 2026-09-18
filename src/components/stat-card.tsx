import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "urgent" | "positive";
}

export function StatCard({ icon: Icon, label, value, hint, tone = "default" }: Props) {
  return (
    <div className="surface surface-hover p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            tone === "urgent"
              ? "border-warning/30 bg-warning/10 text-warning"
              : tone === "positive"
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-elevated text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}
