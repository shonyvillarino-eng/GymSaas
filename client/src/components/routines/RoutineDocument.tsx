import { Coffee, Dumbbell } from 'lucide-react';

import type { RoutineDayRecord, RoutineSnapshot } from '../../lib/routines';
import { formatPrescription } from '../../lib/routines';

type DayLike = Pick<RoutineDayRecord, 'name' | 'description' | 'restDay'> & {
  exercises: Array<{
    id?: string;
    exerciseOrder?: number;
    order?: number;
    sets: number;
    reps: string;
    restSeconds: number;
    weightKg: string | number | null;
    tempo: string | null;
    instructions: string | null;
    notes: string | null;
    exercise?: { id: string; name: string; muscleGroup: string; equipment: string[] };
    name?: string;
    muscleGroup?: string;
    equipment?: string[];
  }>;
};

interface Props {
  days: DayLike[];
  emptyMessage?: string;
}

/** Read-only rendering of a routine's sessions, shared by every role. */
export function RoutineDocument({ days, emptyMessage = 'This routine has no sessions yet.' }: Props) {
  if (days.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {days.map((day, index) => (
        <section key={`${day.name}-${index}`} className="surface-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <div>
              <h3 className="font-semibold">
                Session {index + 1} · {day.name}
              </h3>
              {day.description && <p className="text-sm text-muted-foreground">{day.description}</p>}
            </div>
            {day.restDay && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Coffee className="h-3 w-3" /> Rest day
              </span>
            )}
          </header>

          {day.exercises.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No exercises in this session.</p>
          ) : (
            <ul className="divide-y divide-border">
              {day.exercises.map((entry, entryIndex) => {
                const exercise = entry.exercise
                  ? entry.exercise
                  : {
                      name: entry.name ?? 'Exercise',
                      muscleGroup: entry.muscleGroup ?? '',
                      equipment: entry.equipment ?? [],
                    };
                return (
                  <li key={entry.id ?? `${exercise.name}-${entryIndex}`} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <span className="mr-2 text-xs text-muted-foreground">{entryIndex + 1}.</span>
                          {exercise.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[exercise.muscleGroup.replace(/_/g, ' ').toLowerCase(), exercise.equipment.join(', ')]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        <Dumbbell className="h-3 w-3" />
                        {formatPrescription({ ...entry, weightKg: entry.weightKg === null ? null : String(entry.weightKg) })}
                      </span>
                    </div>
                    {entry.instructions && <p className="mt-2 text-sm">{entry.instructions}</p>}
                    {entry.notes && <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** Same rendering for a historical version snapshot. */
export function SnapshotDocument({ snapshot }: { snapshot: RoutineSnapshot }) {
  return (
    <RoutineDocument
      days={snapshot.days.map((day) => ({
        name: day.name,
        description: day.description,
        restDay: day.restDay,
        exercises: day.exercises.map((entry) => ({
          order: entry.order,
          sets: entry.sets,
          reps: entry.reps,
          restSeconds: entry.restSeconds,
          weightKg: entry.weightKg,
          tempo: entry.tempo,
          instructions: entry.instructions,
          notes: entry.notes,
          name: entry.name,
          muscleGroup: entry.muscleGroup,
          equipment: entry.equipment,
        })),
      }))}
    />
  );
}
