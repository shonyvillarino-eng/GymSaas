import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorState, LoadingState, SuccessState } from '../../components/ui/states';
import { api, apiErrorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/finance';
import { MEMBER_STATUS_LABELS, type PortalProfile } from '../../lib/memberPortal';

export function PortalProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api<{ data: PortalProfile }>('/member-portal/profile');
      setProfile(response.data);
      setFullName(response.data.fullName);
      setPhone(response.data.phone ?? '');
    } catch (cause) {
      setLoadError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (fullName.trim().length < 2) {
      setError('Enter your full name (at least 2 characters).');
      return;
    }
    setSaving(true);
    try {
      await api('/member-portal/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim() }),
      });
      setNotice('Your personal details were updated.');
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordNotice('');
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('The new password must have at least 8 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('The confirmation does not match the new password.');
      return;
    }
    setChangingPassword(true);
    try {
      await api('/member-portal/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordNotice('Your password was changed. Keep it in a safe place.');
    } catch (cause) {
      setPasswordError(apiErrorMessage(cause));
    } finally {
      setChangingPassword(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (loading) return <LoadingState label="Loading your profile…" />;
  if (loadError) return <ErrorState title="Your profile is unavailable" message={loadError} onRetry={load} />;
  if (!profile) return null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-sm font-medium text-primary">MY ACCOUNT</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">My profile</h1>
        <p className="text-sm text-muted-foreground">Your personal details and sign-in credentials.</p>
      </header>

      <section className="surface-card space-y-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Account information</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <UserRound className="h-3 w-3" /> Full name
            </dt>
            <dd className="font-medium">{profile.fullName}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" /> Email (sign-in)
            </dt>
            <dd className="truncate font-medium">{profile.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> Phone
            </dt>
            <dd className="font-medium">{profile.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Date of birth</dt>
            <dd className="font-medium">{profile.birthDate ? formatDate(profile.birthDate) : 'Not registered'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Member since</dt>
            <dd className="font-medium">{formatDate(profile.joinDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Account status</dt>
            <dd className="font-medium">{MEMBER_STATUS_LABELS[profile.status] ?? profile.status}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" /> Gym
            </dt>
            <dd className="font-medium">
              {profile.gym.name}
              {profile.gym.city ? ` · ${profile.gym.city}` : ''}
            </dd>
          </div>
        </dl>
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          The gym, your role, your administrative status, your membership and your assigned coach can only be changed by the
          gym administrator. {profile.emailNote}
        </p>
      </section>

      <section className="surface-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Edit my details</h2>
        <form onSubmit={saveProfile} className="mt-3 space-y-3">
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && <SuccessState message={notice} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Full name"
              required
              minLength={2}
              maxLength={120}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
            />
            <Input
              label="Phone"
              type="tel"
              maxLength={40}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your email is read-only here: it identifies your sign-in account.
          </p>
          <Button type="submit" loading={saving} className="px-4 py-2">
            Save changes
          </Button>
        </form>
      </section>

      <section className="surface-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole className="h-4 w-4 text-primary" aria-hidden="true" /> Change password
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your current password and choose a new one of at least 8 characters, including a letter and a number.
        </p>
        <form onSubmit={changePassword} className="mt-3 space-y-3">
          {passwordError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {passwordError}
            </p>
          )}
          {passwordNotice && <SuccessState message={passwordNotice} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Current password"
              type="password"
              required
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
            />
            <span className="hidden sm:block" />
            <Input
              label="New password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
            />
            <Input
              label="Confirm new password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
            />
          </div>
          <Button type="submit" loading={changingPassword} className="px-4 py-2">
            Update password
          </Button>
        </form>
      </section>

      <section className="surface-card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Session
          </h2>
          <p className="text-sm text-muted-foreground">Sign out of this device when you are done.</p>
        </div>
        <Button variant="outline" className="px-4 py-2" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </section>
    </div>
  );
}
