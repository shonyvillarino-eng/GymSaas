import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, Pencil, Plus, Search, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorState, LoadingState } from '../../components/ui/states';
import { ApiRequestError, api } from '../../lib/api';

interface GymRow {
  id: string; name: string; slug: string; email: string | null; phone: string | null;
  address: string | null; city: string | null; province: string | null; country: string | null;
  timezone: string; isActive: boolean; createdAt: string;
  _count: { memberProfiles: number; instructorProfiles: number };
  admin: { fullName: string; email: string; isActive: boolean } | null;
}
interface GymPageResult { data: GymRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }
interface SetupResult { setupToken: string; setupUrl: string; setupExpiresAt: string; data: { name: string } }

const gymFormSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(120),
  slug: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  phone: z.string().max(40), address: z.string().max(240), city: z.string().max(80),
  province: z.string().max(80), country: z.string().max(80), timezone: z.string().max(64),
  adminFullName: z.string().optional(),
  adminEmail: z.union([z.literal(''), z.email('Enter a valid administrator email')]).optional(),
});
type GymFormValues = z.infer<typeof gymFormSchema>;

const emptyValues: GymFormValues = { name: '', slug: '', email: '', phone: '', address: '', city: '', province: '', country: '', timezone: 'UTC', adminFullName: '', adminEmail: '' };

function GymForm({ initial, onClose, onSaved }: { initial?: GymRow; onClose: () => void; onSaved: (setup?: SetupResult) => void }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, setError: setFieldError, formState: { errors } } = useForm<GymFormValues>({
    resolver: zodResolver(gymFormSchema),
    defaultValues: initial ? {
      ...emptyValues,
      name: initial.name,
      slug: initial.slug,
      email: initial.email ?? '',
      phone: initial.phone ?? '',
      city: initial.city ?? '',
      province: initial.province ?? '',
      country: initial.country ?? '',
      adminFullName: '',
      adminEmail: '',
    } : emptyValues,
  });

  const submit = handleSubmit(async (values) => {
    setSaving(true); setError('');
    const { adminFullName, adminEmail, ...gym } = values;
    if (!initial && (!adminFullName?.trim() || adminFullName.trim().length < 2 || !adminEmail)) {
      if (!adminFullName?.trim() || adminFullName.trim().length < 2) setFieldError('adminFullName', { message: 'Enter at least 2 characters' });
      if (!adminEmail) setFieldError('adminEmail', { message: 'Enter a valid administrator email' });
      return;
    }
    const body = Object.fromEntries(Object.entries(gym).map(([key, value]) => [key, value === '' ? null : value]));
    try {
      if (initial) {
        await api(`/admin/gyms/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        onSaved();
      } else {
        const result = await api<SetupResult>('/admin/gyms', { method: 'POST', body: JSON.stringify({ ...body, adminFullName, adminEmail }) });
        onSaved(result);
      }
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Could not save this gym');
    } finally { setSaving(false); }
  });

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="gym-form-title" className="surface-card max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5 sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="gym-form-title" className="text-xl font-semibold">{initial ? 'Edit gym' : 'Register a gym'}</h2><p className="text-sm text-muted-foreground">{initial ? 'Update business and contact details.' : 'Create the gym and its initial administrator account.'}</p></div><button className="btn-ghost p-2" aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button></div>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Gym name" required {...register('name')} error={errors.name?.message} />
          <Input label="Identifier (slug)" required {...register('slug')} error={errors.slug?.message} />
          <Input label="Contact email" type="email" {...register('email')} error={errors.email?.message} />
          <Input label="Phone" type="tel" {...register('phone')} error={errors.phone?.message} />
          <Input label="Address" {...register('address')} error={errors.address?.message} />
          <Input label="City" {...register('city')} error={errors.city?.message} />
          <Input label="Province / state" {...register('province')} error={errors.province?.message} />
          <Input label="Country" {...register('country')} error={errors.country?.message} />
          <Input label="Timezone" {...register('timezone')} error={errors.timezone?.message} />
        </div>
        {!initial && <div className="border-t border-border pt-5"><h3 className="mb-3 font-medium">Initial administrator</h3><div className="grid gap-4 sm:grid-cols-2"><Input label="Full name" required {...register('adminFullName')} error={errors.adminFullName?.message} /><Input label="Email" type="email" required {...register('adminEmail')} error={errors.adminEmail?.message} /></div><p className="mt-3 text-xs text-muted-foreground">A one-time setup link will be shown after creation. No password is emailed or stored in plain text.</p></div>}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={onClose} className="px-4 py-2">Cancel</Button><Button type="submit" loading={saving} className="px-4 py-2">{initial ? 'Save changes' : 'Create gym'}</Button></div>
      </form>
    </section>
  </div>;
}

export function GymsPage() {
  const [result, setResult] = useState<GymPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'createdAt' | 'name'>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [form, setForm] = useState<GymRow | 'create' | null>(null);
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '10', search, status, sort, order });
      setResult(await api<GymPageResult>(`/admin/gyms?${query}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load gyms'); }
    finally { setLoading(false); }
  }, [page, search, status, sort, order]);
  useEffect(() => { void load(); }, [load]);

  const changeSort = () => { setSort((current) => current === 'name' ? 'createdAt' : 'name'); setOrder('asc'); setPage(1); };
  const onSaved = (newSetup?: SetupResult) => { setForm(null); if (newSetup) setSetup(newSetup); void load(); };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">PLATFORM ADMINISTRATION</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Gyms</h2><p className="text-muted-foreground">Search, manage and review tenant accounts.</p></div><Button onClick={() => setForm('create')} className="px-4 py-2"><Plus className="h-4 w-4" /> Register gym</Button></div>
    <div className="surface-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input pl-9" placeholder="Search gym, identifier or email" aria-label="Search gyms" /></div>
        <div className="flex items-center gap-2"><label htmlFor="gym-status" className="text-sm text-muted-foreground">Status</label><select id="gym-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="input w-auto"><option value="all">All gyms</option><option value="active">Active</option><option value="suspended">Suspended</option></select><Button variant="outline" onClick={() => void load()} className="px-3 py-2">Refresh</Button></div>
      </div>
      {loading ? <LoadingState label="Loading gyms…" /> : error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : !result?.data.length ? <div className="p-12 text-center"><p className="font-medium">No gyms found</p><p className="mt-1 text-sm text-muted-foreground">Try changing the search or status filter.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/50 text-left text-muted-foreground"><th className="px-4 py-3"><button className="inline-flex items-center gap-1 font-medium" onClick={changeSort}>Gym {sort === 'name' && (order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button></th><th className="px-4 py-3">Administrator</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Registered</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{result.data.map((gym) => <tr key={gym.id} className="border-b border-border last:border-0 hover:bg-muted/30"><td className="px-4 py-3"><Link className="font-medium hover:text-primary" to={`/admin/gyms/${gym.id}`}>{gym.name}</Link><p className="text-xs text-muted-foreground">{gym.slug} · {[gym.city, gym.province, gym.country].filter(Boolean).join(', ') || 'Location not set'}</p></td><td className="px-4 py-3">{gym.admin ? <><p>{gym.admin.fullName}</p><p className="text-xs text-muted-foreground">{gym.admin.email}</p></> : <span className="text-muted-foreground">No active admin</span>}</td><td className="px-4 py-3">{gym._count.memberProfiles.toLocaleString()}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${gym.isActive ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{gym.isActive ? 'Active' : 'Suspended'}</span></td><td className="px-4 py-3 whitespace-nowrap">{new Date(gym.createdAt).toLocaleDateString()}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Link className="btn-ghost p-2" aria-label={`View ${gym.name}`} to={`/admin/gyms/${gym.id}`}><Eye className="h-4 w-4" /></Link><button className="btn-ghost p-2" aria-label={`Edit ${gym.name}`} onClick={() => setForm(gym)}><Pencil className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>}
      {!loading && !error && result && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"><p className="text-xs text-muted-foreground">Showing {result.data.length ? (page - 1) * result.meta.pageSize + 1 : 0}–{Math.min(page * result.meta.pageSize, result.meta.total)} of {result.meta.total}</p><div className="flex items-center gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="px-2 py-1.5" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm">Page {result.meta.page} of {result.meta.totalPages}</span><Button variant="outline" disabled={page >= result.meta.totalPages} onClick={() => setPage((n) => n + 1)} className="px-2 py-1.5" aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button></div></div>}
    </div>
    {form && <GymForm initial={form === 'create' ? undefined : form} onClose={() => setForm(null)} onSaved={onSaved} />}
    {setup && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="setup-title" className="surface-card w-full max-w-lg p-6"><h2 id="setup-title" className="text-lg font-semibold">Gym created — secure the setup link</h2><p className="mt-2 text-sm text-muted-foreground">The administrator account for {setup.data.name} has no password until this one-time link is redeemed. Save it now; it will not be shown again after closing.</p><label className="label mt-5">One-time setup link</label><textarea readOnly value={setup.setupUrl} className="input min-h-24 resize-y font-mono text-xs" onFocus={(event) => event.currentTarget.select()} /><p className="mt-2 text-xs text-muted-foreground">Expires {new Date(setup.setupExpiresAt).toLocaleString()}</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(setup.setupUrl); setCopied(true); }} className="px-4 py-2">{copied ? 'Copied' : 'Copy link'}</Button><Button onClick={() => { setSetup(null); setCopied(false); }} className="px-4 py-2">Done</Button></div></section></div>}
  </div>;
}
