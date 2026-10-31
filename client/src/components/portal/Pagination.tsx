import { Button } from '../ui/Button';
import type { PageMeta } from '../../lib/memberPortal';

/** Server-side pagination footer shared by the portal lists. */
export function Pagination({
  meta,
  loading,
  onPage,
  label,
}: {
  meta: PageMeta;
  loading?: boolean;
  onPage: (page: number) => void;
  label: string;
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3 text-sm">
      <span className="text-muted-foreground">
        {meta.total} {label} · page {meta.page} / {meta.totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" className="px-3 py-1" disabled={meta.page <= 1 || loading} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          className="px-3 py-1"
          disabled={meta.page >= meta.totalPages || loading}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
        </Button>
      </div>
    </footer>
  );
}
