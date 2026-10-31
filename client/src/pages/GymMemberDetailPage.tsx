import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Plus,
  CreditCard,
  Dumbbell,
  Pencil,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { MemberQrCredential } from '../components/attendance/MemberQrCredential';
import { METHOD_LABELS, RESULT_LABELS, resultBadge } from '../lib/attendance';
import { useAuth } from '../lib/auth';
import { api, apiErrorMessage } from '../lib/api';
import { OBLIGATION_STATUS_LABELS } from '../lib/finance';
import {
  GENDER_LABELS,
  SUBSCRIPTION_LABELS,
  formatDateTime,
  formatDate,
  formatDocument,
  formatMoney,
  statusBadge,
  statusLabel,
  type MemberSummary,
} from '../lib/members';

type Tab = 'information' | 'membership' | 'payments' | 'attendance' | 'routines' | 'instructor';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'information', label: 'Information', icon: Users },
  { id: 'membership', label: 'Membership', icon: CreditCard },
  { id: 'payments', label: 'Payments', icon: ClipboardList },
  { id: 'attendance', label: 'Attendance', icon: CalendarDays },
  { id: 'routines', label: 'Routines', icon: Dumbbell },
  { id: 'instructor', label: 'Instructor', icon: UserRoundCog },
];

export function GymMemberDetailPage() {
  const { user } = useAuth();
  const { id = '' } = useParams();
  const location = useLocation();
  const pageNotice = (location.state as { notice?: string } | null)?.notice ?? '';
  const [summary, setSummary] = useState<MemberSummary | null>(null);
  const [tab, setTab] = useState<Tab>('information');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [nextStatus, setNextStatus] = useState<'INACTIVE' | 'SUSPENDED' | 'ACTIVE'>('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [instructorChoice, setInstructorChoice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ data: MemberSummary }>(`/members/${id}/summary`);
      setSummary(result.data);
      setInstructorChoice(result.data.instructor?.id ?? '');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async () => {
    setBusy(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api(`/members/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, reason: statusReason || undefined }),
      });
      setStatusModal(false);
      setStatusReason('');
      setActionSuccess(`Member status changed to ${statusLabel(nextStatus)}. Historical records were preserved.`);
      await load();
    } catch (cause) {
      setActionError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const assignInstructor = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api(`/members/${id}/instructor`, {
        method: 'PUT',
        body: JSON.stringify({ instructorId: instructorChoice || null }),
      });
      setActionSuccess(instructorChoice ? 'Primary instructor updated.' : 'Primary instructor removed.');
      await load();
    } catch (cause) {
      setActionError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading member…" />;
  if (error) return <ErrorState title="Member unavailable" message={error} onRetry={load} />;
  if (!summary) return null;

  const { member, memberships, payments, pending, attendance, routines, instructor, availableInstructors, financial } = summary;

  return (
    <div className="space-y-6">
      <Link to="/gym/members" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All members
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {member.photoUrl ? (
            <img src={member.photoUrl} alt={`${member.fullName} photo`} className="h-16 w-16 rounded-xl border border-border object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 text-xl font-semibold text-primary">
              {member.fullName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{member.fullName}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(member.status)}`}>
                {statusLabel(member.status)}
              </span>
              {member.membership && (
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    member.membership.expired || member.membership.status === 'EXPIRED'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Membership: {member.membership.expired && member.membership.status === 'ACTIVE' ? 'past due' : SUBSCRIPTION_LABELS[member.membership.status] ?? member.membership.status}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDocument(member)} · Joined {formatDate(member.joinDate)}
              {member.phone ? ` · ${member.phone}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/gym/members/${member.id}/edit`}>
            <Button variant="outline" className="px-4 py-2">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </Link>
          <Button
            variant={member.status === 'ACTIVE' ? 'destructive' : 'primary'}
            onClick={() => {
              setNextStatus(member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
              setStatusModal(true);
            }}
            className="px-4 py-2"
          >
            {member.status === 'ACTIVE' ? 'Suspend member' : 'Reactivate member'}
          </Button>
        </div>
      </header>

      {pageNotice && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{pageNotice}</p>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {actionSuccess && <SuccessState message={actionSuccess} />}

      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Member detail sections">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => {
              setTab(tabId);
              setActionError('');
              setActionSuccess('');
            }}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${
              tab === tabId ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'information' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="surface-card p-5 lg:col-span-2">
            <h2 className="mb-4 font-semibold">Personal and contact information</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ['Full name', member.fullName],
                ['Document', formatDocument(member)],
                ['Birth date', formatDate(member.birthDate)],
                ['Gender', member.gender ? GENDER_LABELS[member.gender] ?? member.gender : 'Not specified'],
                ['Phone', member.phone],
                ['Email', member.email ?? 'Not provided (optional)'],
                ['Address', member.address],
                ['Join date', formatDate(member.joinDate)],
                ['Emergency contact', member.emergencyName ? `${member.emergencyName} · ${member.emergencyPhone}` : null],
                ['Administrative status', statusLabel(member.status)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm">{value || 'Not provided'}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5">
              <h3 className="text-sm font-medium text-muted-foreground">Administrative notes</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{member.notes || 'No notes recorded.'}</p>
            </div>
          </section>
          <section className="surface-card p-5">
            <h2 className="mb-4 font-semibold">Attendance eligibility</h2>
            <div
              className={`rounded-lg border p-4 ${
                member.attendance.allowed ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'
              }`}
            >
              <p className="font-medium">{member.attendance.allowed ? 'Can register attendance' : 'Cannot register attendance'}</p>
              <p className="mt-2 text-sm text-muted-foreground">{member.attendance.rule}</p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Membership status is handled separately: an active member can have an expired membership.
            </p>
          </section>
        </div>
      )}

      {tab === 'membership' && (
        <section className="surface-card overflow-hidden">
          <div className="border-b border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Membership history</h2>
            <p className="text-sm text-muted-foreground">
              {member.membership
                ? `Current: ${member.membership.planName} until ${formatDate(member.membership.endDate)}`
                : 'No membership recorded.'}
            </p></div><Link to={`/gym/subscriptions/new?memberId=${member.id}`}><Button className="px-3 py-2"><Plus className="h-4 w-4"/>Assign plan</Button></Link></div>
          </div>
          {memberships.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No memberships recorded for this member yet. Memberships will appear here once they are registered in the memberships module.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Start</th>
                    <th className="px-4 py-3 font-medium">End</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Agreed price</th>
                    <th className="px-4 py-3 font-medium">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((record) => (
                    <tr key={record.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{record.plan.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(record.startDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(record.endDate)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            record.status === 'ACTIVE' && new Date(record.endDate).getTime() >= Date.now()
                              ? 'bg-primary/10 text-primary'
                              : record.status === 'ACTIVE' || record.status === 'EXPIRED'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {record.status === 'ACTIVE' && new Date(record.endDate).getTime() < Date.now()
                            ? 'Past due'
                            : SUBSCRIPTION_LABELS[record.status] ?? record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatMoney(record.finalPrice, record.plan.currency)}{Number(record.discountAmount) > 0 && <small className="block text-muted-foreground">List {formatMoney(record.priceAtPurchase, record.plan.currency)} · discount {formatMoney(record.discountAmount, record.plan.currency)}</small>}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{record.cancelledAt ? formatDate(record.cancelledAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'payments' && (
        <div className="space-y-4">
        <section className="surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Outstanding charges</h2>
              <p className="text-sm text-muted-foreground">
                Total owed: {formatMoney(financial.outstandingTotal, financial.currency)} ·{' '}
                {financial.outstandingCount} open charge{financial.outstandingCount === 1 ? '' : 's'} · last payment{' '}
                {financial.lastPaymentAt ? formatDate(financial.lastPaymentAt) : 'none recorded'}
              </p>
            </div>
            <Link to={`/gym/payments/new?memberId=${member.id}`}>
              <Button className="px-3 py-2"><Plus className="h-4 w-4" /> Register payment</Button>
            </Link>
          </div>
          {financial.obligations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No charges registered for this member yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Concept</th>
                    <th className="px-4 py-2 font-medium">Original</th>
                    <th className="px-4 py-2 font-medium">Paid</th>
                    <th className="px-4 py-2 font-medium">Balance</th>
                    <th className="px-4 py-2 font-medium">Due</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {financial.obligations.map((obligation) => (
                    <tr key={obligation.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{obligation.concept}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatMoney(obligation.originalAmount, obligation.currency)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatMoney(obligation.paidAmount, obligation.currency)}</td>
                      <td className="px-4 py-2 whitespace-nowrap font-medium">{formatMoney(obligation.balance, obligation.currency)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(obligation.dueDate)}</td>
                      <td className="px-4 py-2">{OBLIGATION_STATUS_LABELS[obligation.status] ?? obligation.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="font-semibold">Payment history</h2>
              <p className="text-sm text-muted-foreground">Administrative records only; no online payments.</p>
            </div>
            <div className={`rounded-lg border px-4 py-2 text-sm ${pending.count > 0 ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border bg-muted/40'}`}>
              {pending.count > 0
                ? `Pending: ${formatMoney(pending.amount)} (${pending.count} record${pending.count === 1 ? '' : 's'})`
                : 'No pending debts'}
            </div>
          </div>
          {payments.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No payments recorded for this member yet. Registered payments and their internal receipts will appear here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Concept</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((record) => (
                    <tr key={record.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(record.paidAt)}</td>
                      <td className="px-4 py-3">{record.concept}</td>
                      <td className="px-4 py-3">{record.method}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatMoney(record.amount, record.currency)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            record.status === 'COMPLETED'
                              ? 'bg-primary/10 text-primary'
                              : record.status === 'PENDING' || record.status === 'PARTIAL'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{record.reference ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs">{record.receiptNumber}</span>
                        <a
                          className="ml-2 text-xs text-primary hover:underline"
                          href={`/api/v1/payments/${record.id}/receipt`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['Total check-ins', attendance.total],
              ['This month', attendance.thisMonth],
              ['Last 7 days', attendance.last7Days],
              ['Last 30 days', attendance.last30Days],
              ['Average per week', attendance.averagePerWeek],
              ['Last visit', attendance.lastVisitAt ? formatDateTime(attendance.lastVisitAt) : 'Never'],
            ].map(([label, value]) => (
              <div key={label} className="surface-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="surface-card p-5 lg:col-span-2">
              <h2 className="font-semibold">Attendance evolution</h2>
              <p className="text-sm text-muted-foreground">Entries per week over the last eight weeks.</p>
              {attendance.weekly.every((week) => week.count === 0) ? (
                <p className="mt-4 text-sm text-muted-foreground">No entries recorded in this period.</p>
              ) : (
                <div className="mt-4 flex h-32 items-end gap-2">
                  {attendance.weekly.map((week) => {
                    const max = Math.max(...attendance.weekly.map((item) => item.count), 1);
                    return (
                      <div key={week.weekStart} className="flex flex-1 flex-col items-center gap-1" title={`Week of ${formatDate(week.weekStart)}: ${week.count}`}>
                        <span className="text-xs font-medium">{week.count}</span>
                        <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(4, (week.count / max) * 80)}px` }} />
                        <span className="text-[10px] text-muted-foreground">{week.weekStart.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <MemberQrCredential memberId={member.id} memberName={member.fullName} gymName={user?.gymName ?? ''} />
          </div>
          <section className="surface-card overflow-hidden">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold">Recent check-ins</h2>
              <p className="text-sm text-muted-foreground">Date, time and registration method of each entry.</p>
            </div>
            {attendance.recent.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">No attendance recorded for this member yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Check-in</th>
                      <th className="px-4 py-3 font-medium">Check-out</th>
                      <th className="px-4 py-3 font-medium">Method</th>
                      <th className="px-4 py-3 font-medium">Result</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.recent.map((record) => (
                      <tr key={record.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(record.checkInTime)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.checkOutTime ? formatDateTime(record.checkOutTime) : '—'}</td>
                        <td className="px-4 py-3">{METHOD_LABELS[record.method] ?? record.method}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${resultBadge(record.result)}`}>
                            {RESULT_LABELS[record.result] ?? record.result}
                          </span>
                          {record.exceptionReason && (
                            <small className="mt-1 block max-w-56 truncate text-xs text-muted-foreground" title={record.exceptionReason}>
                              {record.exceptionReason}
                            </small>
                          )}
                        </td>
                        <td className="px-4 py-3">{record.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'routines' && (
        <section className="surface-card overflow-hidden">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">Assigned routines</h2>
            <p className="text-sm text-muted-foreground">Creation and last update of each routine assigned to this member.</p>
          </div>
          {routines.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No routines assigned to this member yet. Build one from the{' '}
              <Link className="text-primary hover:underline" to="/gym/routines/new">
                routines workspace
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Routine</th>
                    <th className="px-4 py-3 font-medium">Difficulty</th>
                    <th className="px-4 py-3 font-medium">Responsible</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {routines.map((record) => (
                    <tr key={record.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">
                        <Link className="hover:text-primary" to={`/gym/routines/${record.id}`}>
                          {record.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{record.difficulty}</td>
                      <td className="px-4 py-3">{record.creator?.fullName ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(record.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(record.updatedAt)}</td>
                      <td className="px-4 py-3">{record.isActive ? 'Active' : 'Inactive'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'instructor' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface-card p-5">
            <h2 className="mb-4 font-semibold">Primary instructor</h2>
            {instructor ? (
              <div className="rounded-lg border border-border p-4">
                <p className="font-medium">{instructor.fullName}</p>
                <p className="text-sm text-muted-foreground">{instructor.email ?? 'No email'}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No primary instructor assigned.</p>
            )}
          </section>
          <section className="surface-card p-5">
            <h2 className="mb-1 font-semibold">Change assignment</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Only instructors of this gym can be assigned. The change is recorded in the audit log.
            </p>
            <form onSubmit={(event) => void assignInstructor(event)} className="space-y-4">
              <label className="block">
                <span className="label">Instructor</span>
                <select className="input" value={instructorChoice} onChange={(event) => setInstructorChoice(event.target.value)}>
                  <option value="">Without instructor</option>
                  {availableInstructors.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end">
                <Button type="submit" loading={busy} disabled={instructorChoice === (instructor?.id ?? '')} className="px-4 py-2">
                  Save assignment
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {statusModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="member-status-title" className="surface-card w-full max-w-md p-6">
            <h3 id="member-status-title" className="text-lg font-semibold">
              {nextStatus === 'ACTIVE' ? 'Reactivate this member?' : `Mark this member as ${statusLabel(nextStatus)}?`}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {nextStatus === 'ACTIVE'
                ? 'The member will be able to register attendance again according to the gym rules.'
                : 'The member will not be able to register attendance while in this state. Payment, attendance and routine history is always preserved.'}
            </p>
            <label className="mt-4 block">
              <span className="label">Reason (optional, stored in the audit log)</span>
              <textarea
                className="input min-h-20"
                maxLength={500}
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
              />
            </label>
            {actionError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {actionError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setStatusModal(false); setActionError(''); }} className="px-4 py-2">
                Cancel
              </Button>
              <Button variant={nextStatus === 'ACTIVE' ? 'primary' : 'destructive'} loading={busy} onClick={() => void changeStatus()} className="px-4 py-2">
                Confirm
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
