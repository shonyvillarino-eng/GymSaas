import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Dumbbell, Plus, Search } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { formatDate } from '../lib/members';
import { routineBadge, routineStatusLabel, type Routine, type RoutinePage } from '../lib/routines';

interface Option {
  id: string;
  fullName: string;
}

interface Props {
  scope: 'gym' | 'instructor';
  basePath: string;
}

const STATUS_OPTIONS = [
  ['all', 'Any status'],
  ['ACTIVE', 'Active'],
  ['DRAFT', 'Draft'],
  ['ARCHIVED', 'Archived'],
] as const;

/** Routine listing shared by the gym administrator and the instructor panel. */
export function RoutinesListPage({ scope, basePath }: Props) {
  const [result, setResult] = useState<RoutinePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [memberId, setMemberId] = useState('all');
  const [instructorId, setInstructorId] = useState('all');
  const [members, setMembers] = useState<Option[]>([]);
  const [instructors, setInstructors] = useState<Option[]>([]);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '12', status });
      if (search.trim()) query.set('search', search.trim());
      if (memberId !== 'all') query.set('memberId', memberId);
      if (instructorId !== 'all') query.set('instructorId', instructorId);
      setResult(await api<RoutinePage>(`/routines?${query.toString()}`));
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, search, status, memberId, instructorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    const membersRequest =
      scope === 'gym'
        ? api<{ data: Array<{ id: string; fullName: string }> }>('/members?page=1&pageSize=100&status=all').then((response) =>
            response.data.map((row) => ({ id: row.id, fullName: row.fullName })),
          )
        : api<{ data: Array<{ id: string; fullName: string }> }>('/instructors/me/members?page=1&pageSize=100').then((response) =>
            response.data.map((row) => ({ id: row.id, fullName: row.fullName })),
          );
    void membersRequest.then((rows) => alive && setMembers(rows)).catch(() => alive && setMembers([]));
    if (scope === 'gym') {
      void api<{ data: Array<{ id: string; fullName: string }> }>('/gym/instructors')
        .then((response) => alive && setInstructors(response.data))
        .catch(() => alive && setInstructors([]));
    }
    return () => {
      alive = false;
    };
  }, [scope]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">{scope === 'gym' ? 'GYM ADMINISTRATION' : 'INSTRUCTOR WORKSPACE'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Routines</h1>
          <p className="text-sm text-muted-foreground">
            {scope === 'gym'
              ? 'Every routine of this gym, with the member, the responsible instructor and its history.'
              : 'Routines of the members assigned to you. Each member keeps one active routine.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`${basePath}/exercises`} className="btn-outline px-4 py-2">
            <Dumbbell className="h-4 w-4" /> Exercise catalog
          </Link>
          <Link to={`${basePath}/routines/new`}>
            <Button className="px-4 py-2">
              <Plus className="h-4 w-4" /> New routine
            </Button>
          </Link>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="surface-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            placeholder="Search by routine name"
            aria-label="Search routines"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <select className="input" aria-label="Filter by status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Filter by member" value={memberId} onChange={(event) => { setPage(1); setMemberId(event.target.value); }}>
          <option value="all">Any member</option>
          {members.map((option) => (
            <option key={option.id} value={option.id}>
              {option.fullName}
            </option>
          ))}
        </select>
        {scope === 'gym' && (
          <select className="input" aria-label="Filter by instructor" value={instructorId} onChange={(event) => { setPage(1); setInstructorId(event.target.value); }}>
            <option value="all">Any instructor</option>
            {instructors.map((option) => (
              <option key={option.id} value={option.id}>
                {option.fullName}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="surface-card overflow-hidden">
        {loading ? (
          <LoadingState label="Loading routines…" />
        ) : !result?.data.length ? (
          <div className="p-10 text-center">
            <p className="font-medium">No routines found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || status !== 'all' || memberId !== 'all' || instructorId !== 'all'
                ? 'Try changing the search or filters.'
                : 'Build the first routine for one of your members.'}
            </p>
            <Link to={`${basePath}/routines/new`} className="mt-4 inline-block">
              <Button className="px-4 py-2">
                <Plus className="h-4 w-4" /> New routine
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    {['Routine', 'Member', 'Instructor', 'Sessions', 'Status', 'Updated'].map((header) => (
                      <th key={header} className="px-4 py-3 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((routine: Routine) => (
                    <tr key={routine.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link className="font-medium hover:text-primary" to={`${basePath}/routines/${routine.id}`}>
                          {routine.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">v{routine.version} · {routine.author ?? 'System'}</p>
                      </td>
                      <td className="px-4 py-3">{routine.member?.fullName ?? '—'}</td>
                      <td className="px-4 py-3">{routine.instructor?.fullName ?? '—'}</td>
                      <td className="px-4 py-3">{routine.dayCount}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${routineBadge(routine.status)}`}>
                          {routineStatusLabel(routine.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(routine.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-xs text-muted-foreground">
                {result.meta.total} routine(s) · page {result.meta.page} of {result.meta.totalPages}
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
