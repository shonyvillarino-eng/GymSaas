import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CreditCard, Info, Phone } from 'lucide-react';

import { Pagination } from '../../components/portal/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/states';
import { api, apiErrorMessage } from '../../lib/api';
import { formatDate, formatMoney, METHOD_LABELS } from '../../lib/finance';
import {
  MEMBERSHIP_STATE_LABELS,
  membershipStateBadge,
  type PageMeta,
  type PortalMembership,
  type PortalMembershipHistoryRow,
} from '../../lib/memberPortal';

interface HistoryResponse {
  data: PortalMembershipHistoryRow[];
  meta: PageMeta;
}

export function PortalMembershipPage() {
  const [membership, setMembership] = useState<PortalMembership | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api<{ data: PortalMembership }>('/member-portal/membership');
      setMembership(response.data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await api<HistoryResponse>(`/member-portal/membership/history?page=${page}&pageSize=10`);
      setHistory(response);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setHistoryLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loading && !membership) return <LoadingState label="Loading your membership…" />;
  if (error && !membership) return <ErrorState title="Your membership is unavailable" message={error} onRetry={load} />;
  if (!membership) return null;

  const { current, renewal, counts } = membership;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-sm font-medium text-primary">MY PLAN</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">My membership</h1>
        <p className="text-sm text-muted-foreground">
          The plan registered for you by {counts.total > 0 ? 'your gym' : 'the gym'} and its history. You cannot change it
          from here.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {current ? (
        <section className="surface-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current membership</p>
              <h2 className="mt-1 text-xl font-semibold">{current.planName}</h2>
              {current.planDuration && <p className="text-sm text-muted-foreground">{current.planDuration} plan</p>}
            </div>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${membershipStateBadge(current.state)}`}>
              {MEMBERSHIP_STATE_LABELS[current.state] ?? current.state}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Start</dt>
              <dd className="font-medium">{formatDate(current.startDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Expires</dt>
              <dd className="font-medium">{formatDate(current.endDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Registered price</dt>
              <dd className="font-medium">
                {formatMoney(current.finalPrice, current.currency)}
                {Number(current.discount) > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground line-through">
                    {formatMoney(current.price, current.currency)}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="h-3 w-3" /> Days remaining
              </dt>
              <dd className="font-medium">
                {current.state === 'EXPIRED' || current.state === 'CANCELLED' ? '0' : current.daysRemaining}
              </dd>
            </div>
          </dl>

          {current.notes && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{current.notes}</p>}
          {current.cancelledAt && (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              This membership was cancelled on {formatDate(current.cancelledAt)}.
            </p>
          )}
          {current.expiringSoon && (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              Your membership expires in {current.daysRemaining} day(s). Renew it at reception to keep training without
              interruption.
            </p>
          )}
        </section>
      ) : (
        <section className="surface-card">
          <EmptyState
            title="No membership yet"
            message="Your gym has not registered a membership for you. Visit the front desk to choose a plan."
          />
        </section>
      )}

      {(renewal.required || !current) && (
        <section className="surface-card space-y-2 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Phone className="h-4 w-4 text-primary" aria-hidden="true" /> How to renew
          </h2>
          <p className="text-sm">{renewal.note}</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {renewal.contactPhone && <li>· Phone: {renewal.contactPhone}</li>}
            {renewal.contactEmail && <li>· Email: {renewal.contactEmail}</li>}
            {renewal.acceptedPaymentMethods.length > 0 && (
              <li>
                · Accepted payment methods:{' '}
                {renewal.acceptedPaymentMethods.map((method) => METHOD_LABELS[method] ?? method).join(', ')}
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" /> Membership history
          </h2>
          <span className="text-xs text-muted-foreground">
            {counts.valid} in force · {counts.expired} expired · {counts.total} total
          </span>
        </div>

        {history && history.data.length === 0 ? (
          <EmptyState title="No memberships recorded" message="Your membership history will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {history?.data.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{row.planName}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(row.startDate)} → {formatDate(row.endDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatMoney(row.finalPrice, row.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${membershipStateBadge(row.state)}`}>
                        {MEMBERSHIP_STATE_LABELS[row.state] ?? row.state}
                      </span>
                      {row.cancelledAt && (
                        <small className="mt-1 block text-xs text-muted-foreground">Cancelled {formatDate(row.cancelledAt)}</small>
                      )}
                      {row.notes && <small className="mt-1 block text-xs text-muted-foreground">{row.notes}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {history && history.meta.total > 0 && (
          <Pagination meta={history.meta} loading={historyLoading} onPage={setPage} label="memberships" />
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        The expiry condition is calculated from the real dates, using the gym's own timezone. This portal does not renew
        memberships nor charge payments.
      </p>
    </div>
  );
}
