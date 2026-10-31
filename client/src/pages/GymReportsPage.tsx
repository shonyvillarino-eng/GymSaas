import { memo, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  ComposedChart,
} from 'recharts';
import { Calendar, FileSpreadsheet, FileText, RefreshCw, Users } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { cn } from '../lib/utils';

function formatCurrencyForDisplay(value: number) {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `$${(value || 0).toLocaleString('es-ES')}`;
  }
}

function formatDateForDisplay(value: string | Date) {
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    return d.toLocaleDateString('es-ES');
  } catch {
    return String(value);
  }
}

type Period = 'today' | '7d' | '30d' | 'month' | 'previous_month' | 'year' | 'custom';

type OverviewData = {
  cards: Record<string, { label: string; value: number | string; sublabel?: string; tone?: string }>;
  gym: { id: string; name: string };
};

type AttendanceSeries = { date: string; count: number };
type AttendanceData = {
  series: AttendanceSeries[];
  peak: { day?: string | null; hour?: number | null; count?: number };
  period: { from: string; to: string };
};

type RevenueSeries = { month: string; total: number; count: number };
type RevenueMethod = { method: string; total: number; count: number };
type RevenueData = {
  series: RevenueSeries[];
  byMethod: RevenueMethod[];
  totals: { total: number; count: number };
  period: { from: string; to: string };
};

type MembershipsData = {
  distribution: Array<{ status: string; count: number }>;
  expiringSoon: Array<{ memberId: string; memberName: string; endDate: string | null; status: string }>;
  newMembers: Array<{ month: string; count: number }>;
  renewals: Array<{ month: string; count: number }>;
  period: { from: string; to: string };
};

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'month', label: 'Mes actual' },
  { value: 'previous_month', label: 'Mes anterior' },
  { value: 'year', label: 'Año actual' },
  { value: 'custom', label: 'Período personalizado' },
];

const COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function formatNumber(n: number | string | undefined | null) {
  if (n === undefined || n === null) return '0';
  const num = typeof n === 'string' ? Number(n) : n;
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString('es-ES');
}

const GymReportsPage = memo(function GymReportsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [memberships, setMemberships] = useState<MembershipsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'custom') {
        if (from) params.set('from', from);
        if (to) params.set('to', to);
      }
      const q = params.toString();
      const [ov, att, rev, mem] = await Promise.all([
        api<OverviewData>(`/dashboard/overview?${q}`),
        api<AttendanceData>(`/dashboard/attendance?${q}`),
        api<RevenueData>(`/dashboard/revenue?${q}`),
        api<MembershipsData>(`/dashboard/memberships?${q}`),
      ]);
      setOverview(ov);
      setAttendance(att);
      setRevenue(rev);
      setMemberships(mem);
    } catch (err) {
      const msg = apiErrorMessage(err);
      setError(msg || 'Error al cargar dashboard');
      if ((err as any)?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, from, to]);

  const cards = overview?.cards ? Object.values(overview.cards) : [];

  if (loading && !overview) {
    return <LoadingState label="Cargando dashboard" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard y reportes</h1>
          <p className="text-sm text-slate-500">Métricas reales basadas en la base de datos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
            <Calendar className="h-4 w-4 text-slate-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="text-sm text-slate-700 focus:outline-none"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
            </>
          )}
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </header>

      {error && <ErrorState title="Error" message={error} />}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(card.value)}</p>
            {card.sublabel && <p className="mt-1 text-xs text-slate-400">{card.sublabel}</p>}
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Asistencias por día</h2>
              <p className="text-sm text-slate-500">Valores reales del período</p>
            </div>
          </header>
          {attendance?.series && attendance.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={attendance.series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Asistencias" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Sin datos</div>
          )}
          {attendance?.peak && (attendance.peak.day || attendance.peak.hour !== undefined) && (
            <p className="mt-2 text-xs text-slate-500">
              Mayor concurrencia: {attendance.peak.day || '-'} {attendance.peak.hour !== undefined && attendance.peak.hour !== null ? `a las ${attendance.peak.hour}:00` : ''} ({attendance.peak.count || 0})
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Ingresos registrados por mes</h2>
              <p className="text-sm text-slate-500">Solo pagos no anulados</p>
            </div>
          </header>
          {revenue?.series && revenue.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenue.series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: any) => formatCurrencyForDisplay(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="total" name="Ingresos" stroke="#22c55e" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Sin datos</div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Distribución por método de pago</h2>
            <p className="text-sm text-slate-500">Ingresos válidos</p>
          </header>
          {revenue?.byMethod && revenue.byMethod.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={revenue.byMethod}
                  dataKey="total"
                  nameKey="method"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry: any) => entry.method}
                >
                  {revenue.byMethod.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrencyForDisplay(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Sin datos</div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Membresías</h2>
            <p className="text-sm text-slate-500">Estado actual</p>
          </header>
          {memberships?.distribution && memberships.distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={memberships.distribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Cantidad" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Sin datos</div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Nuevas altas de socios</h2>
            <p className="text-sm text-slate-500">Por período</p>
          </header>
          {memberships?.newMembers && memberships.newMembers.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={memberships.newMembers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="count" name="Nuevos socios" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Sin datos</div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Renovaciones registradas</h2>
            <p className="text-sm text-slate-500">Por período</p>
          </header>
          {memberships?.renewals && memberships.renewals.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={memberships.renewals}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Renovaciones" fill="#06b6d4" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Sin datos</div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Membresías próximas a vencer</h2>
            <p className="text-sm text-slate-500">Vencimientos cercanos</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => (window.location.href = '/gym/reports/members')}>
              <Users className="mr-2 h-4 w-4" />
              Ver reporte de socios
            </Button>
            <Button variant="ghost" onClick={() => (window.location.href = `/api/v1/reports/export?report=members&format=pdf&period=${period}`)}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Button variant="ghost" onClick={() => (window.location.href = `/api/v1/reports/export?report=members&format=xlsx&period=${period}`)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel
            </Button>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-2 text-left font-medium text-slate-600">Socio</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Estado</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Vence</th>
              </tr>
            </thead>
            <tbody>
              {memberships?.expiringSoon && memberships.expiringSoon.length > 0 ? (
                memberships.expiringSoon.map((m) => (
                  <tr key={m.memberId} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-900">{m.memberName}</td>
                    <td className="px-4 py-2 text-slate-600">{m.status}</td>
                    <td className="px-4 py-2 text-slate-600">{m.endDate ? formatDateForDisplay(m.endDate) : '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    Sin membresías próximas a vencer
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
});

export default GymReportsPage;
