import { cn } from "@/lib/utils";

interface Props {
  value: number;
  label?: string;
  size?: number;
  className?: string;
}

export function ScoreRing({ value, label, size = 64, className }: Props) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, value)) / 100);
  const stroke =
    value >= 90 ? "var(--color-warning)" : value >= 80 ? "var(--color-primary)" : "var(--color-info)";

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <svg width={size} height={size} role="img" aria-label={`${label ?? "Score"} ${value}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={5}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)" }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-foreground font-semibold"
          style={{ fontSize: size / 3.4 }}
        >
          {value}
        </text>
      </svg>
      {label ? <span className="text-[11px] text-muted-foreground">{label}</span> : null}
    </div>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
