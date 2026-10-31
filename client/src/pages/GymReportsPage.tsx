import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, FileSpreadsheet, FileText, RefreshCw, Users } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { downloadReport, type ExportReport } from '../lib/dashboard';
import { formatCurrency, formatDate, formatNumber, resolveLocale } from '../lib/format';
import { cn } from '../lib/utils';

type Period = 'today' | '7d' | '30d' | 'month' | 'previous_month' | 'year' | 'custom';

type OverviewData = {
  gym: { id: string; name: string; logoUrl: string | null };
  period: { label: string; from: string; to: string };
  members: { total: number; active: number; inactive: number };
  memberships: { active: number; expired: number; pending: number; frozen: number; expiringSoon: number };
  attendance: { today: number; thisMonth: number };
  revenue: { currency: string; collectedThisMonth: number; collectedThisMonthCount: number; pendingObligations: number };
};

type AttendanceData = {
  series: Array<{ date: string; count: number }>;
  byMethod: Array<{ method: string; count: number }>;
  peak: { day?: string | null; hour?: number | null; count?: number } | null;
  comparison: { previousTotal: number; changePct: number | null };
  total: number;
  period: { from: string; to: string };
};

type RevenueData = {
  series: Array<{ month: string; total: number; count: number }>;
  byMethod: Array<{ method: string; total: number; count: number }>;
  comparison: { previousTotal: number; changePct: number | null };
  totals?: { total: number; count: number };
  total: number;
  count: number;
  period: { from: string; to: string };
};

type MembershipsData = {
  distribution: Array<{ status: string; count: number }>;
  distributionTotal: number;
  expiringSoon: Array<{ memberId: string; memberName: string; endDate: string; status: string }>;
  newMembers: Array<{ month: string; count: number }>;
  renewals: Array<{ month: string; count: number }>;
  expiringSoonCount: number;
  period: { from: string; to: string };
};

const PERIOD_OPTIONS: Period[] = ['today', '7d', '30d', 'month', 'previous_month', 'year', 'custom'];

const COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function formatMonth(value: string, locale: string) {
  if (!value) return '—';
  const date = new Date(`${value}-01T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(date);
}

function PurchaseOption({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-left text-sm hover:bg-muted focus:border-primary" onClick={onClick}>
      {label}
    </button>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function EmptyChart() {
  const { t } = useTranslation();
  return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">{t('reports.charts.noData')}</div>;
}

function Change({ value, locale }: { value: number | null; locale: string }) {
  const { t } = useTranslation();
  if (value === null) return <span className="text-xs text-muted-foreground">{t('reports.charts.noComparison')}</span>;
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  return (
    <span className={cn('text-xs font-medium', value >= 0 ? 'text-emerald-600' : 'text-destructive')}>
      {t('reports.charts.comparison', { value: `${value >= 0 ? '+' : ''}${formatted}` })}
    </span>
  );
}

const GymReportsPage = memo(function GymReportsPage() {
  const { t } = useTranslation();
  const { language, locale } = useAuth();
  const formatLocale = resolveLocale(language, locale);
  const [period, setPeriod] = useState<Period>('month');
  const [exportReportType, setExportReportType] = useState<ExportReport>('members');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [memberships, setMemberships] = useState<MembershipsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ period });
      if (period === 'custom') {
        if (!from || !to) throw new Error(t('reports.dateError'));
        if (from > to) throw new Error(t('reports.dateOrderError'));
        params.set('from', from);
        params.set('to', to);
      }
      const query = params.toString();
      const [overviewResult, attendanceResult, revenueResult, membershipsResult] = await Promise.all([
        api<{ data: OverviewData }>(`/dashboard/overview?${query}`),
        api<{ data: AttendanceData }>(`/dashboard/attendance?${query}`),
        api<{ data: RevenueData }>(`/dashboard/revenue?${query}`),
        api<{ data: MembershipsData }>(`/dashboard/memberships?${query}`),
      ]);
      setOverview(overviewResult.data);
      setAttendance(attendanceResult.data);
      setRevenue(revenueResult.data);
      setMemberships(membershipsResult.data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setOverview(null);
      setAttendance(null);
      setRevenue(null);
      setMemberships(null);
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportFile = async (format: 'pdf' | 'xlsx') => {
    setExportError('');
    setExporting(format);
    try {
      await downloadReport(exportReportType, format, {
        period,
        from: period === 'custom' ? from : undefined,
        to: period === 'custom' ? to : undefined,
      });
    } catch (cause) {
      setExportError(apiErrorMessage(cause));
    } finally {
      setExporting(null);
    }
  };

  const currency = overview?.revenue.currency ?? 'USD';
  const formatMoney = (value: number) => formatCurrency(value, currency, formatLocale);
  const formatCount = (value: number | string | undefined | null) => formatNumber(value, formatLocale);

  const cards = overview
    ? [
        { label: t('reports.cards.totalMembers'), value: formatCount(overview.members.total), hint: t('reports.currentValue') },
        { label: t('reports.cards.activeMembers'), value: formatCount(overview.members.active), hint: t('reports.currentValue') },
        { label: t('reports.cards.inactiveMembers'), value: formatCount(overview.members.inactive), hint: t('reports.currentValue') },
        { label: t('reports.cards.activeMemberships'), value: formatCount(overview.memberships.active), hint: t('reports.currentValue') },
        { label: t('reports.cards.expiringSoon'), value: formatCount(overview.memberships.expiringSoon), hint: t('reports.sevenDayWindow') },
        { label: t('reports.cards.expiredMemberships'), value: formatCount(overview.memberships.expired), hint: t('reports.currentValue') },
        { label: t('reports.cards.todayAttendance'), value: formatCount(overview.attendance.today), hint: t('reports.today') },
        { label: t('reports.cards.monthAttendance'), value: formatCount(overview.attendance.thisMonth), hint: t('reports.currentMonth') },
        { label: t('reports.cards.monthRevenue'), value: formatMoney(overview.revenue.collectedThisMonth), hint: t('reports.excludingVoided') },
        { label: t('reports.cards.pendingDebt'), value: formatMoney(overview.revenue.pendingObligations), hint: t('reports.calculatedBalance') },
      ]
    : [];

  if (loading && !overview) return <LoadingState label={t('app.loading')} />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('reports.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('reports.subtitle', { gym: overview?.gym.name ?? '', from: overview?.period.from ?? '', to: overview?.period.to ?? '' })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              className="bg-transparent text-sm focus:outline-none"
              aria-label={t('reports.period')}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option} value={option}>{t(`reports.periods.${option}`)}</option>
              ))}
            </select>
          </div>
          {period === 'custom' && (
            <>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="input w-auto" aria-label={t('reports.customFrom')} />
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="input w-auto" aria-label={t('reports.customTo')} />
            </>
          )}
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> {t('reports.refresh')}
          </Button>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 text-sm">
            <span className="sr-only">{t('reports.exportReport')}</span>
            <select
              value={exportReportType}
              onChange={(event) => setExportReportType(event.target.value as ExportReport)}
              aria-label={t('reports.exportReport')}
              className="bg-transparent text-sm focus:outline-none"
            >
              <option value="members">{t('reports.reportTypes.members')}</option>
              <option value="attendance">{t('reports.reportTypes.attendance')}</option>
              <option value="financial">{t('reports.reportTypes.financial')}</option>
            </select>
          </label>
          <Button variant="outline" onClick={() => void exportFile('pdf')} loading={exporting === 'pdf'}>
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={() => void exportFile('xlsx')} loading={exporting === 'xlsx'}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
        </div>
      </header>

      {error && <ErrorState title={t('reports.loadError')} message={error} onRetry={() => void load()} />}
      {exportError && <ErrorState title={t('reports.exportError')} message={exportError} />}

      <p className="text-xs text-muted-foreground">{t('reports.currentValueNote')}</p>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={t('reports.charts.attendanceByDay')} subtitle={t('reports.charts.attendanceByDaySubtitle')}>
          {attendance && attendance.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={attendance.series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name={t('reports.charts.attendanceByDay')} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t('reports.charts.total')}: {formatNumber(attendance?.total)}</span>
            <Change value={attendance?.comparison.changePct ?? null} />
            <span>
              {t('reports.charts.peak')}:{' '}
              {attendance?.peak
                ? `${formatDate(attendance.peak.day ?? '')}${attendance.peak.hour !== null && attendance.peak.hour !== undefined ? ` · ${String(attendance.peak.hour).padStart(2, '0')}:00` : ''}`
                : t('reports.charts.notEnoughData')}
            </span>
          </div>
        </ChartCard>

        <ChartCard title={t('reports.charts.attendanceByMethod')} subtitle={t('reports.charts.attendanceByMethodSubtitle')}>
          {attendance && attendance.byMethod.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={attendance.byMethod.map((row) => ({ name: t(`reports.method.${row.method}`, { defaultValue: row.method }), value: row.count }))}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  label
                >
                  {attendance.byMethod.map((row, index) => <Cell key={row.method} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title={t('reports.charts.revenueByMonth')} subtitle={t('reports.charts.revenueByMonthSubtitle')}>
          {revenue && revenue.series.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenue.series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="total" name={t('reports.cards.monthRevenue')} stroke="#22c55e" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t('reports.charts.total')}: {formatMoney(revenue?.total ?? 0)} ({t('reports.charts.totalPagos', { total: formatNumber(revenue?.count) })})</span>
            <Change value={revenue?.comparison.changePct ?? null} />
          </div>
        </ChartCard>

        <ChartCard title={t('reports.charts.revenueByMethod')} subtitle={t('reports.charts.revenueByMethodSubtitle')}>
          {revenue && revenue.byMethod.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={revenue.byMethod.map((row) => ({ name: t(`reports.method.${row.method}`, { defaultValue: row.method }), value: row.total }))}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  label
                >
                  {revenue.byMethod.map((row, index) => <Cell key={row.method} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title={t('reports.charts.membershipStatus')} subtitle={t('reports.charts.membershipStatusSubtitle')}>
          {memberships && memberships.distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={memberships.distribution.map((row) => ({ name: t(`reports.status.${row.status}`, { defaultValue: row.status }), value: row.count }))}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  label
                >
                  {memberships.distribution.map((row, index) => <Cell key={row.status} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title={t('reports.charts.newMembers')} subtitle={t('reports.charts.newMembersSubtitle')}>
          {memberships && memberships.newMembers.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={memberships.newMembers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(label) => formatMonth(String(label ?? ''))} />
                <Legend />
                <Area type="monotone" dataKey="count" name={t('reports.charts.newMembers')} stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title={t('reports.charts.renewals')} subtitle={t('reports.charts.renewalsSubtitle')}>
          {memberships && memberships.renewals.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={memberships.renewals}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(label) => formatMonth(String(label ?? ''))} />
                <Legend />
                <Bar dataKey="count" name={t('reports.charts.renewals')} fill="#06b6d4" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title={t('reports.charts.peakHours')} subtitle={t('reports.charts.peakHoursSubtitle')}>
          {attendance && attendance.peak ? (
            <div className="flex h-[280px] flex-col justify-center gap-3 text-sm">
              <p className="text-3xl font-semibold">{String(attendance.peak.hour ?? 0).padStart(2, '0')}:00</p>
              <p className="text-muted-foreground">
                {t('reports.charts.peakSummary', { value: formatNumber(attendance.peak.count), day: attendance.peak.day ? formatDate(attendance.peak.day) : '—' })}
              </p>
              <p className="text-xs text-muted-foreground">{t('reports.charts.peakDataSource')}</p>
            </div>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <header className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('reports.expiring.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('reports.expiring.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => (window.location.href = '/gym/reports/members')}>
              <Users className="mr-2 h-4 w-4" /> {t('reports.expiring.viewMembersReport')}
            </Button>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-2 font-medium">{t('reports.expiring.member')}</th>
                <th className="px-4 py-2 font-medium">{t('reports.expiring.status')}</th>
                <th className="px-4 py-2 font-medium">{t('reports.expiring.expires')}</th>
              </tr>
            </thead>
            <tbody>
              {memberships && memberships.expiringSoon.length > 0 ? (
                memberships.expiringSoon.map((row) => (
                  <tr key={row.memberId} className="border-t border-border">
                    <td className="px-4 py-2">{row.memberName}</td>
                    <td className="px-4 py-2">{t(`reports.status.${row.status}`, { defaultValue: row.status })}</td>
                    <td className="px-4 py-2">{formatDate(row.endDate)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">{t('reports.expiring.empty')}</td>
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
