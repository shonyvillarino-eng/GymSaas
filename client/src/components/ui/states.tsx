import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/utils';

/* ---------------- Spinner ---------------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

/* ---------------- Loading State ---------------- */
export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Spinner className="h-6 w-6" />
      <p className="text-sm">{label ?? t('app.loading')}</p>
    </div>
  );
}

/* ---------------- Error State ---------------- */
interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl">
        !
      </div>
      <div>
        <p className="font-semibold text-foreground">{title ?? t('app.error')}</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-md">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline px-4 py-2">
          {t('app.retry')}
        </button>
      )}
    </div>
  );
}

/* ---------------- Empty State ---------------- */
interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-2xl">
        ∅
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-md">{message}</p>
      </div>
      {action}
    </div>
  );
}

/* ---------------- Success State ---------------- */
export function SuccessState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
        ✓
      </span>
      {message}
    </div>
  );
}