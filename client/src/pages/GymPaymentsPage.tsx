import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CircleDollarSign, FileText, Plus, Search, TrendingUp } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { StatCard } from '../components/ui/StatCard';
import { ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import {
  METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  paymentBadge,
  type FinancialDashboard,
  type Paged,
  type Payment,
} from '../lib/finance';

const STATUS_OPTIONS = ['all', 'COMPLETED', 'VOIDED'] as const;
const METHOD_OPTIONS = ['all', 'CASH', 'TRANSFER', 'BANK_TRANSFER', 'CARD', 'CHECK', 'OTHER'] as const;

export function GymPaymentsPage() {
  const [rows, setRows] = useState<Paged<Payment> | null>(null);
  const [dashboard, setDashboard] = useState<FinancialDashboard | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [method, setMethod] = useState<string>('all');
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
      const query = new URLSearchParams({ page: String(page), pageSize: '15', search, status, method });
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const [list, summary] = await Promise.all([
        api<Paged<Payment>>(`/payments?${query.toString()}`),
        api<{ data: FinancialDashboard }>('/payments/dashboard'),
      ]);
      setRows(list);
      setDashboard(summary.data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, search, status, method, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const voidPayment = async (payment: Payment) => {
    const reason = window.prompt(
      `Void receipt ${payment.receiptNumber} for ${formatMoney(payment.amount, payment.currency)}?\n` +
        'The movement is preserved and the related balance is recalculated. Enter the reason:',
      '',
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('A reason of at least 3 characters is required to void a payment.');
      return;
    }
    setBusyId(payment.id);
    setError('');
    setNotice('');
    try {
      await api(`/payments/${payment.id}/void`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setNotice(`Receipt ${payment.receiptNumber} was voided. The movement and its history were preserved.`);
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusyId('');
    }
  };

  if (loading && !rows) return <LoadingState label="Loading payments…" />;
  if (error && !rows) return <ErrorState title="Payments unavailable" message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-primary">GYM ADMINISTRATION</p>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Administrative records of payments received outside the platform. No card or online payment is processed.
          </p>
        </div>
        <Link to="/gym/payments/new">
          <Button className="px-4 py-2">
            <Plus className="h-4 w-4" /> Register payment
          </Button>
        </Link>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <SuccessState message={notice} />}

      {dashboard && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Collected today" value={formatMoney(dashboard.collectedToday, dashboard.currency)} icon={CircleDollarSign} />
          <StatCard title="Collected this month" value={formatMoney(dashboard.collectedThisMonth, dashboard.currency)} icon={TrendingUp} />
          <StatCard title="Outstanding debt" value={formatMoney(dashboard.outstandingTotal, dashboard.currency)} icon={CalendarClock} />
          <StatCard title="Overdue debt" value={formatMoney(dashboard.overdueTotal, dashboard.currency)} icon={AlertTriangle} />
          <StatCard title="Partially paid charges" value={dashboard.partialCount} icon={FileText} />
        </div>
      )}

      {dashboard && dashboard.byMethod.length > 0 && (
        <section className="surface-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Collected this month by payment method</h2>
          <div className="flex flex-wrap gap-2">
            {dashboard.byMethod.map((entry) => (
              <span key={entry.method} className="rounded-lg border border-border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{METHOD_LABELS[entry.method] ?? entry.method}: </span>
                <strong>{formatMoney(entry.total, dashboard.currency)}</strong>
                <span className="text-muted-foreground"> · {entry.count} ops</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{dashboard.note}</p>
        </section>
      )}

      <section className="surface-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            placeholder="Receipt, member or concept"
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
              {value === 'all' ? 'Any status' : PAYMENT_STATUS_LABELS[value] ?? value}
            </option>
          ))}
        </select>
        <select className="input" value={method} onChange={(event) => { setPage(1); setMethod(event.target.value); }}>
          {METHOD_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? 'Any method' : METHOD_LABELS[value] ?? value}
            </option>
          ))}
        </select>
        <input className="input" aria-label="From date" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} />
        <input className="input" aria-label="To date" type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} />
      </section>

      <section className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                {['Receipt', 'Member', 'Concept', 'Amount', 'Method', 'Paid at', 'Status', 'Actions'].map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.data.map((payment) => (
                <tr key={payment.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{payment.receiptNumber}</td>
                  <td className="px-4 py-3">
                    {payment.member ? (
                      <Link className="font-medium text-primary hover:underline" to={`/gym/members/${payment.member.id}`}>
                        {payment.member.user.fullName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {payment.concept}
                    {payment.obligation && (
                      <small className="block text-xs text-muted-foreground">Charge: {payment.obligation.concept}</small>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatMoney(payment.amount, payment.currency)}</td>
                  <td className="px-4 py-3">{METHOD_LABELS[payment.method] ?? payment.method}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(payment.paidAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${paymentBadge(payment.status)}`}>
                      {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="btn-outline px-2 py-1 text-xs"
                        href={`/api/v1/payments/${payment.id}/receipt`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Receipt (PDF)
                      </a>
                      {payment.status !== 'VOIDED' && (
                        <Button
                          variant="destructive"
                          className="px-2 py-1 text-xs"
                          disabled={busyId === payment.id}
                          onClick={() => void voidPayment(payment)}
                        >
                          Void
                        </Button>
                      )}
                    </div>
                    {payment.voidedAt && (
                      <small className="mt-1 block text-xs text-muted-foreground">
                        Voided {formatDate(payment.voidedAt)}
                        {payment.voidReason ? ` · ${payment.voidReason}` : ''}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows?.data.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">No payments match these filters.</p>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-border p-3 text-sm">
          <span>
            {rows?.meta.total ?? 0} payments · page {rows?.meta.page ?? page} / {rows?.meta.totalPages ?? 1}
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

      <p className="text-xs text-muted-foreground">
        Voiding never deletes a movement: the original record, its operator and the reason stay in the audit trail, and the
        related balance is recalculated. Refunds are not registered automatically.
      </p>
    </div>
  );
}
