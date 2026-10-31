import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api, ApiRequestError } from '../lib/api';

const setupSchema = z.object({ password: z.string().min(8, 'Use at least 8 characters').max(72), confirmPassword: z.string() }).refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
type SetupForm = z.infer<typeof setupSchema>;

export function CompleteSetupPage() {
  const location = useLocation();
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
  const { register, handleSubmit, formState: { errors } } = useForm<SetupForm>({ resolver: zodResolver(setupSchema) });

  const submit = handleSubmit(async ({ password }) => {
    setError(''); setSaving(true);
    try {
      await api('/auth/complete-setup', { method: 'POST', body: JSON.stringify({ token, password }) });
      setComplete(true);
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'Could not set the password.'); }
    finally { setSaving(false); }
  });

  if (complete) return <main className="flex min-h-screen items-center justify-center bg-background p-4"><section className="surface-card w-full max-w-md p-8 text-center"><h1 className="text-xl font-bold">Password set successfully</h1><p className="mt-2 text-sm text-muted-foreground">Your administrator account is ready. Sign in with the email address associated with your gym.</p><Button onClick={() => navigate('/login')} className="mt-6 px-4 py-2">Go to sign in</Button></section></main>;

  return <main className="flex min-h-screen items-center justify-center bg-background p-4"><section className="surface-card w-full max-w-md p-8"><div className="mb-7 text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">G</div><h1 className="text-2xl font-bold">Set your password</h1><p className="mt-2 text-sm text-muted-foreground">Choose a password to activate your gym administrator account.</p></div>{!token ? <div role="alert" className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">This setup link does not contain a token. Request a new link from your platform administrator.<Link to="/login" className="block underline">Sign in</Link></div> : <form onSubmit={submit} className="space-y-5"><Input label="New password" type="password" autoComplete="new-password" required {...register('password')} error={errors.password?.message} /><Input label="Confirm password" type="password" autoComplete="new-password" required {...register('confirmPassword')} error={errors.confirmPassword?.message} />{error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}<Button type="submit" loading={saving} className="w-full px-4 py-2.5">Set password</Button></form>}</section></main>;
}
