import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, Pencil, Plus, Search } from 'lucide-react';
import { MEMBER_STATUSES, type MemberStatus } from '@gym-saas/shared';
import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api } from '../lib/api';
import {
  formatDate,
  formatDocument,
  statusBadge,
  statusLabel,
  type InstructorOption,
  type MemberRow,
  type PagedMembers,
} from '../lib/members';

const MEMBERSHIP_FILTERS = [
  ['all', 'Any membership'],
  ['ACTIVE', 'Active membership'],
  ['PAST_DUE', 'Past due'],
  ['NONE', 'No membership'],
] as const;

export function GymMembersPage() {
  const [result, setResult] = useState<PagedMembers | null>(null);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | MemberStatus>('all');
  const [membership, setMembership] = useState<(typeof MEMBERSHIP_FILTERS)[number][0]>('all');
  const [instructor, setInstructor] = useState('all');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: '10',
        search,
        status,
        membership,
        instructor,
        order,
      });
      setResult(await api<PagedMembers>(`/members?${query}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load members');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, membership, instructor, order]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ data: InstructorOption[] }>('/gym/instructors')
      .then((result) => setInstructors(result.data))
      .catch(() => setInstructors([]));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">GYM ADMINISTRATION</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Members</h2>
          <p className="text-muted-foreground">
            {result ? `${result.meta.total} registered member${result.meta.total === 1 ? '' : 's'}` : 'Member directory of this gym.'}
          </p>
        </div>
        <Link to="/gym/members/new">
          <Button className="px-4 py-2">
            <Plus className="h-4 w-4" /> Register member
          </Button>
        </Link>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center">
          <div className="relative w-full xl:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="input pl-9"
              placeholder="Search by name, email or document"
              aria-label="Search members"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-auto"
              aria-label="Filter by status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as 'all' | MemberStatus);
                setPage(1);
              }}
            >
              <option value="all">Any status</option>
              {MEMBER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              aria-label="Filter by membership"
              value={membership}
              onChange={(event) => {
                setMembership(event.target.value as typeof membership);
                setPage(1);
              }}
            >
              {MEMBERSHIP_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              aria-label="Filter by instructor"
              value={instructor}
              onChange={(event) => {
                setInstructor(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">Any instructor</option>
              <option value="none">Without instructor</option>
              {instructors.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.fullName}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => setOrder((current) => (current === 'desc' ? 'asc' : 'desc'))}
              className="px-3 py-2"
              title="Sort by join date"
            >
              Join date {order === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={() => void load()} className="px-3 py-2">
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading members…" />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : !result?.data.length ? (
          <div className="p-12 text-center">
            <p className="font-medium">No members found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || status !== 'all' || membership !== 'all' || instructor !== 'all'
                ? 'Try changing the search or filters.'
                : 'Register the first member of this gym to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Document</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Membership</th>
                  <th className="px-4 py-3 font-medium">Instructor</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row: MemberRow) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link className="font-medium hover:text-primary" to={`/gym/members/${row.id}`}>
                        {row.fullName}
                      </Link>
                      {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDocument(row)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.phone ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.joinDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.membership ? (
                        <div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              row.membership.expired || row.membership.status === 'EXPIRED'
                                ? 'bg-destructive/10 text-destructive'
                                : row.membership.status === 'ACTIVE'
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {row.membership.expired && row.membership.status === 'ACTIVE'
                              ? 'Past due'
                              : row.membership.status}
                          </span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.membership.planName} · until {formatDate(row.membership.endDate)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{row.instructor?.fullName ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link className="btn-ghost p-2" aria-label={`View ${row.fullName}`} to={`/gym/members/${row.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link className="btn-ghost p-2" aria-label={`Edit ${row.fullName}`} to={`/gym/members/${row.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && result && result.data.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={result.meta.page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="px-2 py-1.5"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {result.meta.page} of {result.meta.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={result.meta.page >= result.meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="px-2 py-1.5"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
