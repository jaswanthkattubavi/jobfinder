interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: Props) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function SectionHeading({
  title,
  count,
  hint,
}: {
  title: string;
  count?: number;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {count !== undefined ? (
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
      ) : null}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
