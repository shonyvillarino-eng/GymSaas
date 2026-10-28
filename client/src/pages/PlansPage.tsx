import { EmptyState } from '../components/ui/states';

export function PlansPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Plans</h2>
        <p className="text-muted-foreground">
          Membership plans and pricing tiers — coming in the plans feature stage.
        </p>
      </div>
      <EmptyState
        title="No plans configured"
        message="Define membership plans and assign them to members here."
      />
    </div>
  );
}