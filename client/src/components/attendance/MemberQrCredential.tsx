import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, RefreshCw, ShieldOff, QrCode } from 'lucide-react';

import { Button } from '../ui/Button';
import { Spinner } from '../ui/states';
import { api, apiErrorMessage } from '../../lib/api';
import type { QrCredential } from '../../lib/attendance';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
  );
}

/** Opens a print-ready window with the credential; nothing is stored anywhere. */
function printCredential(memberName: string, dataUrl: string, gymName: string) {
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) return;
  const safeName = escapeHtml(memberName);
  const safeGym = escapeHtml(gymName);
  win.document.write(`<!doctype html><html><head><title>Credential — ${safeName}</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;padding:24px;text-align:center;color:#111}
      h1{font-size:16px;margin:0 0 4px}
      p{margin:0 0 16px;font-size:12px;color:#555}
      img{width:280px;height:280px}
      small{display:block;margin-top:16px;font-size:11px;color:#666}
    </style></head><body onload="window.print()">
      <h1>${safeName}</h1>
      <p>${safeGym}</p>
      <img src="${dataUrl}" alt="Member credential QR" />
      <small>Show this code at the reception desk. It contains no personal data and can be revoked at any time.</small>
    </body></html>`);
  win.document.close();
}

interface Props {
  memberId: string;
  memberName: string;
  gymName?: string;
}

/**
 * Individual QR credential of a member.
 *
 * The token is random and opaque: it identifies the member for check-in but
 * contains no document, phone or email. Regenerating invalidates the previous
 * printed code; revoking disables the credential until a new one is issued.
 */
export function MemberQrCredential({ memberId, memberName, gymName = '' }: Props) {
  const [credential, setCredential] = useState<QrCredential | null>(null);
  const [dataUrl, setDataUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCredential((await api<{ data: QrCredential }>(`/attendance/members/${memberId}/code`)).data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    if (!credential?.payload) {
      setDataUrl('');
      return;
    }
    void QRCode.toDataURL(credential.payload, { width: 320, margin: 2, errorCorrectionLevel: 'M' }).then((url) => {
      if (alive) setDataUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [credential?.payload]);

  const rotate = async () => {
    if (
      credential?.token &&
      !window.confirm('Generate a new code? The current printed credential stops working immediately.')
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ data: QrCredential }>(`/attendance/members/${memberId}/code`, { method: 'POST' });
      setCredential(result.data);
      setNotice('New credential generated. Previously printed codes no longer work.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm('Revoke this credential? The member will not be able to scan in until a new one is generated.')) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ data: QrCredential }>(`/attendance/members/${memberId}/code`, { method: 'DELETE' });
      setCredential(result.data);
      setNotice('Credential revoked.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <QrCode className="h-4 w-4" /> QR credential
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Printed or shown on screen for check-in. The code is random and contains no personal data.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : credential?.token && dataUrl ? (
        <div className="mt-4 space-y-3">
          <div className="flex justify-center rounded-xl border border-border bg-white p-3">
            <img src={dataUrl} alt={`QR credential of ${memberName}`} className="h-44 w-44" />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Issued {credential.createdAt ? new Date(credential.createdAt).toLocaleString() : '—'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="flex-1 px-3 py-2"
              onClick={() => printCredential(memberName, dataUrl, gymName)}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" className="flex-1 px-3 py-2" loading={busy} onClick={() => void rotate()}>
              <RefreshCw className="h-4 w-4" /> Regenerate
            </Button>
            <Button variant="destructive" className="px-3 py-2" loading={busy} onClick={() => void revoke()}>
              <ShieldOff className="h-4 w-4" /> Revoke
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            No active credential for this member{credential?.revokedAt ? ` (revoked ${new Date(credential.revokedAt).toLocaleDateString()})` : ''}.
          </p>
          <Button className="w-full px-4 py-2" loading={busy} onClick={() => void rotate()}>
            <QrCode className="h-4 w-4" /> Generate credential
          </Button>
        </div>
      )}

      {notice && <p className="mt-3 text-sm text-primary">{notice}</p>}
    </section>
  );
}
