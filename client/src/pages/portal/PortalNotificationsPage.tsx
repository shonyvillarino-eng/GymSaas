import { useCallback, useEffect, useState } from 'react';
import { BellOff, RefreshCw } from 'lucide-react';

import { NoticeList } from '../../components/portal/NoticeList';
import { ErrorState, LoadingState } from '../../components/ui/states';
import { api, apiErrorMessage } from '../../lib/api';
import type { PortalNotice } from '../../lib/memberPortal';

interface NotificationsResponse {
  data: PortalNotice[];
  meta: {
    generatedAt: string;
    channels: { inApp: boolean; email: boolean };
    note: string;
  };
}

export function PortalNotificationsPage() {
  const [payload, setPayload] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api<NotificationsResponse>('/member-portal/notifications');
      setPayload(response);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !payload) return <LoadingState label="Loading your notices…" />;
  if (error && !payload) return <ErrorState title="Notices unavailable" message={error} onRetry={load} />;
  if (!payload) return null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">MY GYM</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Notices</h1>
          <p className="text-sm text-muted-foreground">
            Generated from your membership, balance and routines. Updated on every visit.
          </p>
        </div>
        <button onClick={load} className="btn-outline px-3 py-2 text-sm" disabled={loading}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="surface-card p-4 sm:p-5">
        <NoticeList
          notices={payload.data}
          emptyMessage="Nothing needs your attention right now. Membership, payments and routine are up to date."
        />
      </section>

      <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <BellOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {payload.meta.note}
        {!payload.meta.channels.email && ' Email delivery is not enabled for this gym.'}
      </p>
    </div>
  );
}
