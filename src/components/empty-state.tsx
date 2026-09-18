import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, message, action }: Props) {
  return (
    <div className="surface radar-glow flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-elevated">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
