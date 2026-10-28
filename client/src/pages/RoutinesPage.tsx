import { EmptyState } from '../components/ui/states';

export function RoutinesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Routines</h2>
        <p className="text-muted-foreground">
          Workout routines, exercise tracking and instructor assignments.
        </p>
      </div>
      <EmptyState
        title="No routines yet"
        message="Create and assign workout routines to members in the routines feature stage."
      />
    </div>
  );
}