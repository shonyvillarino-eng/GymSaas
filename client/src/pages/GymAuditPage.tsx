import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCheck, ChevronLeft, ChevronRight, Columns3, Eye, EyeOff } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { DataTable } from '../components/ui/DataTable';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

type EventRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  result: string;
  gymName: string | null;
  createdAt: string;
  actorName: string | null;
};
type Meta = { page: number; pageSize: number; total: number; totalPages: number };
type Page = { data: EventRow[]; meta: Meta };

export function GymAuditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { back, language, locale } = useAuth();
  const [scope, setScope] = useState<'gym' | 'global'>('gym');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<EventRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filters, setFilters] = useState({ action: 'ALL', entityType: 'ALL', result: 'ALL', userId: '', from: '', to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (scope === 'global') params.set('scope', 'global');
      if (filters.action !== 'ALL') params.set('action', filters.action);
      if (filters.entityType !== 'ALL') params.set('entityType', filters.entityType);
      if (filters.result !== 'ALL') params.set('result', filters.result);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const page = 1;
      const response = await api<Page>(`/audit?${params.toString()}`);
      setRows(response.data);
      setMeta(response.meta);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [scope, filters]);

  useEffect(() => { void load(); }, [load]);

  const dataTable = useMemo(
    () => ({
      columns: [
        {
          header: t('audit.date'),
          accessor: (row: EventRow) => (
            <time className="whitespace-nowrap text-xs tabular-nums" dateTime={row.createdAt}>
              {new Date(row.createdAt).toLocaleString(navigator.language, { dateStyle: 'short', timeStyle: 'short' })}
            </time>
          ),
        },
        {
          header: t('audit.action'),
          accessor: (row: EventRow) => <span className="capitalize text-xs font-medium">{t(`audit.actions.${row.action}`, { defaultValue: row.action })}</span>,
        },
        {
          header: t('audit.entity'),
          accessor: (row: EventRow) => (
            <span className="text-xs">
              <span className="text-muted-foreground">{t(`audit.EntityType.${row.entityType}`, { defaultValue: row.entityType })}</span>
              <span className="text-muted-foreground"> • </span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">{row.entityId.slice(0, 8)}…</kbd>
            </span>
          ),
        },
        {
          header: t('audit.result'),
          accessor: (row: EventRow) => (
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', row.result === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-destructive/10 text-destructive')}>
              {row.result}
            </span>
          ),
        },
        {
          header: t('audit.actor'),
          accessor: (row: EventRow) => <span className="text-xs">{row.actorName ?? t('audit.systemActor')}</span>,
        },
        {
          header: '',
          accessor: (row: EventRow) => <span className="text-right text-[10px] text-muted-foreground">{row.gymName ?? ''}</span>,
        },
      ],
      data: rows.map((row) => ({ ...row, createdAt: row.createdAt })),
      meta,
      page: meta?.page ?? 1,
      setPage: (page: number) => {
        const params = new URLSearchParams();
        if (scope === 'global') params.set('scope', 'global');
        if (filters.action !== 'ALL') params.set('action', filters.action);
        if (filters.entityType !== 'ALL') params.set('entityType', filters.entityType);
        if (filters.result !== 'ALL') params.set('result', filters.result);
        if (filters.userId) params.set('userId', filters.userId);
        if (filters.from) params.set('from', filters.from);
        if (filters.to) params.set('to', filters.to);
        params.set('page', String(page));
        void load();
      },
    }),
    [rows, meta, t, filters, scope, load],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> {t('app.back')}
          </Button>
          <div className="flex rounded-lg border border-border bg-card p-1 text-xs">
            <button
              type="button"
              className={cn('rounded-md px-2 py-1 text-left font-medium transition', scope === 'gym' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setScope('gym'); load(); }}
            >
              {t('audit.scopeGym')}
            </button>
            <button
              type="button"
              className={cn('rounded-md px-2 py-1 text-left font-medium transition', scope === 'global' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setScope('global'); load(); }}
              disabled={!useAuth().isSuperAdmin}
            >
              {t('audit.scopeGlobal')}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setFilters({ ...filters, userId: '', from: '', to: '', action: 'ALL', entityType: 'ALL', result: 'ALL' })}>
            {t('audit.clear')}
          </Button>
        </div>
      </div>

      {scope === 'global' && (
        <div className="rounded-lg border border-border bg-primary/5 p-3 text-xs text-primary">
          {t('audit.globalNotice')}
        </div>
      )}

      <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <select
          className="input w-full"
          value={filters.action}
          onChange={(e) => setFilters({ ...filters, action: e.target.value })}
        >
          <option value="ALL">{t('audit.allActions')}</option>
          {['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOCK', 'UNLOCK', 'ASSIGN', 'UNASSIGN', 'EXPORT', 'PAYMENT_REGISTERED', 'ATTENDANCE_MARKED', 'ROUTINE_ASSIGNED', 'PUBLISH', 'ARCHIVE', 'VOID', 'REFUND', 'PASSWORD_CHANGE', 'SETTINGS_UPDATE', 'INVITE'].map((a) => (
            <option key={a} value={a}>{t(`audit.actions.${a}`, { defaultValue: a })}</option>
          ))}
        </select>
        <select
          className="input w-full"
          value={filters.entityType}
          onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
        >
          <option value="ALL">{t('audit.entity')}…</option>
          {['User', 'Membership', 'Payment', 'Subscription', 'Attendance', 'Routine', 'Plan', 'Instructor', 'Announcement', 'CashRegister', 'BusinessSettings', 'Gym', 'Notification'].map((e) => (
            <option key={e} value={e.toUpperCase()}>{t(`audit.EntityType.${e.toUpperCase()}`, { defaultValue: e })}</option>
          ))}
        </select>
        <select
          className="input w-full"
          value={filters.result}
          onChange={(e) => setFilters({ ...filters, result: e.target.value })}
        >
          <option value="ALL">{t('audit.result')}…</option>
          {['SUCCESS', 'FAILURE', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'UNAUTHORIZED', 'ERROR'].map((r) => (
            <option key={r} value={r}>{r === 'SUCCESS' ? 'Éxito' : r === 'FAILURE' ? 'Error' : r === 'FORBIDDEN' ? 'Prohibido' : r === 'UNAUTHORIZED' ? 'No autorizado' : r}</option>
          ))}
        </select>
        <input
          type="text"
          className="input w-full"
          placeholder={t('audit.searchPlaceholder')}
          value={filters.userId}
          onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
        />
        <input
          type="date"
          className="input w-full"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
        <input
          type="date"
          className="input w-full"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
      </div>

      {meta && (
        <p className="text-xs text-muted-foreground">
          {t('audit.summary', { total: meta.total, scope: scope === 'global' ? t('audit.scopeGlobal') : t('audit.scopeGym') })}
        </p>
      )}

      {scope === 'global' && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
          <p className="mb-2 font-medium text-primary">{t('audit.globalControl')}</p>
          <div className="grid gap-2 grid-cols-2">
            <div className="rounded-md border border-border bg-card p-2">
              <p className="text-[10px] text-muted-foreground">Total eventos globales</p>
              <p className="text-lg font-semibold">{meta?.total ?? 0}</p>
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <p className="text-[10px] text-muted-foreground">Rate de eventos / min</p>
              <p className="text-lg font-semibold">—</p>
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <p className="text-[10px] text-muted-foreground">Superadministradores activos</p>
              <p className="text-lg font-semibold">—</p>
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <p className="text-[10px] text-muted-foreground">Gimnasios registrados</p>
              <p className="text-lg font-semibold">—</p>
            </div>
          </div>
        </div>
      )}

      {loading && !rows.length ? <LoadingState label={t('audit.loading')} /> : error ? (
        <ErrorState title={t('audit.loadError')} message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t('audit.noEvents')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('audit.title')}</h2>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCheck className="h-3 w-3" /> {t('audit.actions.LOGIN')} / {t('audit.actions.LOGOUT')}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> Solo lectura · acciones auditables
              </span>
            </div>
          </div>
          <DataTable table={dataTable} />
          {meta && meta.page > 1 && (
            <div className="flex justify-end gap-1 text-xs text-muted-foreground">
              <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => dataTable.setPage(meta.page - 1)}>
                <ChevronLeft className="mr-1 h-3 w-3" /> Anterior
              </Button>
              <span className="px-1">{meta.page} / {meta.totalPages}</span>
              <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => dataTable.setPage(meta.page + 1)}>
                Siguiente <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
