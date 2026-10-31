import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Keyboard, ScanLine } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { QrScanner } from '../components/attendance/QrScanner';
import { AccessDeniedPanel, AttendanceOutcome } from '../components/attendance/AttendancePanels';
import { ApiRequestError, api, apiErrorMessage } from '../lib/api';
import type { AttendanceRow, CheckInResult, Eligibility } from '../lib/attendance';

/**
 * Camera check-in screen.
 *
 * The scanned value is sent to the server as-is; it never authorizes anything
 * on its own. Repeated frames of the same code are collapsed before a request
 * is made, and the scanner pauses after each result so one code cannot produce
 * two entries.
 */
export function GymAttendanceScanPage() {
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [outcome, setOutcome] = useState<CheckInResult | null>(null);
  const [denied, setDenied] = useState<Eligibility | null>(null);
  const [lastCode, setLastCode] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setOutcome(null);
    setDenied(null);
    setError('');
    setLastCode('');
    setPaused(false);
  };

  const submit = async (code: string, exceptionReason?: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ data: CheckInResult }>('/attendance/qr', {
        method: 'POST',
        body: JSON.stringify({ code, ...(exceptionReason ? { exceptionReason } : {}) }),
      });
      setOutcome(result.data);
      setDenied(null);
      setPaused(true);
    } catch (cause) {
      setPaused(true);
      if (cause instanceof ApiRequestError && cause.status === 422) {
        // Fetch the structured decision (with readable reasons) to offer the
        // authorized exception path.
        try {
          const decision = await api<{ data: Eligibility }>(
            `/attendance/eligibility?code=${encodeURIComponent(code)}`,
          );
          setDenied(decision.data);
          return;
        } catch {
          setError(cause.message);
          return;
        }
      }
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleDetect = (code: string) => {
    if (busy || paused) return;
    setLastCode(code);
    void submit(code);
  };

  const attendance: AttendanceRow | null = outcome?.attendance ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <Link to="/gym/attendance" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to reception
      </Link>

      <header>
        <p className="text-sm font-medium text-primary">RECEPTION</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Scan credential</h1>
        <p className="text-sm text-muted-foreground">
          Use the device camera to read the member&apos;s QR code. If the camera is unavailable, record the entry manually.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {attendance ? (
        <AttendanceOutcome attendance={attendance} onReset={reset} resetLabel="Scan next member" />
      ) : denied ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border p-4">
            <p className="font-semibold">{denied.member.fullName}</p>
            <p className="text-sm text-muted-foreground">
              {denied.member.documentNumber ?? 'No document'} · {denied.membership ? denied.membership.planName : 'No membership'}
            </p>
          </div>
          <AccessDeniedPanel
            reasons={denied.reasons}
            allowException={denied.policy.allowAdministrativeExceptions}
            busy={busy}
            onSubmit={(reason) => void submit(lastCode, reason)}
            onCancel={reset}
          />
        </div>
      ) : (
        <>
          <QrScanner onDetect={handleDetect} paused={busy || paused} />
          {busy && <p className="text-center text-sm text-muted-foreground">Validating code…</p>}
        </>
      )}

      {paused && (
        <Button variant="outline" className="w-full px-4 py-2" onClick={reset} disabled={busy}>
          <ScanLine className="h-4 w-4" /> Scan another member
        </Button>
      )}

      <Link to="/gym/attendance" className="btn-outline w-full justify-center px-4 py-2">
        <Keyboard className="h-4 w-4" /> Use manual check-in instead
      </Link>
    </div>
  );
}
