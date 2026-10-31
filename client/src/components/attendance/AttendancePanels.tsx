import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

import { Button } from '../ui/Button';
import { METHOD_LABELS, formatTime, type AccessReason, type AttendanceRow } from '../../lib/attendance';

/* ---------------- Successful / exception check-in ---------------- */

interface OutcomeProps {
  attendance: AttendanceRow;
  onReset: () => void;
  resetLabel?: string;
}

export function AttendanceOutcome({ attendance, onReset, resetLabel = 'Next member' }: OutcomeProps) {
  const exception = attendance.result === 'EXCEPTION';
  return (
    <section
      className={`surface-card p-5 ${exception ? 'border-amber-500/40 bg-amber-500/5' : 'border-primary/40 bg-primary/5'}`}
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        {exception ? (
          <ShieldAlert className="h-7 w-7 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle2 className="h-7 w-7 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{attendance.member.user.fullName}</p>
          <p className="text-sm text-muted-foreground">
            Entry recorded at {formatTime(attendance.checkInTime)} · {METHOD_LABELS[attendance.method] ?? attendance.method} ·{' '}
            {exception ? 'authorized as an administrative exception' : 'access authorized'}
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Membership at check-in</dt>
              <dd className="font-medium">{attendance.membershipStatusAtCheckIn ?? 'NONE'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Document</dt>
              <dd className="font-medium">{attendance.member.documentNumber ?? '—'}</dd>
            </div>
          </dl>
          {exception && attendance.exceptionReason && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-background/60 p-3 text-sm">
              <span className="font-medium">Justification: </span>
              {attendance.exceptionReason}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button className="px-4 py-2" onClick={onReset}>
          {resetLabel}
        </Button>
      </div>
    </section>
  );
}

/* ---------------- Access denied + authorized exception ---------------- */

interface ExceptionFormProps {
  reasons: AccessReason[];
  allowException: boolean;
  busy?: boolean;
  onSubmit: (reason: string) => void;
  onCancel?: () => void;
}

export function AccessDeniedPanel({ reasons, allowException, busy = false, onSubmit, onCancel }: ExceptionFormProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (reason.trim().length < 5) {
      setError('Justify the exception with at least 5 characters.');
      return;
    }
    setError('');
    onSubmit(reason.trim());
  };

  return (
    <section className="surface-card border-destructive/40 bg-destructive/5 p-5" aria-live="assertive">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Access denied</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {reasons.map((reason) => (
              <li key={reason.code}>{reason.message}</li>
            ))}
          </ul>

          {allowException ? (
            <div className="mt-4 space-y-2">
              <label className="label" htmlFor="exception-reason">
                Administrative exception — justification
              </label>
              <textarea
                id="exception-reason"
                className="input min-h-20"
                value={reason}
                maxLength={500}
                placeholder="Why is this entry authorized despite the blocking condition?"
                onChange={(event) => {
                  setReason(event.target.value);
                  setError('');
                }}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground">
                The entry is saved with result “EXCEPTION”, your user and this justification, and is written to the audit log.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button className="px-4 py-2" loading={busy} onClick={submit}>
                  Register as exception
                </Button>
                {onCancel && (
                  <Button variant="outline" className="px-4 py-2" onClick={onCancel} disabled={busy}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              This gym has disabled administrative exceptions, so no entry can be recorded.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
