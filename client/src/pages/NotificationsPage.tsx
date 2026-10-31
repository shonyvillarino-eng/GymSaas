import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCheck, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime, resolveLocale } from '../lib/format';
import { cn } from '../lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface NotificationList {
  data: NotificationItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number; unread: number };
}

const TYPES = [
  '',
  'MEMBERSHIP_EXPIRING',
  'MEMBERSHIP_EXPIRED',
  'MEMBERSHIP_RENEWED',
  'MEMBERSHIP_STATUS',
  'ROUTINE_ASSIGNED',
  'ROUTINE_UPDATED',
  'PAYMENT_REGISTERED',
  'PAYMENT_VOIDED',
  'PAYMENT_PENDING',
  'ROUTINE_REPLACED',
  'ANNOUNCEMENT',
  'GENERAL',
  'INSTRUCTOR_NOTICE',
];

function safeLink(link: string | null) {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : null;
}

export function NotificationsPage() {
  const { t } = useTranslation();
  const { language, locale } = useAuth();
  const formatLocale = resolveLocale(language, locale);
  const navigate = useNavigate();
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [meta, setMeta] = useState<NotificationList['meta'] | null>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState<'all' | 'unread' | 'read'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20', status });
      if (type) query.set('type', type);
      const result = await api<NotificationList>(`/notifications?${query.toString()}`);
      setRows(result.data);
      setMeta(result.meta);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, type, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const markOne = async (row: NotificationItem) => {
    if (!row.isRead) {
      setBusy(true);
      try {
        await api(`/notifications/${row.id}/read`, { method: 'PATCH' });
        await load();
      } catch (cause) {
        setError(apiErrorMessage(cause));
      } finally {
        setBusy(false);
      }
    }
    const target = safeLink(row.link);
    if (target) navigate(target);
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('notifications.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('notifications.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={() => void markAll()} loading={busy} disabled={!meta?.unread}>
          <CheckCheck className="mr-2 h-4 w-4" /> {t('notifications.markAll')}
        </Button>
      </header>

      <section className="surface-card grid gap-3 p-4 sm:grid-cols-3">
        <label>
          <span className="label">{t('notifications.type')}</span>
          <select className="input" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
            {TYPES.map((option) => (
              <option key={option || 'all'} value={option}>
                {option ? t(`notifications.types.${option}`) : t('notifications.allTypes')}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t('notifications.status')}</span>
          <select className="input" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}>
            <option value="all">{t('notifications.allStatuses')}</option>
            <option value="unread">{t('notifications.unread')}</option>
            <option value="read">{t('notifications.read')}</option>
          </select>
        </label>
        {meta && <p className="self-end text-xs text-muted-foreground">{t('notifications.summary', { total: meta.total, unread: meta.unread })}</p>}
      </section>

      {error && <ErrorState title={t('notifications.loadError')} message={error} onRetry={() => void load()} />}
      {loading && rows.length === 0 && <LoadingState label={t('notifications.loading')} />}

      {!loading && !error && rows.length === 0 && (
        <div className="surface-card p-10 text-center text-sm text-muted-foreground">{t('notifications.empty')}</div>
      )}

      {rows.length > 0 && (
        <section className="surface-card divide-y divide-border">
          {rows.map((row) => (
            <article key={row.id} className={cn('flex flex-col gap-2 p-4 sm:flex-row sm:items-start', !row.isRead && 'bg-primary/5')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', row.isRead ? 'bg-muted-foreground/40' : 'bg-primary')} />
                  <h2 className="text-sm font-semibold">{row.title}</h2>
                  {!row.isRead && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{t('notifications.unread')}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{row.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(row.createdAt, formatLocale)}
                  {row.readAt ? ` · ${t('notifications.readAt', { date: formatDateTime(row.readAt, formatLocale) })}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!row.isRead && (
                  <Button variant="ghost" className="px-3 py-1.5" disabled={busy} onClick={() => void markOne(row)}>
                    {t('notifications.markRead')}
                  </Button>
                )}
                {safeLink(row.link) && (
                  <Button variant="outline" className="px-3 py-1.5" onClick={() => void markOne(row)}>
                    {t('notifications.open')} <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </article>
          ))}
          {meta && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <span className="text-muted-foreground">{t('notifications.page', { page: meta.page, total: meta.totalPages })}</span>
              <div className="flex gap-2">
                <Button variant="outline" className="px-3 py-1.5" disabled={meta.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft className="h-4 w-4" /> {t('app.previous')}
                </Button>
                <Button variant="outline" className="px-3 py-1.5" disabled={meta.page >= meta.totalPages || loading} onClick={() => setPage((value) => value + 1)}>
                  {t('app.next')} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
