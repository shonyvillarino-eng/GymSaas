import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Dumbbell, Plus, Search, Trash2, X } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import {
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
  formatPrescription,
  routineBadge,
  routineStatusLabel,
  type Exercise,
  type ExercisePage,
  type Routine,
} from '../lib/routines';

interface EntryDraft {
  key: string;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: string[];
  sets: number;
  reps: string;
  restSeconds: number;
  weightKg: string;
  tempo: string;
  instructions: string;
  notes: string;
}

interface DayDraft {
  key: string;
  name: string;
  description: string;
  restDay: boolean;
  exercises: EntryDraft[];
}

interface MemberOption {
  id: string;
  fullName: string;
}

interface Props {
  scope: 'gym' | 'instructor';
  basePath: string;
}

const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k-${Math.random().toString(36).slice(2)}`);

const emptyDay = (index: number): DayDraft => ({
  key: newKey(),
  name: `Day ${index + 1}`,
  description: '',
  restDay: false,
  exercises: [],
});

/**
 * Routine builder: routine → sessions → exercises.
 * Session and exercise order is defined by their position in this document, so
 * reordering is persisted exactly as shown in the preview.
 */
export function RoutineBuilderPage({ scope, basePath }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [days, setDays] = useState<DayDraft[]>([emptyDay(0)]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'draft' | 'activate' | ''>('');
  const [routineStatus, setRoutineStatus] = useState<string>('DRAFT');

  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogGroup, setCatalogGroup] = useState('all');

  useEffect(() => {
    let alive = true;
    const request =
      scope === 'gym'
        ? api<{ data: Array<{ id: string; fullName: string }> }>('/members?page=1&pageSize=100&status=all').then((response) =>
            response.data.map((row) => ({ id: row.id, fullName: row.fullName })),
          )
        : api<{ data: Array<{ id: string; fullName: string }> }>('/instructors/me/members?page=1&pageSize=100').then((response) =>
            response.data.map((row) => ({ id: row.id, fullName: row.fullName })),
          );
    void request.then((rows) => alive && setMembers(rows)).catch(() => alive && setMembers([]));
    return () => {
      alive = false;
    };
  }, [scope]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    void api<{ data: Routine }>(`/routines/${id}`)
      .then(({ data }) => {
        if (!alive) return;
        setName(data.name);
        setDescription(data.description ?? '');
        setMemberId(data.member?.id ?? '');
        setStartDate(data.startDate ? data.startDate.slice(0, 10) : '');
        setEndDate(data.endDate ? data.endDate.slice(0, 10) : '');
        setNotes(data.notes ?? '');
        setRoutineStatus(data.status);
        setDays(
          (data.days ?? []).map((day) => ({
            key: day.id,
            name: day.name,
            description: day.description ?? '',
            restDay: day.restDay,
            exercises: day.exercises.map((entry) => ({
              key: entry.id,
              exerciseId: entry.exercise.id,
              name: entry.exercise.name,
              muscleGroup: entry.exercise.muscleGroup,
              equipment: entry.exercise.equipment,
              sets: entry.sets,
              reps: entry.reps,
              restSeconds: entry.restSeconds,
              weightKg: entry.weightKg ? String(Number(entry.weightKg)) : '',
              tempo: entry.tempo ?? '',
              instructions: entry.instructions ?? '',
              notes: entry.notes ?? '',
            })),
          })),
        );
        if ((data.days ?? []).length === 0) setDays([emptyDay(0)]);
      })
      .catch((cause) => alive && setLoadError(apiErrorMessage(cause)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const query = new URLSearchParams({ page: '1', pageSize: '40', status: 'active', muscleGroup: catalogGroup });
      if (catalogSearch.trim()) query.set('search', catalogSearch.trim());
      const response = await api<ExercisePage>(`/exercises?${query.toString()}`);
      setCatalog(response.data);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogSearch, catalogGroup]);

  useEffect(() => {
    if (!pickerFor) return;
    const timer = setTimeout(() => void loadCatalog(), 250);
    return () => clearTimeout(timer);
  }, [pickerFor, loadCatalog]);

  const updateDay = (dayKey: string, changes: Partial<DayDraft>) =>
    setDays((current) => current.map((day) => (day.key === dayKey ? { ...day, ...changes } : day)));

  const moveDay = (index: number, direction: -1 | 1) =>
    setDays((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });

  const updateEntry = (dayKey: string, entryKey: string, changes: Partial<EntryDraft>) =>
    setDays((current) =>
      current.map((day) =>
        day.key === dayKey
          ? { ...day, exercises: day.exercises.map((entry) => (entry.key === entryKey ? { ...entry, ...changes } : entry)) }
          : day,
      ),
    );

  const moveEntry = (dayKey: string, index: number, direction: -1 | 1) =>
    setDays((current) =>
      current.map((day) => {
        if (day.key !== dayKey) return day;
        const target = index + direction;
        if (target < 0 || target >= day.exercises.length) return day;
        const exercises = [...day.exercises];
        const [item] = exercises.splice(index, 1);
        if (!item) return day;
        exercises.splice(target, 0, item);
        return { ...day, exercises };
      }),
    );

  const addExercise = (dayKey: string, exercise: Exercise) => {
    setDays((current) =>
      current.map((day) =>
        day.key === dayKey
          ? {
              ...day,
              exercises: [
                ...day.exercises,
                {
                  key: newKey(),
                  exerciseId: exercise.id,
                  name: exercise.name,
                  muscleGroup: exercise.muscleGroup,
                  equipment: exercise.equipment,
                  sets: 3,
                  reps: '10',
                  restSeconds: 60,
                  weightKg: '',
                  tempo: '',
                  instructions: '',
                  notes: '',
                },
              ],
            }
          : day,
      ),
    );
    setPickerFor(null);
  };

  const save = async (activate: boolean) => {
    setError('');
    if (name.trim().length < 3) {
      setError('Give the routine a name of at least 3 characters.');
      return;
    }
    if (!memberId) {
      setError('Choose the member this routine is for.');
      return;
    }
    if (!startDate) {
      setError('Set the date the routine starts.');
      return;
    }
    if (days.some((day) => !day.name.trim())) {
      setError('Every session needs a name.');
      return;
    }
    if (!days.some((day) => day.exercises.length > 0)) {
      setError('Add at least one exercise to the routine.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('The end date cannot be before the start date.');
      return;
    }

    setSaving(activate ? 'activate' : 'draft');
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        memberId,
        startDate,
        endDate: endDate || null,
        notes: notes.trim() || null,
        days: days.map((day) => ({
          name: day.name.trim(),
          description: day.description.trim() || null,
          restDay: day.restDay,
          exercises: day.exercises.map((entry) => ({
            exerciseId: entry.exerciseId,
            sets: entry.sets,
            reps: entry.reps.trim(),
            restSeconds: entry.restSeconds,
            weightKg: entry.weightKg === '' ? null : Number(entry.weightKg),
            tempo: entry.tempo.trim() || null,
            instructions: entry.instructions.trim() || null,
            notes: entry.notes.trim() || null,
          })),
        })),
        ...(activate ? { activate: true } : {}),
      };

      const response = editing
        ? await api<{ data: Routine }>(`/routines/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await api<{ data: Routine }>('/routines', { method: 'POST', body: JSON.stringify(body) });
      navigate(`${basePath}/routines/${response.data.id}`, {
        state: { notice: activate ? 'Routine saved and activated for the member.' : 'Routine saved as draft.' },
      });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving('');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  if (loading) return <LoadingState label="Loading routine…" />;
  if (loadError) return <ErrorState title="Routine unavailable" message={loadError} />;

  const pickerDay = days.find((day) => day.key === pickerFor) ?? null;

  return (
    <form onSubmit={submit} className="space-y-5">
      <Link to={`${basePath}/routines`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All routines
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">{editing ? 'EDIT ROUTINE' : 'NEW ROUTINE'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{editing ? name || 'Routine' : 'Build a routine'}</h1>
          <p className="text-sm text-muted-foreground">Routine → sessions → exercises. The order you set here is the order the member sees.</p>
        </div>
        {editing && (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${routineBadge(routineStatus)}`}>
            {routineStatusLabel(routineStatus)}
          </span>
        )}
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="surface-card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Routine name" required minLength={3} maxLength={140} value={name} onChange={(event) => setName(event.target.value)} />
          <label>
            <span className="label">Member</span>
            <select className="input" required value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              <option value="">Choose a member…</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
            </select>
            {members.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {scope === 'instructor'
                  ? 'You have no assigned members yet. Ask the gym administrator for an assignment.'
                  : 'This gym has no members yet.'}
              </p>
            )}
          </label>
          <Input label="Start date" type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input label="End date (optional)" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <label className="sm:col-span-2">
            <span className="label">Description</span>
            <textarea className="input min-h-20" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className="label">Observations</span>
            <textarea className="input min-h-20" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Sessions</h2>
          <Button type="button" variant="outline" className="px-3 py-2" onClick={() => setDays((current) => [...current, emptyDay(current.length)])}>
            <Plus className="h-4 w-4" /> Add session
          </Button>
        </div>

        {days.map((day, dayIndex) => (
          <article key={day.key} className="surface-card p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="mt-2 text-xs font-semibold text-muted-foreground">#{dayIndex + 1}</span>
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Session name"
                  required
                  maxLength={140}
                  value={day.name}
                  onChange={(event) => updateDay(day.key, { name: event.target.value })}
                />
                <Input
                  label="Description (optional)"
                  maxLength={500}
                  value={day.description}
                  onChange={(event) => updateDay(day.key, { description: event.target.value })}
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="mr-2 flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={day.restDay} onChange={(event) => updateDay(day.key, { restDay: event.target.checked })} />
                  Rest day
                </label>
                <Button type="button" variant="ghost" className="p-2" aria-label="Move session up" disabled={dayIndex === 0} onClick={() => moveDay(dayIndex, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" className="p-2" aria-label="Move session down" disabled={dayIndex === days.length - 1} onClick={() => moveDay(dayIndex, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="p-2 text-destructive"
                  aria-label="Remove session"
                  disabled={days.length === 1}
                  onClick={() => {
                    if (window.confirm('Remove this session and its exercises?')) {
                      setDays((current) => current.filter((item) => item.key !== day.key));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {day.exercises.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No exercises in this session yet.</p>
              )}
              {day.exercises.map((entry, entryIndex) => (
                <div key={entry.key} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span className="mr-2 text-xs text-muted-foreground">{entryIndex + 1}.</span>
                        {entry.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {MUSCLE_GROUP_LABELS[entry.muscleGroup] ?? entry.muscleGroup}
                        {entry.equipment.length > 0 ? ` · ${entry.equipment.join(', ')}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" className="p-1.5" aria-label="Move exercise up" disabled={entryIndex === 0} onClick={() => moveEntry(day.key, entryIndex, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" className="p-1.5" aria-label="Move exercise down" disabled={entryIndex === day.exercises.length - 1} onClick={() => moveEntry(day.key, entryIndex, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="p-1.5 text-destructive"
                        aria-label="Remove exercise"
                        onClick={() => updateDay(day.key, { exercises: day.exercises.filter((item) => item.key !== entry.key) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Input label="Sets" type="number" min={1} max={30} value={entry.sets} onChange={(event) => updateEntry(day.key, entry.key, { sets: Number(event.target.value) })} />
                    <Input label="Repetitions" value={entry.reps} placeholder="8-12" onChange={(event) => updateEntry(day.key, entry.key, { reps: event.target.value })} />
                    <Input label="Rest (s)" type="number" min={0} max={3600} value={entry.restSeconds} onChange={(event) => updateEntry(day.key, entry.key, { restSeconds: Number(event.target.value) })} />
                    <Input label="Weight (kg)" type="number" min={0} step="0.5" value={entry.weightKg} onChange={(event) => updateEntry(day.key, entry.key, { weightKg: event.target.value })} />
                    <Input label="Tempo" value={entry.tempo} placeholder="3-1-2" maxLength={20} onChange={(event) => updateEntry(day.key, entry.key, { tempo: event.target.value })} />
                    <Input label="Notes" value={entry.notes} maxLength={500} onChange={(event) => updateEntry(day.key, entry.key, { notes: event.target.value })} />
                  </div>
                  <Input
                    label="Particular instructions"
                    className="mt-3"
                    maxLength={500}
                    value={entry.instructions}
                    placeholder="Keep the shoulder blades retracted…"
                    onChange={(event) => updateEntry(day.key, entry.key, { instructions: event.target.value })}
                  />
                </div>
              ))}

              <Button type="button" variant="outline" className="w-full px-3 py-2" onClick={() => { setPickerFor(day.key); setCatalogSearch(''); setCatalogGroup('all'); }}>
                <Plus className="h-4 w-4" /> Add exercise to “{day.name || `session ${dayIndex + 1}`}”
              </Button>
            </div>
          </article>
        ))}
      </section>

      {pickerDay && (
        <section className="surface-card space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Exercise catalog</h2>
              <p className="text-sm text-muted-foreground">Adding to “{pickerDay.name}”.</p>
            </div>
            <button type="button" className="btn-ghost p-1.5" aria-label="Close catalog" onClick={() => setPickerFor(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input pl-9" placeholder="Search exercise" aria-label="Search catalog" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} />
            </label>
            <select className="input" aria-label="Filter catalog by muscle group" value={catalogGroup} onChange={(event) => setCatalogGroup(event.target.value)}>
              <option value="all">Any muscle group</option>
              {MUSCLE_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {MUSCLE_GROUP_LABELS[group]}
                </option>
              ))}
            </select>
          </div>
          {catalogLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading catalog…</p>
          ) : catalog.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No exercises found. Add them in the{' '}
              <Link className="text-primary hover:underline" to={`${basePath}/exercises`}>
                exercise catalog
              </Link>
              .
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {catalog.map((exercise) => (
                <li key={exercise.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{exercise.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {MUSCLE_GROUP_LABELS[exercise.muscleGroup] ?? exercise.muscleGroup}
                      {exercise.equipment.length > 0 ? ` · ${exercise.equipment.join(', ')}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => addExercise(pickerDay.key, exercise)}
                    disabled={pickerDay.exercises.some((entry) => entry.exerciseId === exercise.id)}
                  >
                    <Dumbbell className="h-3.5 w-3.5" />
                    {pickerDay.exercises.some((entry) => entry.exerciseId === exercise.id) ? 'Added' : 'Add'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {days.length > 0 && days.some((day) => day.exercises.length > 0) && (
        <section className="surface-card p-5">
          <h2 className="font-semibold">Preview</h2>
          <p className="mb-3 text-sm text-muted-foreground">The member will see exactly this prescription.</p>
          <div className="space-y-3">
            {days.map((day, index) => (
              <div key={day.key}>
                <p className="text-sm font-medium">
                  Session {index + 1} · {day.name}
                </p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {day.exercises.length === 0 ? (
                    <li>No exercises.</li>
                  ) : (
                    day.exercises.map((entry) => (
                      <li key={entry.key}>
                        {entry.name} — {formatPrescription({ ...entry, weightKg: entry.weightKg || null })}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 p-3 backdrop-blur">
        <Link to={`${basePath}/routines`}>
          <Button type="button" variant="ghost" className="px-4 py-2">
            Cancel
          </Button>
        </Link>
        <Button type="submit" variant="outline" className="px-4 py-2" loading={saving === 'draft'} disabled={Boolean(saving)}>
          Save
        </Button>
        <Button type="button" className="px-4 py-2" loading={saving === 'activate'} disabled={Boolean(saving)} onClick={() => void save(true)}>
          Save and activate
        </Button>
      </div>
    </form>
  );
}
