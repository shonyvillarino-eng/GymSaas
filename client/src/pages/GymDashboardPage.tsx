import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowRight, Building2, CalendarDays, CircleDollarSign, ClipboardList, CreditCard, Dumbbell, FileBarChart, Settings, Users, UserRoundCog } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatCurrency, resolveLocale } from '../lib/format';

interface Overview {
  members: { total: number; active: number; inactive: number };
  memberships: { active: number; expired: number; expiringSoon: number };
  attendance: { today: number; thisMonth: number };
  revenue: { currency: string; collectedThisMonth: number; pendingObligations: number };
}

interface GymOverview {
  id: string; name: string; logoUrl: string | null; currency: string; timezone: string;
  isActive: boolean;
  _count: { memberProfiles: number; instructorProfiles: number; plans: number; subscriptions: number };
}

const modules = [
  { key: 'gymInfo', icon: Building2, href: '/gym/settings' },
  { key: 'members', icon: Users, href: '/gym/members' },
  { key: 'instructors', icon: UserRoundCog, href: '/gym/instructors' },
  { key: 'plans', icon: CreditCard, href: '/gym/plans' },
  { key: 'subscriptions', icon: CreditCard, href: '/gym/subscriptions' },
  { key: 'payments', icon: CircleDollarSign, href: '/gym/payments' },
  { key: 'receivables', icon: CircleDollarSign, href: '/gym/receivables' },
  { key: 'cash', icon: CircleDollarSign, href: '/gym/cash' },
  { key: 'attendance', icon: CalendarDays, href: '/gym/attendance' },
  { key: 'routines', icon: Dumbbell, href: '/gym/routines' },
  { key: 'reports', icon: FileBarChart, href: '/gym/reports' },
  { key: 'settings', icon: Settings, href: '/gym/settings' },
];

export function GymDashboardPage() {
  const { t } = useTranslation();
  const { language, locale } = useAuth();
  const formatLocale = resolveLocale(language, locale);
  const [gym, setGym] = useState<GymOverview | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [gymResult, overviewResult] = await Promise.all([
        api<{ data: GymOverview }>('/gym'),
        api<{ data: Overview }>('/dashboard/overview?period=month'),
      ]);
      setGym(gymResult.data);
      setOverview(overviewResult.data);
    } catch (cause) {
      setGym(null);
      setOverview(null);
      setError(apiErrorMessage(cause));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  if (loading) return <LoadingState label={t('dashboard.loading')} />;
  if (error) return <ErrorState title={t('dashboard.loadError')} message={error} onRetry={load} />;
  if (!gym) return null;

  const currency = overview?.revenue.currency ?? gym.currency;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center gap-4">
      {gym.logoUrl ? <img src={gym.logoUrl} alt={`${gym.name} logo`} className="h-14 w-14 rounded-xl border border-border object-contain bg-card p-1" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-7 w-7" /></div>}
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-primary">{t('dashboard.adminLabel')}</p><h1 className="truncate text-2xl font-bold tracking-tight">{gym.name}</h1><p className="text-sm text-muted-foreground">{gym.timezone} · {gym.currency}</p></div>
      <Link to="/gym/settings" className="btn-outline px-4 py-2"><Settings className="h-4 w-4" /> {t('dashboard.gymSettings')}</Link>
    </header>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard title={t('dashboard.cards.activeMembers')} value={overview?.members.active ?? 0} icon={Users} hint={t('dashboard.cards.registeredHint', { total: overview?.members.total ?? 0 })} />
      <StatCard title={t('dashboard.cards.activeMemberships')} value={overview?.memberships.active ?? 0} icon={CreditCard} hint={t('dashboard.cards.expiringHint', { count: overview?.memberships.expiringSoon ?? 0 })} />
      <StatCard title={t('dashboard.cards.todayAttendance')} value={overview?.attendance.today ?? 0} icon={CalendarDays} hint={t('dashboard.cards.monthHint', { count: overview?.attendance.thisMonth ?? 0 })} />
      <StatCard title={t('dashboard.cards.monthRevenue')} value={overview ? formatCurrency(overview.revenue.collectedThisMonth, currency, formatLocale) : '—'} icon={CircleDollarSign} hint={t('dashboard.cards.excludingVoided')} />
      <StatCard title={t('dashboard.cards.pendingDebt')} value={overview ? formatCurrency(overview.revenue.pendingObligations, currency, formatLocale) : '—'} icon={Activity} hint={t('dashboard.cards.calculatedBalance')} />
    </div>

    <section><div className="mb-4"><h2 className="text-lg font-semibold">{t('dashboard.modulesTitle')}</h2><p className="text-sm text-muted-foreground">{t('dashboard.modulesHint')}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{modules.map(({ key, icon: Icon, href }) => <article key={key} className="surface-card flex min-h-32 flex-col p-4"><div className="flex items-start justify-between gap-2"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{t('nav.available')}</span></div><h3 className="mt-3 font-medium">{t(`dashboard.modules.${key}.title`)}</h3><p className="mt-1 flex-1 text-xs text-muted-foreground">{t(`dashboard.modules.${key}.description`)}</p><Link className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" to={href}>{t('app.open')} <ArrowRight className="h-4 w-4" /></Link></article>)}</div>
    </section>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><ClipboardList className="h-4 w-4" /> {t('dashboard.paymentsDisclaimer')}</p>
  </div>;
}
