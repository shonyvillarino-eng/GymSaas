import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  History,
  QrCode,
  ScanLine,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';

import { Button } from '../components/ui/Button';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState, LoadingState } from '../components/ui/states';
import { AccessDeniedPanel, AttendanceOutcome } from '../components/attendance/AttendancePanels';
import { ApiRequestError, api, apiErrorMessage } from '../lib/api';
import {
  MEMBERSHIP_STATE_LABELS,
  METHOD_LABELS,
  RESULT_LABELS,
  formatTime,
  resultBadge,
  type AttendanceRow,
  type AttendanceStats,
  type CheckInResult,
  type Eligibility,
} from '../lib/attendance';
import type { MemberStatus } from '@gym-saas/shared';
import { formatDate, formatDocument, statusBadge, statusLabel, type MemberRow, type PagedMembers } from '../lib/members';

/**
 * Reception desk: find a member, see why they can (or cannot) enter, and
 * record the entry. Nothing here decides access on its own — the eligibility
 * shown comes from the API and is re-evaluated server-side on registration.
 */
export function GymAttendancePage() {
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MemberRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [outcome, setOutcome] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statsError, setStatsError] = useState('');
  const searchInput = useRef<HTMLInputElement | null>(null);

  const loadStats = useCallback(async () => {
    setStatsError('');
    try {
      setStats((await api<{ data: AttendanceStats }>('/attendance/stats')).data);
    } catch (cause) {
      setStatsError(apiErrorMessage(cause));
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Debounced directory search (backend pagination, max 6 rows here).
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void api<PagedMembers>(`/members?page=1&pageSize=6&status=all&search=${encodeURIComponent(term)}`)
        .then((result) => {
          if (alive) setResults(result.data);
        })
        .catch(() => {
          if (alive) setResults([]);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search]);

  const selectMember = useCallback(async (memberId: string) => {
    setSelectedId(memberId);
    setOutcome(null);
    setError('');
    setEligibility(null);
    setLoadingEligibility(true);
    try {
      setEligibility((await api<{ data: Eligibility }>(`/attendance/eligibility?memberId=${memberId}`)).data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setSelectedId('');
    } finally {
      setLoadingEligibility(false);
    }
  }, []);

  const register = async (exceptionReason?: string) => {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ data: CheckInResult }>('/attendance/manual', {
        method: 'POST',
        body: JSON.stringify({ memberId: selectedId, ...(exceptionReason ? { exceptionReason } : {}) }),
      });
      setOutcome(result.data);
      setEligibility(null);
      setSelectedId('');
      setSearch('');
      setResults([]);
      void loadStats();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) {
        setError(cause.message);
      } else {
        setError(apiErrorMessage(cause));
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setOutcome(null);
    setError('');
    setSearch('');
    setResults([]);
    setSelectedId('');
    setEligibility(null);
    requestAnimationFrame(() => searchInput.current?.focus());
  };

  const membershipText = useMemo(() => {
    if (!eligibility) return '';
    if (!eligibility.membership) return 'No membership assigned';
    return `${eligibility.membership.planName} · until ${formatDate(eligibility.membership.endDate)}`;
  }, [eligibility]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">RECEPTION</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Record entries and check access rules. Everything is stored in the gym&apos;s database.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/gym/attendance/scan" className="btn-outline px-4 py-2">
            <ScanLine className="h-4 w-4" /> Scan QR
          </Link>
          <Link to="/gym/attendance/history" className="btn-outline px-4 py-2">
            <History className="h-4 w-4" /> Full history
          </Link>
        </div>
      </header>

      {statsError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {statsError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Entries today" value={stats?.today ?? '—'} icon={UserCheck} />
        <StatCard title="Last 7 days" value={stats?.last7Days ?? '—'} icon={CalendarDays} />
        <StatCard title="This month" value={stats?.thisMonth ?? '—'} icon={Users} />
        <StatCard title="Exceptions today" value={stats?.exceptionsToday ?? '—'} icon={AlertTriangle} />
      </div>

      {stats && stats.withoutValidMembership > 0 && (
        <Link
          to="/gym/members?membership=NONE"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <strong>{stats.withoutValidMembership}</strong> active member(s) have no membership in force right now.
          </span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}

      {outcome && <AttendanceOutcome attendance={outcome.attendance} onReset={reset} />}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="surface-card p-5 lg:col-span-3">
          <h2 className="mb-3 font-semibold">Who is entering?</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInput}
              className="input pl-9"
              placeholder="Search by name or document"
              aria-label="Search members"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (!event.target.value.trim()) {
                  setSelectedId('');
                  setEligibility(null);
                }
              }}
            />
          </div>

          {searching && <p className="mt-3 text-sm text-muted-foreground">Searching…</p>}

          {!searching && search.trim().length >= 2 && results.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">No member matches “{search.trim()}”.</p>
          )}

          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => void selectMember(row.id)}
                    className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/60 ${
                      selectedId === row.id ? 'bg-muted/70' : ''
                    }`}
                  >
                    {row.photoUrl ? (
                      <img src={row.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {row.fullName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{row.fullName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDocument(row)} · {row.membership ? `until ${formatDate(row.membership.endDate)}` : 'no membership'}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {loadingEligibility && <div className="mt-4"><LoadingState label="Checking access rules…" /></div>}

          {eligibility && !loadingEligibility && (
            <div className="mt-5 space-y-4">
              <article className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
                {eligibility.member.photoUrl ? (
                  <img src={eligibility.member.photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-lg font-semibold">
                    {eligibility.member.fullName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{eligibility.member.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {eligibility.member.documentNumber ?? 'No document'} ·{' '}
                    <span className="font-medium">{statusLabel(eligibility.member.status as MemberStatus)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{membershipText}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Last entry</p>
                  <p className="font-medium text-foreground">
                    {eligibility.lastAttendance ? formatTime(eligibility.lastAttendance.checkInTime) : 'Never'}
                  </p>
                  <p className="mt-1">{eligibility.todayCount} today</p>
                </div>
              </article>

              {eligibility.allowed ? (
                <div className="space-y-2">
                  <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    Access authorized by the gym policy.{' '}
                    {eligibility.duplicateWindowMinutes > 0 &&
                      `A second entry is only accepted ${eligibility.duplicateWindowMinutes} minutes after the previous one.`}
                  </p>
                  <Button className="w-full px-4 py-2" loading={busy} onClick={() => void register()}>
                    <UserCheck className="h-4 w-4" /> Register entry
                  </Button>
                </div>
              ) : (
                <AccessDeniedPanel
                  reasons={eligibility.reasons}
                  allowException={eligibility.policy.allowAdministrativeExceptions}
                  busy={busy}
                  onSubmit={(reason) => void register(reason)}
                  onCancel={reset}
                />
              )}
            </div>
          )}

          {!eligibility && !loadingEligibility && !outcome && search.trim().length < 2 && (
            <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Type at least two characters to search the member directory, or scan the member&apos;s QR credential.
            </div>
          )}
        </section>

        <section className="surface-card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <div>
              <h2 className="font-semibold">Latest entries</h2>
              <p className="text-xs text-muted-foreground">Most recent check-ins of this gym.</p>
            </div>
            <Link to="/gym/attendance/history" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {!stats ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : stats.recent.length === 0 ? (
            <EmptyState title="No entries yet" message="Recorded check-ins will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {stats.recent.map((row: AttendanceRow) => (
                <li key={row.id} className="flex items-center gap-3 p-3">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">{formatTime(row.checkInTime)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.member.user.fullName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {METHOD_LABELS[row.method] ?? row.method} · {MEMBERSHIP_STATE_LABELS[row.membershipStatusAtCheckIn ?? 'NONE'] ?? row.membershipStatusAtCheckIn}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${resultBadge(row.result)}`}>
                    {RESULT_LABELS[row.result] ?? row.result}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {stats && stats.series.some((entry) => entry.count > 0) && (
        <section className="surface-card p-5">
          <h2 className="font-semibold">Entries in the last 14 days</h2>
          <div className="mt-4 flex h-28 items-end gap-1.5">
            {stats.series.map((entry) => {
              const max = Math.max(...stats.series.map((item) => item.count), 1);
              return (
                <div key={entry.date} className="flex flex-1 flex-col items-center gap-1" title={`${entry.date}: ${entry.count}`}>
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${Math.max(4, (entry.count / max) * 88)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{entry.date.slice(8)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <QrCode className="h-4 w-4" />
        The QR code only identifies the member. Access is granted by the server from the gym policy, never from the code
        itself.
      </p>
    </div>
  );
}
