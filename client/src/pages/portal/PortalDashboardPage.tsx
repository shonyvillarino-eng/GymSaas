import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CreditCard, Dumbbell, Wallet } from 'lucide-react';

import { ErrorState, LoadingState, Spinner } from '../../components/ui/states';
import { NoticeList } from '../../components/portal/NoticeList';
import { api, apiErrorMessage } from '../../lib/api';
import { formatDate, formatMoney, METHOD_LABELS } from '../../lib/finance';
import {
  ATTENDANCE_METHOD_LABELS,
  MEMBERSHIP_STATE_LABELS,
  membershipStateBadge,
  type PortalDashboard,
} from '../../lib/memberPortal';

export function PortalDashboardPage() {
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api<{ data: PortalDashboard }>('/member-portal/dashboard');
      setData(response.data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <LoadingState label="Loading your dashboard…" />;
  if (error && !data) return <ErrorState title="Your dashboard is unavailable" message={error} onRetry={load} />;
  if (!data) return null;

  const { member, gym, membership, attendance, payments, routine, access, notices } = data;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {gym.logoUrl ? (
            <img src={gym.logoUrl} alt={`${gym.name} logo`} className="h-11 w-11 rounded-lg border border-border bg-background object-contain p-0.5" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
              {gym.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">MY GYM</p>
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{member.fullName}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {gym.name}
              {gym.city ? ` · ${gym.city}` : ''}
            </p>
          </div>
        </div>
        <button onClick={load} className="btn-outline px-3 py-2 text-sm" disabled={loading}>
          {loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Access verdict, computed by the same engine the reception desk uses. */}
      <section
        className={`rounded-xl border p-4 ${
          access.allowed ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'
        }`}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          {access.allowed ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <div>
            <p className="font-semibold">{access.allowed ? 'You can check in at the gym' : 'You cannot check in right now'}</p>
            {access.allowed ? (
              <p className="text-sm text-muted-foreground">Your membership is in force and your record is active.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {access.reasons.map((reason) => (
                  <li key={reason.code}>· {reason.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Membership */}
        <section className="surface-card flex flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" /> Membership
            </h2>
            {membership && (
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${membershipStateBadge(membership.state)}`}>
                {MEMBERSHIP_STATE_LABELS[membership.state] ?? membership.state}
              </span>
            )}
          </div>
          {membership ? (
            <>
              <p className="mt-3 text-lg font-semibold">{membership.planName}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(membership.startDate)} → {formatDate(membership.endDate)}
              </p>
              <p className="mt-2 text-sm">
                {membership.state === 'EXPIRED' || membership.state === 'CANCELLED' ? (
                  <span className="text-destructive">Renew at reception to keep training.</span>
                ) : (
                  <>
                    <strong>{membership.daysRemaining}</strong> day(s) remaining
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No membership has been registered for you yet. Ask at reception to get started.
            </p>
          )}
          <Link to="/membership" className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-primary hover:underline">
            View membership <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>

        {/* Routine */}
        <section className="surface-card flex flex-col p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Dumbbell className="h-4 w-4 text-primary" aria-hidden="true" /> Active routine
          </h2>
          {routine ? (
            <>
              <p className="mt-3 text-lg font-semibold">{routine.name}</p>
              <p className="text-sm text-muted-foreground">
                {routine.sessions} session(s)
                {routine.instructor ? ` · ${routine.instructor}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">Updated {formatDate(routine.updatedAt)}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              You have no active routine. Your instructor will publish one for you.
            </p>
          )}
          <Link to="/routines" className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-primary hover:underline">
            Open my routine <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> This month
          </p>
          <p className="mt-1 text-2xl font-bold">{attendance.thisMonth}</p>
          <p className="text-xs text-muted-foreground">check-ins</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-sm text-muted-foreground">Last visit</p>
          <p className="mt-1 text-2xl font-bold">{attendance.lastVisitAt ? formatDate(attendance.lastVisitAt) : '—'}</p>
          <p className="text-xs text-muted-foreground">
            {attendance.lastVisitAt
              ? ATTENDANCE_METHOD_LABELS[attendance.lastVisitMethod ?? ''] ?? 'Registered'
              : 'No visits recorded yet'}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" aria-hidden="true" /> Outstanding
          </p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(payments.outstandingTotal, payments.currency)}</p>
          <p className="text-xs text-muted-foreground">
            {payments.openCount === 0 ? 'Nothing pending' : `${payments.openCount} open charge(s)`}
            {Number(payments.overdueTotal) > 0 ? ` · ${formatMoney(payments.overdueTotal, payments.currency)} overdue` : ''}
          </p>
        </div>
      </div>

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Notices</h2>
          <Link to="/notifications" className="text-sm text-primary hover:underline">
            See all
          </Link>
        </div>
        <NoticeList notices={notices.slice(0, 3)} />
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Last payment</h2>
          <Link to="/payments" className="text-sm text-primary hover:underline">
            Payment history
          </Link>
        </div>
        {payments.lastPayment ? (
          <div className="text-sm">
            <p className="font-medium">{formatMoney(payments.lastPayment.amount, payments.lastPayment.currency)}</p>
            <p className="text-muted-foreground">
              {payments.lastPayment.concept} · {METHOD_LABELS[payments.lastPayment.method] ?? payments.lastPayment.method} ·{' '}
              {formatDate(payments.lastPayment.paidAt)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payments have been registered for you yet.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Payments are registered by the gym. This portal never charges your card or processes online payments.
        </p>
      </section>
    </div>
  );
}
