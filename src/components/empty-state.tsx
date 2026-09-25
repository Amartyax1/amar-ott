import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-muted ring-1 ring-white/10">
        <Icon className="size-6 text-muted-foreground" />
      </span>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      {children ? <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
