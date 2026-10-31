import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, X } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState, ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { EXERCISE_TYPE_LABELS, MUSCLE_GROUP_LABELS, MUSCLE_GROUPS, type Exercise, type ExercisePage } from '../lib/routines';

const EXERCISE_TYPES = ['STRENGTH', 'CARDIO', 'FLEXIBILITY', 'BALANCE', 'PLYOMETRICS', 'OTHER'] as const;

interface FormState {
  id: string | null;
  name: string;
  muscleGroup: string;
  exerciseType: string;
  equipment: string;
  instructions: string;
  imageUrl: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  muscleGroup: 'CHEST',
  exerciseType: 'STRENGTH',
  equipment: '',
  instructions: '',
  imageUrl: '',
  isActive: true,
};

/** Gym exercise catalog. Administrators and instructors share the same screens. */
export function ExerciseCatalogPage() {
  const [result, setResult] = useState<ExercisePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20', muscleGroup, status });
      if (search.trim()) query.set('search', search.trim());
      if (equipment !== 'all') query.set('equipment', equipment);
      setResult(await api<ExercisePage>(`/exercises?${query.toString()}`));
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, search, muscleGroup, equipment, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError('');
    try {
      const body = {
        name: form.name.trim(),
        muscleGroup: form.muscleGroup,
        exerciseType: form.exerciseType,
        equipment: form.equipment
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        instructions: form.instructions.trim(),
        imageUrl: form.imageUrl.trim(),
      };
      if (form.id) {
        await api(`/exercises/${form.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, isActive: form.isActive }) });
        setNotice('Exercise updated.');
      } else {
        await api('/exercises', { method: 'POST', body: JSON.stringify(body) });
        setNotice('Exercise added to the catalog.');
      }
      setForm(null);
      await load();
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (exercise: Exercise) => {
    const action = exercise.isActive ? 'Deactivate' : 'Reactivate';
    if (!window.confirm(`${action} "${exercise.name}"? Existing routines keep referencing it; it just stops being available for new routines.`)) return;
    setError('');
    try {
      await api(`/exercises/${exercise.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !exercise.isActive }) });
      setNotice(`"${exercise.name}" ${exercise.isActive ? 'deactivated' : 'reactivated'}.`);
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">TRAINING</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Exercise catalog</h1>
          <p className="text-sm text-muted-foreground">
            Exercises available when building routines for this gym. Names are unique per gym.
          </p>
        </div>
        <Button className="px-4 py-2" onClick={() => { setForm({ ...EMPTY_FORM }); setFormError(''); }}>
          <Plus className="h-4 w-4" /> New exercise
        </Button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <SuccessState message={notice} />}

      {form && (
        <form onSubmit={submit} className="surface-card space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold">{form.id ? 'Edit exercise' : 'New exercise'}</h2>
            <button type="button" className="btn-ghost p-1.5" aria-label="Close" onClick={() => setForm(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              required
              minLength={2}
              maxLength={140}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <label>
              <span className="label">Muscle group</span>
              <select className="input" value={form.muscleGroup} onChange={(event) => setForm({ ...form, muscleGroup: event.target.value })}>
                {MUSCLE_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {MUSCLE_GROUP_LABELS[group]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Type</span>
              <select className="input" value={form.exerciseType} onChange={(event) => setForm({ ...form, exerciseType: event.target.value })}>
                {EXERCISE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EXERCISE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Equipment (comma separated)"
              value={form.equipment}
              placeholder="Barbell, Bench"
              onChange={(event) => setForm({ ...form, equipment: event.target.value })}
            />
            <Input
              label="Image URL (optional)"
              value={form.imageUrl}
              placeholder="https://…"
              onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
            />
            {form.id && (
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
                Available for new routines
              </label>
            )}
            <label className="sm:col-span-2">
              <span className="label">Execution instructions</span>
              <textarea
                className="input min-h-24"
                maxLength={2000}
                value={form.instructions}
                onChange={(event) => setForm({ ...form, instructions: event.target.value })}
              />
            </label>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="px-4 py-2" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button type="submit" className="px-4 py-2" loading={saving}>
              Save exercise
            </Button>
          </div>
        </form>
      )}

      <section className="surface-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            placeholder="Search exercise"
            aria-label="Search exercises"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <select
          className="input"
          aria-label="Filter by muscle group"
          value={muscleGroup}
          onChange={(event) => {
            setPage(1);
            setMuscleGroup(event.target.value);
          }}
        >
          <option value="all">Any muscle group</option>
          {MUSCLE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {MUSCLE_GROUP_LABELS[group]}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Filter by equipment"
          value={equipment}
          onChange={(event) => {
            setPage(1);
            setEquipment(event.target.value);
          }}
        >
          <option value="all">Any equipment</option>
          {(result?.equipment ?? []).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">Any status</option>
        </select>
      </section>

      <section className="surface-card overflow-hidden">
        {loading ? (
          <LoadingState label="Loading catalog…" />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : !result?.data.length ? (
          <EmptyState
            title="No exercises found"
            message={search || muscleGroup !== 'all' || equipment !== 'all' ? 'Try different filters.' : 'Add the first exercise of this gym.'}
            action={
              <Button className="px-4 py-2" onClick={() => setForm({ ...EMPTY_FORM })}>
                <Plus className="h-4 w-4" /> New exercise
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    {['Exercise', 'Muscle group', 'Equipment', 'Used in', 'Status', 'Actions'].map((header) => (
                      <th key={header} className="px-4 py-3 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((exercise) => (
                    <tr key={exercise.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{exercise.name}</p>
                        {exercise.instructions && (
                          <p className="max-w-md truncate text-xs text-muted-foreground">{exercise.instructions}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">{MUSCLE_GROUP_LABELS[exercise.muscleGroup] ?? exercise.muscleGroup}</td>
                      <td className="px-4 py-3 text-muted-foreground">{exercise.equipment.join(', ') || '—'}</td>
                      <td className="px-4 py-3">{exercise.usageCount} prescription(s)</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            exercise.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {exercise.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            className="px-2 py-1 text-xs"
                            onClick={() => {
                              setForm({
                                id: exercise.id,
                                name: exercise.name,
                                muscleGroup: exercise.muscleGroup,
                                exerciseType: exercise.exerciseType,
                                equipment: exercise.equipment.join(', '),
                                instructions: exercise.instructions ?? '',
                                imageUrl: exercise.imageUrl ?? '',
                                isActive: exercise.isActive,
                              });
                              setFormError('');
                              setNotice('');
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void toggleStatus(exercise)}>
                            {exercise.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-xs text-muted-foreground">
                {result.meta.total} exercise(s) · page {result.meta.page} of {result.meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" className="px-2 py-1.5" aria-label="Previous page" disabled={result.meta.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="px-2 py-1.5" aria-label="Next page" disabled={result.meta.page >= result.meta.totalPages || loading} onClick={() => setPage((value) => value + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
