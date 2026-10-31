import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  hint?: string;
}

export function StatCard({ title, value, icon: Icon, trend, hint }: StatCardProps) {
  return (
    <div className="surface-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {trend && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              trend.positive
                ? 'bg-primary/10 text-primary'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}