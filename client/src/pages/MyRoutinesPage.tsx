import { useEffect, useState } from 'react';
import { ChevronDown, Dumbbell, Info, UserRound } from 'lucide-react';

import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { RoutineDocument } from '../components/routines/RoutineDocument';
import { api, apiErrorMessage } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/members';
import { formatDayRange, routineBadge, routineStatusLabel, type Routine } from '../lib/routines';

/**
 * Member view: read-only access to the routines assigned to them.
 * There is no editing surface here — the API exposes no write endpoint for
 * members either.
 */
export function MyRoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openArchived, setOpenArchived] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api<{ data: Routine[] }>('/routines/me')
      .then((response) => alive && setRoutines(response.data))
      .catch((cause) => alive && setError(apiErrorMessage(cause)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <LoadingState label="Loading your routines…" />;
  if (error) return <ErrorState title="Routines unavailable" message={error} />;

  const active = routines.filter((routine) => routine.status === 'ACTIVE');
  const archived = routines.filter((routine) => routine.status !== 'ACTIVE');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-sm font-medium text-primary">MY TRAINING</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">My routines</h1>
        <p className="text-sm text-muted-foreground">
          Prescriptions prepared by your instructor. They are read-only: only the instructor who built them can change
          weights, repetitions or exercises.
        </p>
      </header>

      {routines.length === 0 ? (
        <EmptyState
          title="No routine assigned yet"
          message="When your instructor assigns a routine it will appear here, with every session and exercise."
        />
      ) : (
        <>
          {active.length === 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              You have no active routine right now. Your previous routines stay available below.
            </p>
          )}

          {active.map((routine) => (
            <article key={routine.id} className="surface-card overflow-hidden">
              <header className="border-b border-border p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${routineBadge(routine.status)}`}>
                      {routineStatusLabel(routine.status)}
                    </span>
                    <h2 className="mt-2 text-xl font-semibold">{routine.name}</h2>
                    {routine.description && <p className="mt-1 text-sm text-muted-foreground">{routine.description}</p>}
                  </div>
                  <Dumbbell className="h-6 w-6 text-primary" />
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <UserRound className="h-3 w-3" /> Instructor
                    </dt>
                    <dd className="mt-0.5 font-medium">{routine.instructor?.fullName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Dates</dt>
                    <dd className="mt-0.5 font-medium">{formatDayRange(routine.startDate, routine.endDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Last update</dt>
                    <dd className="mt-0.5 font-medium">{formatDate(routine.updatedAt)}</dd>
                  </div>
                </dl>
                {routine.notes && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{routine.notes}</p>}
              </header>
              <div className="p-4 sm:p-5">
                <RoutineDocument days={routine.days ?? []} emptyMessage="Your instructor has not added exercises yet." />
              </div>
            </article>
          ))}

          {archived.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Previous routines</h2>
              {archived.map((routine) => (
                <article key={routine.id} className="surface-card overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-muted/40"
                    onClick={() => setOpenArchived((current) => (current === routine.id ? null : routine.id))}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{routine.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {routineStatusLabel(routine.status)} · {formatDayRange(routine.startDate, routine.endDate)} · updated{' '}
                        {formatDateTime(routine.updatedAt)}
                      </p>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${openArchived === routine.id ? 'rotate-180' : ''}`} />
                  </button>
                  {openArchived === routine.id && (
                    <div className="border-t border-border p-4">
                      <RoutineDocument days={routine.days ?? []} />
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}
        </>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4" />
        Only your instructor can modify a routine; your gym administrator can supervise it.
      </p>
    </div>
  );
}
