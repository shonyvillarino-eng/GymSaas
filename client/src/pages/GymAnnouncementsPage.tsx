import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Archive, Megaphone, Plus, RefreshCw, Send } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';

interface Announcement {
  id: string;
  title: string;
  content: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  audience: string;
  targetUserId: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResult {
  data: Announcement[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

interface Person {
  id: string;
  fullName: string;
}

const AUDIENCES = [
  ['ALL', 'Todos los usuarios del gimnasio'],
  ['MEMBERS', 'Todos los socios'],
  ['INSTRUCTORS', 'Todos los instructores'],
  ['SPECIFIC_MEMBER', 'Un socio específico'],
  ['SPECIFIC_INSTRUCTOR', 'Un instructor específico'],
] as const;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

const emptyForm = {
  title: '',
  content: '',
  audience: 'ALL' as (typeof AUDIENCES)[number][0],
  targetUserId: '',
  expiresAt: '',
};

export function GymAnnouncementsPage() {
  const [result, setResult] = useState<ListResult | null>(null);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [members, setMembers] = useState<Person[]>([]);
  const [instructors, setInstructors] = useState<Person[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20', status });
      setResult(await api<ListResult>(`/notifications/announcements/manage?${query.toString()}`));
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ data: Array<{ id: string; fullName: string }> }>('/members?page=1&pageSize=100&status=ACTIVE')
      .then((response) => setMembers(response.data))
      .catch(() => setMembers([]));
    api<{ data: Array<{ id: string; fullName: string }> }>('/instructors?page=1&pageSize=100&status=ACTIVE')
      .then((response) => setInstructors(response.data))
      .catch(() => setInstructors([]));
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setNotice('');
    try {
      const specific = form.audience === 'SPECIFIC_MEMBER' || form.audience === 'SPECIFIC_INSTRUCTOR';
      if (specific && !form.targetUserId) throw new Error('Selecciona el destinatario específico.');
      await api('/notifications/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          audience: form.audience,
          ...(specific ? { targetUserId: form.targetUserId } : {}),
          ...(form.expiresAt ? { expiresAt: new Date(`${form.expiresAt}T23:59:59`).toISOString() } : {}),
        }),
      });
      setForm(emptyForm);
      setFormOpen(false);
      setNotice('Aviso creado como borrador. Publícalo cuando esté listo.');
      await load();
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const publish = async (announcement: Announcement) => {
    if (!window.confirm(`¿Publicar «${announcement.title}»? Se crearán notificaciones para su audiencia.`)) return;
    setBusyId(announcement.id);
    setError('');
    setNotice('');
    try {
      const response = await api<{ data: Announcement; meta: { notified: number } }>(
        `/notifications/announcements/${announcement.id}/publish`,
        { method: 'POST' },
      );
      setNotice(`Aviso publicado. Notificaciones creadas: ${response.meta.notified}.`);
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusyId('');
    }
  };

  const archive = async (announcement: Announcement) => {
    if (!window.confirm(`¿Archivar «${announcement.title}»?`)) return;
    setBusyId(announcement.id);
    setError('');
    setNotice('');
    try {
      await api(`/notifications/announcements/${announcement.id}/archive`, { method: 'POST' });
      setNotice('Aviso archivado. No se elimina el historial.');
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusyId('');
    }
  };

  const recipients = form.audience === 'SPECIFIC_MEMBER' ? members : form.audience === 'SPECIFIC_INSTRUCTOR' ? instructors : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">GYM ADMINISTRATION</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold"><Megaphone className="h-6 w-6" /> Avisos</h1>
          <p className="text-sm text-muted-foreground">
            Comunicaciones internas del gimnasio. Publicar crea una notificación por destinatario, sin duplicados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button onClick={() => { setFormOpen((value) => !value); setFormError(''); }}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo aviso
          </Button>
        </div>
      </header>

      {notice && <SuccessState message={notice} />}
      {error && <ErrorState title="No se pudieron gestionar los avisos" message={error} onRetry={() => void load()} />}

      {formOpen && (
        <form onSubmit={(event) => void create(event)} className="surface-card space-y-4 p-5">
          <h2 className="font-semibold">Nuevo aviso</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">Título</span>
              <input className="input" required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Contenido</span>
              <textarea className="input min-h-28" required maxLength={5000} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
            </label>
            <label>
              <span className="label">Destinatarios</span>
              <select
                className="input"
                value={form.audience}
                onChange={(event) => setForm({ ...form, audience: event.target.value as typeof form.audience, targetUserId: '' })}
              >
                {AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {recipients.length > 0 && (
              <label>
                <span className="label">Destinatario</span>
                <select className="input" required value={form.targetUserId} onChange={(event) => setForm({ ...form, targetUserId: event.target.value })}>
                  <option value="">Selecciona…</option>
                  {recipients.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                </select>
              </label>
            )}
            <label>
              <span className="label">Vence el (opcional)</span>
              <input type="date" className="input" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
            </label>
          </div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { setFormOpen(false); setForm(emptyForm); }}>Cancelar</Button>
            <Button type="submit" loading={saving}>Crear borrador</Button>
          </div>
        </form>
      )}

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <label className="flex items-center gap-2 text-sm">
            Estado
            <select className="input w-auto" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">Todos</option>
              <option value="DRAFT">Borradores</option>
              <option value="PUBLISHED">Publicados</option>
              <option value="ARCHIVED">Archivados</option>
            </select>
          </label>
          {result && <span className="ml-auto text-xs text-muted-foreground">{result.meta.total} avisos</span>}
        </div>

        {loading ? <LoadingState label="Cargando avisos…" /> : !result?.data.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No hay avisos para este filtro.</p>
        ) : (
          <div className="divide-y divide-border">
            {result.data.map((announcement) => (
              <article key={announcement.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{announcement.title}</h2>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{STATUS_LABELS[announcement.status]}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {AUDIENCES.find(([value]) => value === announcement.audience)?.[1] ?? announcement.audience}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{announcement.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Creado {new Date(announcement.createdAt).toLocaleString('es-ES')}
                      {announcement.publishAt ? ` · Publicado ${new Date(announcement.publishAt).toLocaleString('es-ES')}` : ''}
                      {announcement.expiresAt ? ` · Vence ${new Date(announcement.expiresAt).toLocaleDateString('es-ES')}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {announcement.status === 'DRAFT' && (
                      <Button className="px-3 py-1.5" loading={busyId === announcement.id} onClick={() => void publish(announcement)}>
                        <Send className="mr-1 h-4 w-4" /> Publicar
                      </Button>
                    )}
                    {announcement.status !== 'ARCHIVED' && (
                      <Button variant="outline" className="px-3 py-1.5" loading={busyId === announcement.id} onClick={() => void archive(announcement)}>
                        <Archive className="mr-1 h-4 w-4" /> Archivar
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {result && result.meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-4 text-sm">
            <span>Página {result.meta.page} de {result.meta.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" className="px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
              <Button variant="outline" className="px-3 py-1.5" disabled={page >= result.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
