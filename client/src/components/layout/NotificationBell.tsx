import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatRelativeTime, resolveLocale } from '../../lib/format';
import { cn } from '../../lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationList {
  data: NotificationItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number; unread: number };
}

/** Only same-origin internal paths are followed; anything else is ignored. */
function safeLink(link: string | null) {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : null;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const { user, language, locale } = useAuth();
  const formatLocale = resolveLocale(language, locale);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user || user.role === 'SUPER_ADMIN') return;
    setLoading(true);
    setError('');
    try {
      const [list, count] = await Promise.all([
        api<NotificationList>('/notifications?page=1&pageSize=5'),
        api<{ data: { count: number } }>('/notifications/unread-count'),
      ]);
      setItems(list.data);
      setUnread(count.data.count);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('notifications.loadError'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!user || user.role === 'SUPER_ADMIN') return null;

  const markRead = async (item: NotificationItem) => {
    if (!item.isRead) {
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)));
      setUnread((value) => Math.max(0, value - 1));
      try {
        await api(`/notifications/${item.id}/read`, { method: 'PATCH' });
      } catch {
        void load();
      }
    }
    const target = safeLink(item.link);
    if (target) {
      setOpen(false);
      navigate(target);
    }
  };

  const markAll = async () => {
    setItems((current) => current.map((row) => ({ ...row, isRead: true })));
    setUnread(0);
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
    } catch {
      void load();
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="btn-ghost relative p-2"
        aria-label={`${t('topbar.notifications')}${unread > 0 ? `, ${t('topbar.unread', { count: unread })}` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-2 w-80 animate-fade-in rounded-xl border border-border bg-card shadow-lg sm:w-96">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">{t('topbar.notifications')}</p>
              {unread > 0 && (
                <button type="button" onClick={() => void markAll()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <CheckCheck className="h-3.5 w-3.5" /> {t('topbar.markAllRead')}
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && items.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t('topbar.loading')}</p>}
              {error && <p className="p-4 text-sm text-destructive">{error}</p>}
              {!loading && !error && items.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">{t('topbar.noNotifications')}</p>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markRead(item)}
                  className={cn(
                    'flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left last:border-0 hover:bg-muted/60',
                    !item.isRead && 'bg-primary/5',
                  )}
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', item.isRead ? 'bg-muted-foreground/40' : 'bg-primary')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{item.message}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">{formatRelativeTime(item.createdAt, formatLocale)}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate('/notifications/center'); }}
                className="w-full rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
              >
                {t('topbar.viewHistory')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
