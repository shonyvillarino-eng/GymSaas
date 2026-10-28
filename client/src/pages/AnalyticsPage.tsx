import { EmptyState } from '../components/ui/states';

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="text-muted-foreground">
          Charts powered by Recharts will be wired in the analytics stage.
        </p>
      </div>
      <EmptyState
        title="Analytics coming soon"
        message="Revenue, attendance and membership trends rendered with Recharts."
      />
    </div>
  );
}