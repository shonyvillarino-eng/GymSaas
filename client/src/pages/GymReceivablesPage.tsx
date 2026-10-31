import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleDollarSign, FileWarning, Plus, Search } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { StatCard } from '../components/ui/StatCard';
import { ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import {
  OBLIGATION_STATUS_LABELS,
  formatDate,
  formatMoney,
  obligationBadge,
  type Obligation,
  type Paged,
} from '../lib/finance';

interface ObligationsResponse extends Paged<Obligation> {
  totals: { original: string; paid: string; outstanding: string; currency: string };
}

const STATUS_OPTIONS = ['all', 'PENDING', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELLED'] as const;

export function GymReceivablesPage() {
  const [rows, setRows] = useState<ObligationsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [outstandingOnly, setOutstandingOnly] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: '15',
        status,
        outstanding: String(outstandingOnly),
        sort: 'dueDate',
        order: 'asc',
      });
      if (search) query.set('search', search);
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      setRows(await api<ObligationsResponse>(`/financial-obligations?${query.toString()}`));
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, search, status, outstandingOnly, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelCharge = async (obligation: Obligation) => {
    const reason = window.prompt(
      `Cancel the charge "${obligation.concept}" for ${obligation.member?.user.fullName ?? 'this member'}?\n` +
        'The charge keeps its history and reason. Enter the reason:',
      '',
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('A reason of at least 3 characters is required.');
      return;
    }
    setBusyId(obligation.id);
    setError('');
    setNotice('');
    try {
      await api(`/financial-obligations/${obligation.id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setNotice('Charge cancelled. Its history and reason were preserved.');
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusyId('');
    }
  };

  const generate = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ data: { examined: number; created: number } }>('/financial-obligations/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice(
        `Generated ${result.data.created} charge(s) from ${result.data.examined} membership(s). Running it again creates nothing.`,
      );
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setLoading(false);
    }
  };

  if (loading && !rows) return <LoadingState label="Loading outstanding balances…" />;
  if (error && !rows) return <ErrorState title="Balances unavailable" message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-primary">GYM ADMINISTRATION</p>
          <h1 className="text-2xl font-bold">Outstanding balances</h1>
          <p className="text-sm text-muted-foreground">
            Charges owed by members. A debt is overdue by its own due date — never because a membership expired.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="px-4 py-2" onClick={() => void generate()} disabled={loading}>
            Generate from memberships
          </Button>
          <Link to="/gym/payments/new">
            <Button className="px-4 py-2">
              <Plus className="h-4 w-4" /> Register payment
            </Button>
          </Link>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <SuccessState message={notice} />}

      {rows && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard title="Original charged" value={formatMoney(rows.totals.original, rows.totals.currency)} icon={CircleDollarSign} />
          <StatCard title="Already paid" value={formatMoney(rows.totals.paid, rows.totals.currency)} icon={CircleDollarSign} />
          <StatCard title="Still outstanding" value={formatMoney(rows.totals.outstanding, rows.totals.currency)} icon={FileWarning} />
        </div>
      )}

      <section className="surface-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            placeholder="Member, document or concept"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <select className="input" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? 'Any status' : OBLIGATION_STATUS_LABELS[value] ?? value}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={outstandingOnly}
            onChange={(event) => {
              setPage(1);
              setOutstandingOnly(event.target.checked);
            }}
          />
          Only charges that still owe
        </label>
        <input className="input" aria-label="Due from" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} />
        <input className="input" aria-label="Due to" type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} />
      </section>

      <section className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                {['Member', 'Concept', 'Original', 'Paid', 'Balance', 'Due', 'Status', 'Actions'].map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.data.map((obligation) => {
                const balance = obligation.balance ?? String(Number(obligation.originalAmount) - Number(obligation.paidAmount));
                const canPay = !obligation.cancelledAt && obligation.status !== 'PAID';
                return (
                  <tr key={obligation.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {obligation.member ? (
                        <Link className="font-medium text-primary hover:underline" to={`/gym/members/${obligation.member.id}`}>
                          {obligation.member.user.fullName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {obligation.concept}
                      {obligation.subscription && (
                        <small className="block text-xs text-muted-foreground">
                          {obligation.subscription.planNameAtPurchase}
                        </small>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatMoney(obligation.originalAmount, obligation.currency)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatMoney(obligation.paidAmount, obligation.currency)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{formatMoney(balance, obligation.currency)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(obligation.dueDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${obligationBadge(obligation.status)}`}>
                        {OBLIGATION_STATUS_LABELS[obligation.status] ?? obligation.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canPay && (
                          <Link to={`/gym/payments/new?memberId=${obligation.memberId}&obligationId=${obligation.id}`}>
                            <Button variant="outline" className="px-2 py-1 text-xs">Register payment</Button>
                          </Link>
                        )}
                        {canPay && Number(obligation.paidAmount) === 0 && (
                          <Button
                            variant="destructive"
                            className="px-2 py-1 text-xs"
                            disabled={busyId === obligation.id}
                            onClick={() => void cancelCharge(obligation)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                      {obligation.cancelledAt && obligation.cancellationReason && (
                        <small className="mt-1 block text-xs text-muted-foreground">{obligation.cancellationReason}</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && rows?.data.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">No balances match these filters.</p>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-border p-3 text-sm">
          <span>
            {rows?.meta.total ?? 0} charges · page {rows?.meta.page ?? page} / {rows?.meta.totalPages ?? 1}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" className="px-3 py-1" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              className="px-3 py-1"
              disabled={!rows || page >= rows.meta.totalPages || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
