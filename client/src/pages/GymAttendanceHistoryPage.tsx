import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import {
  METHOD_LABELS,
  RESULT_LABELS,
  formatTime,
  maskDocument,
  resultBadge,
  type AttendanceList,
  type AttendanceRow,
} from '../lib/attendance';
import { formatDate } from '../lib/members';

const METHODS = [
  ['all', 'Any method'],
  ['MANUAL', 'Manual'],
  ['QR', 'QR code'],
] as const;
const RESULTS = [
  ['all', 'Any result'],
  ['ALLOWED', 'Allowed'],
  ['EXCEPTION', 'Exception'],
] as const;

export function GymAttendanceHistoryPage() {
  const [params, setParams] = useSearchParams();
  const memberId = params.get('memberId') ?? '';
  const [result, setResult] = useState<AttendanceList | null>(null);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        method,
        result: resultFilter,
      });
      if (search.trim()) query.set('search', search.trim());
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      if (memberId) query.set('memberId', memberId);
      setResult(await api<AttendanceList>(`/attendance?${query.toString()}`));
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, method, resultFilter, search, from, to, memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    if (!result?.data.length) return;
    const header = ['Date', 'Time', 'Member', 'Document', 'Method', 'Result', 'Registered by', 'Notes'];
    const rows = result.data.map((row) => [
      new Date(row.checkInTime).toLocaleDateString(),
      formatTime(row.checkInTime),
      row.member.user.fullName,
      row.member.documentNumber ?? '',
      METHOD_LABELS[row.method] ?? row.method,
      RESULT_LABELS[row.result] ?? row.result,
      row.recordedBy?.fullName ?? '',
      row.notes ?? '',
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Link to="/gym/attendance" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to reception
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">RECEPTION</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Attendance history</h1>
          <p className="text-sm text-muted-foreground">
            {result ? `${result.meta.total} entries matched` : 'Every recorded entry of this gym.'}
          </p>
        </div>
        <Button variant="outline" className="px-3 py-2" onClick={exportCsv} disabled={!result?.data.length}>
          <Download className="h-4 w-4" /> Export page
        </Button>
      </header>

      {memberId && (
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-muted px-3 py-1">Filtered by member</span>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('memberId');
              setParams(next);
              setPage(1);
            }}
          >
            Clear
          </button>
        </div>
      )}

      <section className="surface-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            placeholder="Name or document"
            aria-label="Search attendance"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <select
          className="input"
          aria-label="Filter by method"
          value={method}
          onChange={(event) => {
            setPage(1);
            setMethod(event.target.value);
          }}
        >
          {METHODS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Filter by result"
          value={resultFilter}
          onChange={(event) => {
            setPage(1);
            setResultFilter(event.target.value);
          }}
        >
          {RESULTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="date"
          aria-label="From date"
          value={from}
          onChange={(event) => {
            setPage(1);
            setFrom(event.target.value);
          }}
        />
        <input
          className="input"
          type="date"
          aria-label="To date"
          value={to}
          onChange={(event) => {
            setPage(1);
            setTo(event.target.value);
          }}
        />
      </section>

      <section className="surface-card overflow-hidden">
        {loading ? (
          <LoadingState label="Loading attendance…" />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : !result?.data.length ? (
          <EmptyState
            title="No entries found"
            message={
              search || method !== 'all' || resultFilter !== 'all' || from || to
                ? 'Try changing the search or filters.'
                : 'Recorded check-ins will appear here.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    {['Date', 'Time', 'Member', 'Document', 'Method', 'Result', 'Registered by', 'Notes'].map((header) => (
                      <th key={header} className="px-4 py-3 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row: AttendanceRow) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(row.checkInTime)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatTime(row.checkInTime)}</td>
                      <td className="px-4 py-3">
                        <Link className="font-medium hover:text-primary" to={`/gym/members/${row.member.id}`}>
                          {row.member.user.fullName}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{maskDocument(row.member.documentNumber)}</td>
                      <td className="px-4 py-3">{METHOD_LABELS[row.method] ?? row.method}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${resultBadge(row.result)}`}>
                          {RESULT_LABELS[row.result] ?? row.result}
                        </span>
                        {row.result === 'EXCEPTION' && row.exceptionReason && (
                          <small className="mt-1 block max-w-56 truncate text-xs text-muted-foreground" title={row.exceptionReason}>
                            {row.exceptionReason}
                          </small>
                        )}
                      </td>
                      <td className="px-4 py-3">{row.recordedBy?.fullName ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-xs text-muted-foreground">
                Page {result.meta.page} of {result.meta.totalPages} · {result.meta.total} entries
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="px-2 py-1.5"
                  aria-label="Previous page"
                  disabled={result.meta.page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="px-2 py-1.5"
                  aria-label="Next page"
                  disabled={result.meta.page >= result.meta.totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
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
