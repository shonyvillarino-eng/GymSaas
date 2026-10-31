import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Building2, Plus, Users, UserRoundCog } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { ErrorState, LoadingState } from '../../components/ui/states';
import { api } from '../../lib/api';

interface DashboardData {
  totalGyms: number;
  activeGyms: number;
  suspendedGyms: number;
  gymsThisMonth: number;
  totalMembers: number;
  totalInstructors: number;
  registrationTrend: { month: string; count: number }[];
  statusDistribution: { status: string; count: number }[];
}

export function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api<DashboardData>('/admin/dashboard'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <LoadingState label="Loading platform metrics…" />;
  if (error) return <ErrorState title="Dashboard unavailable" message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">PLATFORM ADMINISTRATION</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Platform overview</h2>
          <p className="text-muted-foreground">Live metrics across all registered gyms.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} className="px-4 py-2">Refresh</Button>
          <Link to="/admin/gyms" className="btn-primary px-4 py-2"><Plus className="h-4 w-4" /> Manage gyms</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total gyms" value={data.totalGyms} icon={Building2} />
        <StatCard title="Active gyms" value={data.activeGyms} icon={Activity} />
        <StatCard title="Suspended gyms" value={data.suspendedGyms} icon={Building2} />
        <StatCard title="New this month" value={data.gymsThisMonth} icon={Plus} />
        <StatCard title="Members across gyms" value={data.totalMembers} icon={Users} />
        <StatCard title="Instructors across gyms" value={data.totalInstructors} icon={UserRoundCog} />
      </div>

      <section className="surface-card p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="font-semibold">Gym registrations</h3>
          <p className="text-sm text-muted-foreground">Monthly registrations for the last 12 months</p>
        </div>
        {data.registrationTrend.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No registrations in this period.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.registrationTrend} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs><linearGradient id="gymTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 12 }} />
                <Area type="monotone" dataKey="count" name="Gyms" stroke="hsl(var(--primary))" fill="url(#gymTrend)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
