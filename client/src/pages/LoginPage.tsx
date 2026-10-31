import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { ApiRequestError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingState } from '../components/ui/states';

export function LoginPage() {
  const { t } = useTranslation();
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <LoadingState label={t('login.checkingSession')} />;
  if (user) return <Navigate to={user.role === 'SUPER_ADMIN' ? '/admin' : user.role === 'GYM_ADMIN' ? '/gym' : '/'} replace />;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const signedIn = await login(email, password);
      const destination = (location.state as { from?: string } | null)?.from;
      navigate(destination ?? (signedIn.role === 'SUPER_ADMIN' ? '/admin' : signedIn.role === 'GYM_ADMIN' ? '/gym' : '/'), { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError && cause.status === 401
          ? t('login.invalidCredentials')
          : t('login.signInError'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="surface-card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">G</div>
          <h1 className="text-2xl font-bold">GymFlow</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('login.subtitle')}</p>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <Input label={t('login.email')} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input label={t('login.password')} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full px-4 py-2.5" loading={submitting}>{t('login.signIn')}</Button>
        </form>
      </section>
    </main>
  );
}
