import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Building2, CalendarDays, CircleDollarSign, ClipboardList, CreditCard, Dumbbell, FileBarChart, Settings, Users, UserRoundCog } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api } from '../lib/api';

interface GymOverview {
  id: string; name: string; logoUrl: string | null; currency: string; timezone: string;
  isActive: boolean;
  _count: { memberProfiles: number; instructorProfiles: number; plans: number; subscriptions: number };
}

const modules = [
  { title: 'Gym information', description: 'Commercial details, location, logo and currency.', icon: Building2, href: '/gym/settings', state: 'available' },
  { title: 'Members', description: 'Member directory and assignments.', icon: Users, href: '/gym/members', state: 'available' },
  { title: 'Instructors', description: 'Instructor accounts and member assignments.', icon: UserRoundCog, href: '/gym/instructors', state: 'available' },
  { title: 'Membership plans', description: 'Gym-specific prices, durations and conditions.', icon: CreditCard, href: '/gym/plans', state: 'available' },
  { title: 'Memberships', description: 'Assignments, renewals, history and expirations.', icon: CreditCard, href: '/gym/subscriptions', state: 'available' },
  { title: 'Payments', description: 'Administrative records of payments received outside the platform.', icon: CircleDollarSign, href: '/gym/payments', state: 'available' },
  { title: 'Outstanding balances', description: 'Charges, partial payments and overdue debts.', icon: CircleDollarSign, href: '/gym/receivables', state: 'available' },
  { title: 'Cash register', description: 'Daily cash sessions, opening and closing.', icon: CircleDollarSign, href: '/gym/cash', state: 'available' },
  { title: 'Attendance', description: 'Manual and QR check-ins, access rules and history.', icon: CalendarDays, href: '/gym/attendance', state: 'available' },
  { title: 'Routines', description: 'Routine builder, assignments, versions and history.', icon: Dumbbell, href: '/gym/routines', state: 'available' },
  { title: 'Reports', description: 'Printable schedules and reports.', icon: FileBarChart, state: 'pending' },
  { title: 'Settings & profile', description: 'Operating preferences and administrator account.', icon: Settings, href: '/gym/settings', state: 'available' },
];

export function GymDashboardPage() {
  const [gym, setGym] = useState<GymOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setGym((await api<{ data: GymOverview }>('/gym')).data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your gym'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  if (loading) return <LoadingState label="Loading your gym dashboard…" />;
  if (error) return <ErrorState title="Gym dashboard unavailable" message={error} onRetry={load} />;
  if (!gym) return null;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center gap-4">
      {gym.logoUrl ? <img src={gym.logoUrl} alt={`${gym.name} logo`} className="h-14 w-14 rounded-xl border border-border object-contain bg-card p-1" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-7 w-7" /></div>}
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-primary">GYM ADMINISTRATION</p><h1 className="truncate text-2xl font-bold tracking-tight">{gym.name}</h1><p className="text-sm text-muted-foreground">{gym.timezone} · {gym.currency}</p></div>
      <Link to="/gym/settings" className="btn-outline px-4 py-2"><Settings className="h-4 w-4" /> Gym settings</Link>
    </header>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Members" value={gym._count.memberProfiles} icon={Users} />
      <StatCard title="Instructors" value={gym._count.instructorProfiles} icon={UserRoundCog} />
      <StatCard title="Membership plans" value={gym._count.plans} icon={CreditCard} />
      <StatCard title="Subscriptions" value={gym._count.subscriptions} icon={Activity} />
    </div>

    <section><div className="mb-4"><h2 className="text-lg font-semibold">Gym modules</h2><p className="text-sm text-muted-foreground">Available tools open in this workspace; pending modules are clearly marked.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{modules.map(({ title, description, icon: Icon, href, state }) => <article key={title} className="surface-card flex min-h-32 flex-col p-4"><div className="flex items-start justify-between gap-2"><div className={`rounded-lg p-2 ${state === 'available' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Icon className="h-5 w-5" /></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state === 'available' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{state === 'available' ? 'Available' : 'Pending'}</span></div><h3 className="mt-3 font-medium">{title}</h3><p className="mt-1 flex-1 text-xs text-muted-foreground">{description}</p>{href && <Link className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" to={href}>Open <ArrowRight className="h-4 w-4" /></Link>}</article>)}</div>
    </section>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><ClipboardList className="h-4 w-4" /> Payment options represent administrative records; no online payment processing is enabled.</p>
  </div>;
}
