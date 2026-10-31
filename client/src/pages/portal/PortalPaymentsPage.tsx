import { useCallback, useEffect, useState } from 'react';
import { FileText, Info, Wallet } from 'lucide-react';

import { Pagination } from '../../components/portal/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/states';
import { api, apiErrorMessage } from '../../lib/api';
import {
  METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  paymentBadge,
} from '../../lib/finance';
import type { PageMeta, PortalPaymentRow } from '../../lib/memberPortal';

interface Summary {
  currency: string;
  paidInPeriod: string;
  operationsInPeriod: number;
  outstandingTotal: string;
  overdueTotal: string;
  openObligations: number;
}

const STATUSES = ['all', 'COMPLETED', 'PENDING', 'PARTIAL', 'VOIDED', 'REFUNDED', 'FAILED'] as const;
const METHODS = ['all', 'CASH', 'TRANSFER', 'BANK_TRANSFER', 'CARD', 'CHECK', 'OTHER'] as const;

export function PortalPaymentsPage() {
  const [rows, setRows] = useState<PortalPaymentRow[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [method, setMethod] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '15', status, method });
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const response = await api<{ data: PortalPaymentRow[]; meta: PageMeta; summary: Summary }>(
        `/member-portal/payments?${query.toString()}`,
      );
      setRows(response.data);
      setMeta(response.meta);
      setSummary(response.summary);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, from, to, status, method]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !meta) return <LoadingState label="Loading your payments…" />;
  if (error && !meta) return <ErrorState title="Payment history unavailable" message={error} onRetry={load} />;

  const currency = summary?.currency ?? '';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-sm font-medium text-primary">MY ACCOUNT</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">My payments</h1>
        <p className="text-sm text-muted-foreground">
          Payments registered at the gym. They are recorded by the staff; this portal cannot create, change or confirm them.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" aria-hidden="true" /> Paid in this filter
          </p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(summary?.paidInPeriod ?? '0', currency)}</p>
          <p className="text-xs text-muted-foreground">{summary?.operationsInPeriod ?? 0} effective movement(s)</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-sm text-muted-foreground">Outstanding balance</p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(summary?.outstandingTotal ?? '0', currency)}</p>
          <p className="text-xs text-muted-foreground">
            {summary?.openObligations ? `${summary.openObligations} open charge(s)` : 'Nothing pending'}
            {summary && Number(summary.overdueTotal) > 0 ? ` · ${formatMoney(summary.overdueTotal, currency)} overdue` : ''}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="surface-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
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
          <span className="label">Status</span>
          <select
            className="input"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'Any status' : PAYMENT_STATUS_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Method</span>
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
                {value === 'all' ? 'Any method' : METHOD_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="surface-card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No payments registered"
            message="When the gym registers a payment for you, it will appear here with its receipt number."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Concept</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((payment) => (
                  <tr key={payment.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(payment.paidAt)}</td>
                    <td className="px-4 py-3">
                      {payment.concept}
                      {payment.obligation && (
                        <small className="block text-xs text-muted-foreground">Charge: {payment.obligation.concept}</small>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {formatMoney(payment.amount, payment.currency)}
                    </td>
                    <td className="px-4 py-3">{METHOD_LABELS[payment.method] ?? payment.method}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${paymentBadge(payment.status)}`}>
                        {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                      </span>
                      <small className="mt-1 block font-mono text-xs text-muted-foreground">{payment.receiptNumber}</small>
                      {payment.voidedAt && (
                        <small className="block text-xs text-destructive">
                          Voided {formatDate(payment.voidedAt)}
                          {payment.voidReason ? ` · ${payment.voidReason}` : ''}
                        </small>
                      )}
                      <a
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        href={`/api/v1/payments/me/${payment.id}/receipt`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Internal receipt (PDF)
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.total > 0 && <Pagination meta={meta} loading={loading} onPage={setPage} label="payments" />}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        The balance is derived from your financial obligations, not from adding up receipts, so a voided movement never
        creates a debt. Internal receipts are administrative documents, not fiscal invoices.
      </p>
    </div>
  );
}
