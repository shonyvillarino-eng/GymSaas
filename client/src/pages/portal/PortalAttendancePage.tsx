import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Info } from 'lucide-react';

import { Pagination } from '../../components/portal/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/states';
import { api, apiErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/finance';
import {
  ATTENDANCE_METHOD_LABELS,
  type PortalAttendanceRow,
  type PortalPage,
} from '../../lib/memberPortal';

interface Summary {
  thisMonth: number;
  lastVisitAt: string | null;
  timezone: string;
}

const METHODS = ['all', 'MANUAL', 'QR'] as const;

export function PortalAttendancePage() {
  const [rows, setRows] = useState<PortalPage<PortalAttendanceRow, Summary> | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '15', method });
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const response = await api<PortalPage<PortalAttendanceRow, Summary>>(`/member-portal/attendances?${query.toString()}`);
      setRows(response);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, from, to, method]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !rows) return <LoadingState label="Loading your attendances…" />;
  if (error && !rows) return <ErrorState title="Attendance history unavailable" message={error} onRetry={load} />;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-sm font-medium text-primary">MY ACTIVITY</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">My attendances</h1>
        <p className="text-sm text-muted-foreground">
          Every check-in recorded at reception. You cannot add, edit or delete entries from here.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> This month
          </p>
          <p className="mt-1 text-2xl font-bold">{rows?.summary.thisMonth ?? 0}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-sm text-muted-foreground">Last visit</p>
          <p className="mt-1 text-2xl font-bold">
            {rows?.summary.lastVisitAt ? formatDate(rows.summary.lastVisitAt) : '—'}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="surface-card grid gap-3 p-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="label">From</span>
          <input
            type="date"
            className="input"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setPage(1);
              setFrom(event.target.value);
            }}
          />
        </label>
        <label className="text-sm">
          <span className="label">To</span>
          <input
            type="date"
            className="input"
            value={to}
            min={from || undefined}
            onChange={(event) => {
              setPage(1);
              setTo(event.target.value);
            }}
          />
        </label>
        <label className="text-sm">
          <span className="label">Registration method</span>
          <select
            className="input"
            value={method}
            onChange={(event) => {
              setPage(1);
              setMethod(event.target.value);
            }}
          >
            {METHODS.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'Any method' : ATTENDANCE_METHOD_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="surface-card overflow-hidden">
        {rows && rows.data.length === 0 ? (
          <EmptyState
            title="No attendances recorded"
            message="When you check in at the gym your visits will be listed here, newest first."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows?.data.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(row.checkInTime)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(row.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">{ATTENDANCE_METHOD_LABELS[row.method] ?? row.method}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          row.result === 'ALLOWED' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {row.result === 'ALLOWED' ? 'Registered' : 'Administrative exception'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && rows.meta.total > 0 && (
          <Pagination meta={rows.meta} loading={loading} onPage={setPage} label="check-ins" />
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Times are shown in your device's timezone; the gym records them in {rows?.summary.timezone ?? 'its own timezone'}.
      </p>
    </div>
  );
}
