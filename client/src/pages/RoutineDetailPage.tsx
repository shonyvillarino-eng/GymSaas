import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, CheckCircle2, History, Pencil, Play } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { RoutineDocument, SnapshotDocument } from '../components/routines/RoutineDocument';
import { api, apiErrorMessage } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/members';
import {
  VERSION_REASON_LABELS,
  formatDayRange,
  routineBadge,
  routineStatusLabel,
  type Routine,
  type RoutineVersionRow,
} from '../lib/routines';

type Tab = 'preview' | 'history';

interface Props {
  basePath: string;
}

/** Routine preview, lifecycle actions and version history. */
export function RoutineDetailPage({ basePath }: Props) {
  const { id = '' } = useParams();
  const location = useLocation();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [versions, setVersions] = useState<RoutineVersionRow[]>([]);
  const [tab, setTab] = useState<Tab>('preview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState((location.state as { notice?: string } | null)?.notice ?? '');
  const [busy, setBusy] = useState<'activate' | 'archive' | ''>('');
  const [openVersion, setOpenVersion] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [detail, history] = await Promise.all([
        api<{ data: Routine }>(`/routines/${id}`),
        api<{ data: RoutineVersionRow[] }>(`/routines/${id}/history`),
      ]);
      setRoutine(detail.data);
      setVersions(history.data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = async () => {
    if (!routine) return;
    if (
      !window.confirm(
        'Activate this routine? The member’s current active routine will be archived and its history preserved.',
      )
    ) {
      return;
    }
    setBusy('activate');
    setActionError('');
    setNotice('');
    try {
      const result = await api<{ data: Routine & { superseded: string[] } }>(`/routines/${id}/activate`, { method: 'POST' });
      setNotice(
        result.data.superseded.length > 0
          ? `Routine activated. ${result.data.superseded.length} previous routine(s) were archived and kept in history.`
          : 'Routine activated for the member.',
      );
      await load();
    } catch (cause) {
      setActionError(apiErrorMessage(cause));
    } finally {
      setBusy('');
    }
  };

  const archive = async () => {
    if (!window.confirm('Archive this routine? It stays in the member’s history and can be activated again later.')) return;
    setBusy('archive');
    setActionError('');
    setNotice('');
    try {
      await api(`/routines/${id}/archive`, { method: 'POST' });
      setNotice('Routine archived. Nothing was deleted.');
      await load();
    } catch (cause) {
      setActionError(apiErrorMessage(cause));
    } finally {
      setBusy('');
    }
  };

  if (loading) return <LoadingState label="Loading routine…" />;
  if (error) return <ErrorState title="Routine unavailable" message={error} onRetry={load} />;
  if (!routine) return null;

  const canModify = routine.canModify !== false;

  return (
    <div className="space-y-5">
      <Link to={`${basePath}/routines`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All routines
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">ROUTINE</p>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{routine.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${routineBadge(routine.status)}`}>
              {routineStatusLabel(routine.status)}
            </span>
            <span>v{routine.version}</span>
            <span>·</span>
            <span>{routine.member?.fullName ?? 'No member'}</span>
            <span>·</span>
            <span>{formatDayRange(routine.startDate, routine.endDate)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canModify && routine.status !== 'ARCHIVED' && (
            <Link to={`${basePath}/routines/${routine.id}/edit`} className="btn-outline px-4 py-2">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )}
          {canModify && routine.status !== 'ACTIVE' && (
            <Button className="px-4 py-2" loading={busy === 'activate'} disabled={Boolean(busy)} onClick={() => void activate()}>
              <Play className="h-4 w-4" /> Activate
            </Button>
          )}
          {canModify && routine.status !== 'ARCHIVED' && (
            <Button variant="outline" className="px-4 py-2" loading={busy === 'archive'} disabled={Boolean(busy)} onClick={() => void archive()}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
        </div>
      </header>

      {notice && <SuccessState message={notice} />}
      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <section className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Member', routine.member?.fullName ?? '—'],
          ['Responsible instructor', routine.instructor?.fullName ?? '—'],
          ['Created by', routine.author ?? '—'],
          ['Last update', formatDateTime(routine.updatedAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium">{value}</p>
          </div>
        ))}
        {routine.description && (
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-xs text-muted-foreground">Description</p>
            <p className="mt-1 text-sm">{routine.description}</p>
          </div>
        )}
        {routine.notes && (
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-xs text-muted-foreground">Observations</p>
            <p className="mt-1 text-sm">{routine.notes}</p>
          </div>
        )}
      </section>

      <nav className="flex gap-1 border-b border-border" aria-label="Routine sections">
        {([
          ['preview', 'Preview', CheckCircle2],
          ['history', `History (${versions.length})`, History],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
              tab === value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'preview' && (
        <RoutineDocument days={routine.days ?? []} emptyMessage="This routine has no sessions yet. Edit it to add the first one." />
      )}

      {tab === 'history' && (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Every accepted change keeps an immutable version. Modifying an active routine never overwrites the previous
            prescription.
          </p>
          {versions.length === 0 ? (
            <p className="surface-card p-6 text-center text-sm text-muted-foreground">No versions recorded yet.</p>
          ) : (
            versions.map((version) => (
              <article key={version.id} className="surface-card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-muted/40"
                  onClick={() => setOpenVersion((current) => (current === version.version ? null : version.version))}
                >
                  <div>
                    <p className="font-medium">
                      Version {version.version} · {VERSION_REASON_LABELS[version.reason ?? ''] ?? version.reason ?? 'Change'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {version.author} · {formatDateTime(version.createdAt)} · {routineStatusLabel(version.status)}
                    </p>
                  </div>
                  <span className="text-xs text-primary">{openVersion === version.version ? 'Hide' : 'View'}</span>
                </button>
                {openVersion === version.version && (
                  <div className="border-t border-border p-4">
                    <p className="mb-3 text-sm text-muted-foreground">
                      {version.snapshot.name} · {formatDate(version.snapshot.startDate)} → {formatDate(version.snapshot.endDate)}
                    </p>
                    <SnapshotDocument snapshot={version.snapshot} />
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}
