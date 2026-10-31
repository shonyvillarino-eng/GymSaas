import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Building2, Dumbbell, Users, UserRoundCog } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ErrorState, LoadingState } from '../../components/ui/states';
import { api } from '../../lib/api';

interface GymDetail {
  id: string; name: string; slug: string; legalName: string | null; taxId: string | null;
  email: string | null; phone: string | null; address: string | null; city: string | null;
  province: string | null; country: string | null; timezone: string; isActive: boolean;
  suspendedAt: string | null; suspensionReason: string | null; createdAt: string; updatedAt: string;
  _count: { memberProfiles: number; instructorProfiles: number; memberships: number; plans: number; payments: number; routines: number; attendances: number };
  admin: { id: string; fullName: string; email: string; phone: string | null; isActive: boolean; joinedAt: string } | null;
}
interface Paged<T> { data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }
type Tab = 'information' | 'administrator' | 'instructors' | 'members' | 'account' | 'activity';

const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: 'information', label: 'Information', icon: Building2 },
  { id: 'administrator', label: 'Administrator', icon: UserRoundCog },
  { id: 'instructors', label: 'Instructors', icon: Dumbbell },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'account', label: 'Account status', icon: Activity },
  { id: 'activity', label: 'Recent activity', icon: Activity },
];

export function GymDetailPage() {
  const { id = '' } = useParams();
  const [gym, setGym] = useState<GymDetail | null>(null);
  const [tab, setTab] = useState<Tab>('information');
  const [people, setPeople] = useState<Paged<Record<string, unknown>> | null>(null);
  const [activity, setActivity] = useState<Paged<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'suspend' | 'reactivate' | null>(null);
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);

  const loadGym = useCallback(async () => {
    setLoading(true); setError('');
    try { setGym((await api<{ data: GymDetail }>(`/admin/gyms/${id}`)).data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load gym'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void loadGym(); }, [loadGym]);

  useEffect(() => {
    if (tab !== 'instructors' && tab !== 'members' && tab !== 'activity') return;
    let cancelled = false;
    setTabLoading(true);
    const endpoint = tab === 'instructors' ? 'instructors' : tab === 'members' ? 'members' : 'activity';
    api<Paged<Record<string, unknown>>>(`/admin/gyms/${id}/${endpoint}?page=${page}&pageSize=10`)
      .then((result) => { if (!cancelled) { if (tab === 'activity') setActivity(result); else setPeople(result); } })
      .catch((cause: unknown) => { if (!cancelled) setActionError(cause instanceof Error ? cause.message : 'Could not load this tab'); })
      .finally(() => { if (!cancelled) setTabLoading(false); });
    return () => { cancelled = true; };
  }, [id, tab, page]);

  const toggleStatus = async () => {
    if (!confirmAction) return;
    setActionBusy(true); setActionError('');
    try {
      if (confirmAction === 'suspend') await api(`/admin/gyms/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) });
      else await api(`/admin/gyms/${id}/reactivate`, { method: 'POST' });
      setConfirmAction(null); setReason(''); await loadGym();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Could not update account status'); }
    finally { setActionBusy(false); }
  };

  if (loading) return <LoadingState label="Loading gym details…" />;
  if (error) return <ErrorState title="Gym unavailable" message={error} onRetry={loadGym} />;
  if (!gym) return null;
  const activeData = tab === 'activity' ? activity : people;
  const rows = activeData?.data ?? [];

  return <div className="space-y-6">
    <Link to="/admin/gyms" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All gyms</Link>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold tracking-tight">{gym.name}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${gym.isActive ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{gym.isActive ? 'Active' : 'Suspended'}</span></div><p className="mt-1 text-sm text-muted-foreground">{gym.slug} · Registered {new Date(gym.createdAt).toLocaleDateString()}</p></div><Button variant={gym.isActive ? 'destructive' : 'primary'} onClick={() => setConfirmAction(gym.isActive ? 'suspend' : 'reactivate')} className="px-4 py-2">{gym.isActive ? 'Suspend gym' : 'Reactivate gym'}</Button></header>
    {actionError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{actionError}</p>}
    <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Gym detail sections">{tabs.map(({ id: tabId, label, icon: Icon }) => <button key={tabId} onClick={() => { setTab(tabId); setPage(1); setActionError(''); }} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${tab === tabId ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

    {tab === 'information' && <div className="grid gap-4 lg:grid-cols-3"><section className="surface-card p-5 lg:col-span-2"><h3 className="mb-4 font-semibold">Business and contact information</h3><dl className="grid gap-4 sm:grid-cols-2">{[['Legal name', gym.legalName], ['Tax ID', gym.taxId], ['Email', gym.email], ['Phone', gym.phone], ['Address', gym.address], ['City', gym.city], ['Province / state', gym.province], ['Country', gym.country], ['Timezone', gym.timezone]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value || 'Not provided'}</dd></div>)}</dl></section><section className="surface-card p-5"><h3 className="mb-4 font-semibold">Tenant overview</h3><dl className="space-y-3 text-sm">{[['Members', gym._count.memberProfiles], ['Instructors', gym._count.instructorProfiles], ['Membership plans', gym._count.plans], ['Routines', gym._count.routines], ['Recorded payments', gym._count.payments], ['Attendance records', gym._count.attendances]].map(([label, value]) => <div className="flex justify-between gap-3" key={label as string}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl></section></div>}

    {tab === 'administrator' && <section className="surface-card max-w-2xl p-5"><h3 className="mb-4 font-semibold">Gym administrator</h3>{gym.admin ? <dl className="grid gap-4 sm:grid-cols-2">{[['Name', gym.admin.fullName], ['Email', gym.admin.email], ['Phone', gym.admin.phone || 'Not provided'], ['Account', gym.admin.isActive ? 'Active' : 'Pending setup'], ['Assigned', new Date(gym.admin.joinedAt).toLocaleDateString()]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>)}</dl> : <p className="text-sm text-muted-foreground">No active administrator is assigned.</p>}</section>}

    {(tab === 'instructors' || tab === 'members' || tab === 'activity') && <section className="surface-card overflow-hidden"><div className="border-b border-border p-4"><h3 className="font-semibold">{tab === 'instructors' ? 'Instructors' : tab === 'members' ? 'Members' : 'Recent administrative activity'}</h3><p className="text-sm text-muted-foreground">{activeData?.meta.total ?? '…'} records</p></div>{tabLoading ? <LoadingState label="Loading records…" /> : !rows.length ? <p className="p-10 text-center text-sm text-muted-foreground">No records to display.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">{(tab === 'activity' ? ['Action', 'Target', 'Performed by', 'Date'] : ['Name', 'Email', tab === 'members' ? 'Fitness level' : 'Specialization', 'Status']).map((heading) => <th className="px-4 py-3 font-medium" key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => { const user = row.user as { fullName?: string; email?: string; isActive?: boolean } | undefined; const key = String(row.id ?? index); return <tr key={key} className="border-b border-border last:border-0">{tab === 'activity' ? <><td className="px-4 py-3">{String(row.action ?? '')}</td><td className="px-4 py-3">{String(row.entityType ?? '')} · {String(row.entityId ?? '')}</td><td className="px-4 py-3">{(row.user as { fullName?: string } | null)?.fullName ?? 'System'}</td><td className="px-4 py-3">{new Date(String(row.createdAt)).toLocaleString()}</td></> : <><td className="px-4 py-3">{user?.fullName ?? '—'}</td><td className="px-4 py-3">{user?.email ?? '—'}</td><td className="px-4 py-3">{tab === 'members' ? String(row.fitnessLevel ?? '—') : (Array.isArray(row.specialization) ? row.specialization.join(', ') : '—')}</td><td className="px-4 py-3">{user?.isActive ? 'Active' : 'Inactive'}</td></>}</tr>; })}</tbody></table></div>}{activeData && <div className="flex justify-end gap-2 border-t border-border p-3"><Button variant="outline" disabled={activeData.meta.page <= 1} onClick={() => setPage((current) => current - 1)} className="px-3 py-1.5">Previous</Button><span className="self-center text-xs text-muted-foreground">Page {activeData.meta.page} of {activeData.meta.totalPages}</span><Button variant="outline" disabled={activeData.meta.page >= activeData.meta.totalPages} onClick={() => setPage((current) => current + 1)} className="px-3 py-1.5">Next</Button></div>}</section>}

    {tab === 'account' && <section className="surface-card max-w-3xl p-5"><h3 className="font-semibold">Account status</h3><p className="mt-1 text-sm text-muted-foreground">Suspension blocks sign-in and all tenant sessions while preserving gym data.</p><div className={`mt-5 rounded-lg border p-4 ${gym.isActive ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}><p className="font-medium">{gym.isActive ? 'Gym is active' : 'Gym is suspended'}</p>{gym.suspendedAt && <p className="mt-1 text-sm">Since {new Date(gym.suspendedAt).toLocaleString()}</p>}{gym.suspensionReason && <p className="mt-2 text-sm text-muted-foreground">Reason: {gym.suspensionReason}</p>}</div></section>}

    {confirmAction && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" className="surface-card w-full max-w-md p-6"><h3 className="text-lg font-semibold">{confirmAction === 'suspend' ? 'Suspend this gym?' : 'Reactivate this gym?'}</h3><p className="mt-2 text-sm text-muted-foreground">{confirmAction === 'suspend' ? 'All gym users will immediately lose access. Existing records will be retained.' : 'The gym and its memberships will be reactivated.'}</p>{confirmAction === 'suspend' && <label className="mt-4 block"><span className="label">Reason for suspension</span><textarea className="input min-h-24" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}{actionError && <p role="alert" className="mt-3 text-sm text-destructive">{actionError}</p>}<div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => { setConfirmAction(null); setActionError(''); }} className="px-4 py-2">Cancel</Button><Button variant={confirmAction === 'suspend' ? 'destructive' : 'primary'} loading={actionBusy} disabled={confirmAction === 'suspend' && reason.trim().length < 3} onClick={() => void toggleStatus()} className="px-4 py-2">Confirm {confirmAction}</Button></div></section></div>}
  </div>;
}
