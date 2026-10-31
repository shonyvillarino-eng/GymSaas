import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Building2, Check, ImagePlus, Save, UserRound, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  phone: z.string().max(40), address: z.string().max(240), city: z.string().max(80),
  province: z.string().max(80), postalCode: z.string().max(24), country: z.string().max(80),
  timezone: z.string().min(1, 'Choose a timezone').max(64),
  currency: z.enum(['ARS', 'USD', 'EUR', 'BRL', 'CLP', 'UYU', 'MXN']),
});
type ProfileForm = z.infer<typeof profileSchema>;
interface GymData extends ProfileForm { id: string; logoUrl: string | null; isActive: boolean }
interface DaySchedule { day: string; open: string; close: string; closed: boolean }
interface Preferences {
  defaultMembershipDurationDays: number;
  attendanceDuplicateToleranceMinutes: number;
  membershipExpiryWarningDays: number;
  schedule: DaySchedule[];
  acceptedPaymentMethods: string[];
  receipt: { businessName: string; taxId: string; address: string; phone: string; footer: string };
  notifications: { membershipExpiry: boolean; attendance: boolean; administrativeActivity: boolean };
  attendancePolicy: { requireActiveMember: boolean; requireValidMembership: boolean; allowAdministrativeExceptions: boolean };
}
interface AdminProfile { id: string; email: string; fullName: string; phone: string | null; role: string }
type Section = 'business' | 'operations' | 'profile';

const days = [
  ['MONDAY', 'Monday'], ['TUESDAY', 'Tuesday'], ['WEDNESDAY', 'Wednesday'], ['THURSDAY', 'Thursday'], ['FRIDAY', 'Friday'], ['SATURDAY', 'Saturday'], ['SUNDAY', 'Sunday'],
] as const;
const methods = [
  ['CASH', 'Cash'], ['TRANSFER', 'Transfer'], ['BANK_TRANSFER', 'Bank transfer'], ['CARD', 'Card (record only)'], ['CHECK', 'Check'], ['OTHER', 'Other'],
] as const;
const emptyPreferences: Preferences = {
  defaultMembershipDurationDays: 30, attendanceDuplicateToleranceMinutes: 30, membershipExpiryWarningDays: 7,
  schedule: days.map(([day]) => ({ day, open: '06:00', close: '22:00', closed: day === 'SUNDAY' })),
  acceptedPaymentMethods: ['CASH', 'TRANSFER', 'CARD'],
  receipt: { businessName: '', taxId: '', address: '', phone: '', footer: '' },
  notifications: { membershipExpiry: true, attendance: false, administrativeActivity: true },
  attendancePolicy: { requireActiveMember: true, requireValidMembership: true, allowAdministrativeExceptions: true },
};

const zodMessage = apiErrorMessage;

export function GymSettingsPage() {
  const { updateUser } = useAuth();
  const [gym, setGym] = useState<GymData | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [section, setSection] = useState<Section>('business');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  const load = async () => {
    setLoading(true); setLoadError('');
    try {
      const [gymResult, prefResult, adminResult] = await Promise.all([
        api<{ data: GymData }>('/gym'), api<{ data: Preferences }>('/gym/preferences'), api<{ data: AdminProfile }>('/gym/profile'),
      ]);
      setGym(gymResult.data); reset({
        name: gymResult.data.name, email: gymResult.data.email ?? '', phone: gymResult.data.phone ?? '',
        address: gymResult.data.address ?? '', city: gymResult.data.city ?? '', province: gymResult.data.province ?? '',
        postalCode: gymResult.data.postalCode ?? '', country: gymResult.data.country ?? '',
        timezone: gymResult.data.timezone, currency: gymResult.data.currency as ProfileForm['currency'],
      });
      setPreferences(prefResult.data); setAdmin(adminResult.data);
    } catch (cause) { setLoadError(zodMessage(cause)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => () => { if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  const saveBusiness = handleSubmit(async (values) => {
    setSavingProfile(true); setFormError(''); setSuccess('');
    try {
      const body = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]));
      const result = await api<{ data: GymData }>('/gym', { method: 'PATCH', body: JSON.stringify(body) });
      setGym((current) => current ? { ...current, ...result.data } : current);
      setSuccess('Gym information saved.');
    } catch (cause) { setFormError(zodMessage(cause)); }
    finally { setSavingProfile(false); }
  });

  const uploadLogo = async () => {
    if (!logoFile) return;
    setUploadingLogo(true); setFormError(''); setSuccess('');
    try {
      const body = new FormData(); body.append('logo', logoFile);
      const result = await fetch('/api/v1/gym/logo', { method: 'POST', credentials: 'include', body });
      const payload = await result.json() as { data?: { logoUrl: string | null }; error?: string; details?: Record<string, string[]> };
      if (!result.ok) {
        const details = Object.values(payload.details ?? {}).flat().join(' ');
        throw new Error(details ? `${payload.error ?? 'Could not upload logo'}: ${details}` : payload.error ?? 'Could not upload logo');
      }
      setGym((current) => current ? { ...current, logoUrl: payload.data?.logoUrl ?? null } : current);
      setLogoFile(null); setLogoPreview(''); setSuccess('Gym logo uploaded.');
    } catch (cause) { setFormError(zodMessage(cause)); }
    finally { setUploadingLogo(false); }
  };

  const savePreferences = async (event: FormEvent) => {
    event.preventDefault(); setSavingPreferences(true); setFormError(''); setSuccess('');
    try {
      const saved = await api<{ data: Preferences }>('/gym/preferences', { method: 'PUT', body: JSON.stringify(preferences) });
      setPreferences(saved.data); setSuccess('Operating preferences saved.');
    } catch (cause) { setFormError(zodMessage(cause)); }
    finally { setSavingPreferences(false); }
  };

  const saveAdminProfile = async (event: FormEvent) => {
    event.preventDefault(); setSavingAdmin(true); setFormError(''); setSuccess('');
    try {
      if (!admin?.fullName.trim() || admin.fullName.trim().length < 2) throw new Error('Name must be at least 2 characters.');
      await api('/gym/profile', { method: 'PATCH', body: JSON.stringify({ fullName: admin.fullName.trim(), phone: admin.phone || null }) });
      updateUser({ fullName: admin.fullName.trim() });
      setSuccess('Administrator profile updated.');
    } catch (cause) { setFormError(zodMessage(cause)); }
    finally { setSavingAdmin(false); }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setFormError(''); setSuccess('');
    if (passwords.newPassword !== passwords.confirmPassword) { setFormError('New passwords do not match.'); return; }
    if (!window.confirm('Change the administrator password now?')) return;
    setSavingAdmin(true);
    try {
      await api<void>('/gym/profile/password', { method: 'PUT', body: JSON.stringify({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }) });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess('Password changed successfully.');
    } catch (cause) { setFormError(zodMessage(cause)); }
    finally { setSavingAdmin(false); }
  };

  if (loading) return <LoadingState label="Loading gym settings…" />;
  if (loadError) return <ErrorState title="Settings unavailable" message={loadError} onRetry={load} />;
  if (!gym) return null;

  const updateSchedule = (day: string, update: Partial<DaySchedule>) => setPreferences((current) => ({ ...current, schedule: current.schedule.map((item) => item.day === day ? { ...item, ...update } : item) }));
  const notice = (text: string) => formError ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{formError}</p> : success ? <SuccessState message={success || text} /> : null;
  const tabs: { id: Section; label: string; icon: typeof Building2 }[] = [{ id: 'business', label: 'Gym information', icon: Building2 }, { id: 'operations', label: 'Operating preferences', icon: Save }, { id: 'profile', label: 'Administrator profile', icon: UserRound }];

  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-sm font-medium text-primary">GYM ADMINISTRATION</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Gym settings</h1><p className="text-sm text-muted-foreground">Manage {gym.name}, operating rules and your administrator account.</p></header>
    <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Settings sections">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setFormError(''); setSuccess(''); }} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${section === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

    {section === 'business' && <form onSubmit={saveBusiness} className="space-y-5">
      <section className="surface-card p-5 sm:p-6"><h2 className="font-semibold">Business information</h2><p className="mb-5 text-sm text-muted-foreground">These values identify your gym on the platform and help contextualize future reports.</p><div className="grid gap-4 sm:grid-cols-2"><Input label="Commercial name" required {...register('name')} error={errors.name?.message} /><Input label="Contact email" type="email" {...register('email')} error={errors.email?.message} /><Input label="Phone" type="tel" {...register('phone')} error={errors.phone?.message} /><Input label="Address" {...register('address')} error={errors.address?.message} /><Input label="City" {...register('city')} error={errors.city?.message} /><Input label="Province / state" {...register('province')} error={errors.province?.message} /><Input label="Postal code" {...register('postalCode')} error={errors.postalCode?.message} /><Input label="Country" {...register('country')} error={errors.country?.message} /><label><span className="label">Time zone</span><select className="input" {...register('timezone')}><option value="America/Argentina/Buenos_Aires">Argentina — Buenos Aires (UTC−03:00)</option><option value="America/Argentina/Cordoba">Argentina — Córdoba</option><option value="America/Argentina/Mendoza">Argentina — Mendoza</option><option value="America/Argentina/Salta">Argentina — Salta</option><option value="America/Argentina/Ushuaia">Argentina — Ushuaia</option><option value="America/Santiago">Chile — Santiago</option><option value="America/Montevideo">Uruguay — Montevideo</option><option value="America/Sao_Paulo">Brazil — São Paulo</option><option value="America/Mexico_City">Mexico — Mexico City</option><option value="America/New_York">United States — New York</option><option value="America/Los_Angeles">United States — Los Angeles</option><option value="Europe/Madrid">Spain — Madrid</option><option value="UTC">UTC</option></select>{errors.timezone && <p className="mt-1 text-xs text-destructive">{errors.timezone.message}</p>}</label><label><span className="label">Currency</span><select className="input" {...register('currency')}><option value="ARS">ARS — Argentine peso</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option><option value="BRL">BRL — Brazilian real</option><option value="CLP">CLP — Chilean peso</option><option value="UYU">UYU — Uruguayan peso</option><option value="MXN">MXN — Mexican peso</option></select>{errors.currency && <p className="mt-1 text-xs text-destructive">{errors.currency.message}</p>}</label></div><div className="mt-5 flex justify-end"><Button type="submit" loading={savingProfile} className="px-4 py-2"><Save className="h-4 w-4" /> Save information</Button></div></section>
      <section className="surface-card p-5 sm:p-6"><h2 className="font-semibold">Gym logo</h2><p className="mb-4 text-sm text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. Stored in S3-compatible object storage, not PostgreSQL.</p><div className="flex flex-wrap items-center gap-5"><div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">{logoPreview || gym.logoUrl ? <img src={logoPreview || gym.logoUrl || ''} alt="Gym logo preview" className="h-full w-full object-contain p-2" /> : <ImagePlus className="h-8 w-8 text-muted-foreground" />}</div><div className="space-y-3"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose gym logo" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { setFormError('Logo must be no larger than 2 MB.'); return; } setFormError(''); setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm" />{logoFile && <div className="flex gap-2"><Button type="button" onClick={() => void uploadLogo()} loading={uploadingLogo} className="px-3 py-2">Upload logo</Button><Button type="button" variant="outline" onClick={() => { setLogoFile(null); setLogoPreview(''); }} className="px-3 py-2"><X className="h-4 w-4" /> Cancel</Button></div>}</div></div></section>
      {formError && notice('')}{success && notice('')}
    </form>}

    {section === 'operations' && <form onSubmit={(event) => void savePreferences(event)} className="space-y-5">
      <section className="surface-card p-5 sm:p-6"><h2 className="font-semibold">Membership and attendance</h2><p className="mb-5 text-sm text-muted-foreground">These settings will be defaults for the corresponding modules.</p><div className="grid gap-4 sm:grid-cols-2"><Input label="Default membership duration (days)" type="number" min={1} max={366} value={preferences.defaultMembershipDurationDays} onChange={(event) => setPreferences((p) => ({ ...p, defaultMembershipDurationDays: Number(event.target.value) }))} /><Input label="Duplicate attendance tolerance (minutes)" type="number" min={0} max={1440} value={preferences.attendanceDuplicateToleranceMinutes} onChange={(event) => setPreferences((p) => ({ ...p, attendanceDuplicateToleranceMinutes: Number(event.target.value) }))} /><Input label="Upcoming membership expiry window (days)" type="number" min={1} max={60} value={preferences.membershipExpiryWarningDays} onChange={(event) => setPreferences((p) => ({ ...p, membershipExpiryWarningDays: Number(event.target.value) }))} /><p className="text-xs text-muted-foreground sm:col-span-2">A new check-in can be recorded after the chosen interval; zero disables the duplicate window. Expiry indicators use the selected day window (1–60 days).</p></div></section>
      <section className="surface-card p-5 sm:p-6"><h2 className="font-semibold">Access policy</h2><p className="mb-4 text-sm text-muted-foreground">Applied by the server on every check-in, manual or QR. The member&apos;s document is never used to decide access.</p><div className="space-y-3">{([['requireActiveMember', 'Require an ACTIVE administrative status', 'Suspended or inactive members are blocked at the door.'], ['requireValidMembership', 'Require a membership in force', 'A membership must be started and not expired at the time of entry.'], ['allowAdministrativeExceptions', 'Allow justified administrative exceptions', 'An administrator may record an entry with a written justification; it is audited.']] as const).map(([key, label, hint]) => <label key={key} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" className="mt-0.5" checked={preferences.attendancePolicy[key]} onChange={(event) => setPreferences((p) => ({ ...p, attendancePolicy: { ...p.attendancePolicy, [key]: event.target.checked } }))} /><span><span className="font-medium">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span></span></label>)}</div></section>
      <section className="surface-card p-5 sm:p-6"><h2 className="mb-1 font-semibold">Weekly opening hours</h2><p className="mb-4 text-sm text-muted-foreground">Select the days and times when the gym is open.</p><div className="space-y-3">{days.map(([day, label]) => { const value = preferences.schedule.find((item) => item.day === day) ?? { day, open: '06:00', close: '22:00', closed: true }; return <div key={day} className="grid items-center gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_120px_120px_90px]"><span className="text-sm font-medium">{label}</span><Input aria-label={`${label} opening time`} type="time" value={value.open} disabled={value.closed} onChange={(event) => updateSchedule(day, { open: event.target.value })} /><Input aria-label={`${label} closing time`} type="time" value={value.close} disabled={value.closed} onChange={(event) => updateSchedule(day, { close: event.target.value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.closed} onChange={(event) => updateSchedule(day, { closed: event.target.checked })} /> Closed</label></div>; })}</div></section>
      <section className="surface-card p-5 sm:p-6"><h2 className="mb-1 font-semibold">Administrative payment categories</h2><p className="mb-4 text-sm text-muted-foreground">These are manual record types only; no card processing or payment gateway is connected.</p><div className="grid gap-3 sm:grid-cols-2">{methods.map(([code, label]) => <label key={code} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={preferences.acceptedPaymentMethods.includes(code)} onChange={(event) => setPreferences((p) => ({ ...p, acceptedPaymentMethods: event.target.checked ? [...p.acceptedPaymentMethods, code] : p.acceptedPaymentMethods.filter((item) => item !== code) }))} />{label}</label>)}</div></section>
      <section className="surface-card p-5 sm:p-6"><h2 className="mb-4 font-semibold">Internal receipt details</h2><div className="grid gap-4 sm:grid-cols-2"><Input label="Business name" value={preferences.receipt.businessName} onChange={(event) => setPreferences((p) => ({ ...p, receipt: { ...p.receipt, businessName: event.target.value } }))} /><Input label="Tax ID" value={preferences.receipt.taxId} onChange={(event) => setPreferences((p) => ({ ...p, receipt: { ...p.receipt, taxId: event.target.value } }))} /><Input label="Receipt address" value={preferences.receipt.address} onChange={(event) => setPreferences((p) => ({ ...p, receipt: { ...p.receipt, address: event.target.value } }))} /><Input label="Receipt phone" value={preferences.receipt.phone} onChange={(event) => setPreferences((p) => ({ ...p, receipt: { ...p.receipt, phone: event.target.value } }))} /><label className="sm:col-span-2"><span className="label">Footer</span><textarea maxLength={500} className="input min-h-20" value={preferences.receipt.footer} onChange={(event) => setPreferences((p) => ({ ...p, receipt: { ...p.receipt, footer: event.target.value } }))} /></label></div></section>
      <section className="surface-card p-5 sm:p-6"><h2 className="mb-4 font-semibold">Notification preferences</h2><div className="space-y-3">{([['membershipExpiry', 'Membership expiry reminders'], ['attendance', 'Attendance notifications'], ['administrativeActivity', 'Administrative activity']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={preferences.notifications[key]} onChange={(event) => setPreferences((p) => ({ ...p, notifications: { ...p.notifications, [key]: event.target.checked } }))} />{label}</label>)}</div></section>
      {formError && notice('')}{success && notice('')}<div className="flex justify-end"><Button type="submit" loading={savingPreferences} className="px-4 py-2"><Save className="h-4 w-4" /> Save preferences</Button></div>
    </form>}

    {section === 'profile' && admin && <div className="space-y-5"><section className="surface-card p-5 sm:p-6"><h2 className="font-semibold">Administrator details</h2><p className="mb-5 text-sm text-muted-foreground">Your email identifies your sign-in account and cannot be changed here.</p><form onSubmit={(event) => void saveAdminProfile(event)} className="grid gap-4 sm:grid-cols-2"><Input label="Full name" required value={admin.fullName} onChange={(event) => setAdmin({ ...admin, fullName: event.target.value })} /><Input label="Phone" type="tel" value={admin.phone ?? ''} onChange={(event) => setAdmin({ ...admin, phone: event.target.value })} /><Input label="Sign-in email" type="email" readOnly value={admin.email} /><div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={savingAdmin} className="px-4 py-2"><Save className="h-4 w-4" /> Save profile</Button></div></form></section>
      <section className="surface-card p-5 sm:p-6"><h2 className="font-semibold">Change password</h2><p className="mb-5 text-sm text-muted-foreground">Confirm your current password to update this account’s credentials.</p><form onSubmit={(event) => void changePassword(event)} className="space-y-4"><Input label="Current password" type="password" required autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /><div className="grid gap-4 sm:grid-cols-2"><Input label="New password" type="password" required minLength={8} autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /><Input label="Confirm new password" type="password" required autoComplete="new-password" value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} /></div><div className="flex justify-end"><Button type="submit" loading={savingAdmin} className="px-4 py-2"><Check className="h-4 w-4" /> Change password</Button></div></form></section>{formError && notice('')}{success && notice('')}</div>}
  </div>;
}
