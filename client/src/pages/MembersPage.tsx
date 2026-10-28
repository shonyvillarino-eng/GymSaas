import { EmptyState } from '../components/ui/states';

export function MembersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Members</h2>
        <p className="text-muted-foreground">
          Member management will be implemented in the members feature stage.
        </p>
      </div>
      <EmptyState
        title="Not implemented yet"
        message="The member directory, plans, assignments and billing history will surface here once the backend modules are in place."
      />
    </div>
  );
}