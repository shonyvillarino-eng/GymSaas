import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { api, apiErrorMessage } from '../lib/api';
import {
  formatDateForDisplay,
  statusBadge,
  type ReportMembersResponse,
  type ReportMeta,
  type ReportMembersRow,
  MEMBER_STATUS_OPTIONS,
  MEMBERSHIP_REPORT_OPTIONS,
  MEMBER_STATUS_LABELS,
  MEMBERSHIP_STATUS_LABELS,
} from '../lib/dashboard';

type SortField = 'joinDate' | 'fullName' | 'documentNumber';
type SortOrder = 'asc' | 'desc';
type MemberStatus = 'all' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
type MembershipFilter = 'all' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PENDING' | 'FROZEN' | 'NONE';

export function GymMembersReportPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MemberStatus>('all');
  const [membership, setMembership] = useState<MembershipFilter>('all');
  const [instructorId] = useState('');
  const [sort, setSort] = useState<SortField>('joinDate');
  const [order] = useState<SortOrder>('desc');
  const [rows, setRows] = useState<ReportMembersRow[]>([]);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [filters, setFilters] = useState<ReportMembersResponse['filters'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        search,
        status,
        membership,
        sort,
        order,
        instructorId: instructorId || '',
      });
      query.delete('instructorId');
      if (instructorId) query.set('instructorId', instructorId);
      const result = await api<{ data: ReportMembersResponse }>(`/reports/members?${query.toString()}`);
      setRows(result.data.rows);
      setMeta(result.data.meta);
      setFilters(result.data.filters);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [page, search, status, membership, instructorId, sort, order]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-primary">GYM ADMINISTRATION</p>
          <h1 className="text-2xl font-bold">Reporte de socios</h1>
          <p className="text-sm text-muted-foreground">Directorio de socios con filtros, ordenamiento y paginación.</p>
        </div>
        <Button variant="outline" className="px-4 py-2" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Filters */}
      <section className="surface-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre o documento"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          />
        </div>
        <select
          className="input"
          value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value as MemberStatus); }}
        >
          {MEMBER_STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          className="input"
          value={membership}
          onChange={(e) => { setPage(1); setMembership(e.target.value as MembershipFilter); }}
        >
          {MEMBERSHIP_REPORT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          className="input"
          value={sort}
          onChange={(e) => { setPage(1); setSort(e.target.value as SortField); }}
        >
          <option value="joinDate">Fecha de alta</option>
          <option value="fullName">Nombre</option>
          <option value="documentNumber">Documento</option>
        </select>
      </section>

      {/* Active filters */}
      {filters && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Filtros activos:</span>
          {filters.status !== 'all' && <span>Estado: {MEMBER_STATUS_LABELS[filters.status] ?? filters.status}</span>}
          {filters.membership !== 'all' && <span>Membresía: {MEMBERSHIP_STATUS_LABELS[filters.membership] ?? filters.membership}</span>}
          {filters.instructorId && <span>Instructor asignado</span>}
          {filters.sort && <span>Orden: {filters.sort} {filters.order}</span>}
        </div>
      )}

      {/* Table */}
      <section className="surface-card overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Cargando lista de socios…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            No hay socios que coincidan con los filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Documento</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Membresía</th>
                  <th className="px-4 py-3 font-medium">Vencimiento</th>
                  <th className="px-4 py-3 font-medium">Instructor</th>
                  <th className="px-4 py-3 font-medium">Socios</th>
                  <th className="px-4 py-3 font-medium">Obligaciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{row.fullName}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.documentType && row.documentNumber
                        ? `${row.documentType} ${row.documentNumber}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(row.status)}`}>
                        {MEMBER_STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.membershipStatus ? (
                        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary">
                          {MEMBERSHIP_STATUS_LABELS[row.membershipStatus] ?? row.membershipStatus}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin membresía</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{formatDateForDisplay(row.membershipEndDate)}</td>
                    <td className="px-4 py-3 text-xs">
                      {row.instructorFullName ? (
                        <Link className="text-primary hover:underline" to={`/gym/instructors`}>
                          {row.instructorFullName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{row.membershipCount}</td>
                    <td className="px-4 py-3 text-xs">{row.obligationCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.total > 0 && (
          <footer className="flex items-center justify-between border-t border-border p-3 text-sm">
            <span>{meta.total} socios · página {meta.page} / {meta.totalPages}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="px-3 py-1"
                disabled={meta.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                className="px-3 py-1"
                disabled={!rows.length || meta.page >= meta.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </footer>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        El reporte filtra por estado de socio, membresía e instructor asignado. Los datos provienen directamente de la base de datos del gimnasio.
      </p>
    </div>
  );
}
