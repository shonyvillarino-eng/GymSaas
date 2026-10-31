import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import {
  METHOD_LABELS,
  formatDateTime,
  formatMoney,
  type CashRegister,
  type CashSummary,
  type Paged,
} from '../lib/finance';

export function GymCashPage() {
  const [current, setCurrent] = useState<CashRegister | null>(null);
  const [registers, setRegisters] = useState<Paged<CashRegister> | null>(null);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [selected, setSelected] = useState<CashRegister | null>(null);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [countedAmount, setCountedAmount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [currentResponse, list, daily] = await Promise.all([
        api<{ data: CashRegister | null }>('/cash-registers/current'),
        api<Paged<CashRegister>>('/cash-registers?page=1&pageSize=10'),
        api<{ data: CashSummary }>('/payments/cash-summary'),
      ]);
      setCurrent(currentResponse.data);
      setRegisters(list);
      setSummary(daily.data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openRegister = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/cash-registers/open', {
        method: 'POST',
        body: JSON.stringify({ openingBalance: Number(openingBalance) || 0 }),
      });
      setNotice('Cash register opened. It is a declared balance, not verified physical cash.');
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const closeRegister = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) return;
    const declared = Number(countedAmount);
    if (!Number.isFinite(declared) || declared < 0) {
      setError('Enter the amount you counted.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/cash-registers/${current.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ countedAmount: declared, notes: closeNotes || undefined }),
      });
      setNotice('Cash register closed. Closed sessions are kept as history and are never edited silently.');
      setCountedAmount('');
      setCloseNotes('');
      await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (register: CashRegister) => {
    setError('');
    try {
      const result = await api<{ data: CashRegister }>(`/cash-registers/${register.id}`);
      setSelected(result.data);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  if (loading && !registers) return <LoadingState label="Loading cash register…" />;
  if (error && !registers) return <ErrorState title="Cash register unavailable" message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-primary">GYM ADMINISTRATION</p>
        <h1 className="text-2xl font-bold">Cash register</h1>
        <p className="text-sm text-muted-foreground">
          Session totals are administrative records. A declared count is not verified physical cash.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <SuccessState message={notice} />}

      {summary && (
        <section className="surface-card p-4">
          <h2 className="font-semibold">Today</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Recorded total</p>
              <p className="text-xl font-semibold">{formatMoney(summary.totalCollected, summary.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cash movements</p>
              <p className="text-xl font-semibold">{formatMoney(summary.cashDeclared, summary.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Operations</p>
              <p className="text-xl font-semibold">{summary.operationCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Voided</p>
              <p className="text-xl font-semibold">
                {summary.voidedCount} · {formatMoney(summary.voidedTotal, summary.currency)}
              </p>
            </div>
          </div>
          {summary.byMethod.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {summary.byMethod.map((entry) => (
                <span key={entry.method} className="rounded-lg border border-border px-3 py-1.5 text-xs">
                  {METHOD_LABELS[entry.method] ?? entry.method}: {formatMoney(entry.total, summary.currency)} ({entry.count})
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {current ? (
        <section className="surface-card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Open session</h2>
              <p className="text-sm text-muted-foreground">
                Opened {formatDateTime(current.openedAt)} by {current.openedBy?.fullName ?? '—'}
              </p>
            </div>
            <Button variant="outline" className="px-3 py-1" onClick={() => void openDetail(current)}>
              View movements
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Opening balance (declared)</p>
              <p className="text-lg font-semibold">{formatMoney(current.openingBalance, current.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cash registered</p>
              <p className="text-lg font-semibold">{formatMoney(current.totals?.cashMovements ?? '0', current.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expected cash</p>
              <p className="text-lg font-semibold">{formatMoney(current.totals?.expectedCash ?? '0', current.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">All methods</p>
              <p className="text-lg font-semibold">{formatMoney(current.totals?.totalMovements ?? '0', current.currency)}</p>
            </div>
          </div>

          <form onSubmit={closeRegister} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <Input
              label="Amount counted (declared)"
              required
              type="number"
              min="0"
              step="0.01"
              value={countedAmount}
              onChange={(event) => setCountedAmount(event.target.value)}
            />
            <Input
              label="Closing notes (optional)"
              maxLength={1000}
              value={closeNotes}
              onChange={(event) => setCloseNotes(event.target.value)}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              The difference is calculated as declared count minus expected cash. Closing cannot be edited afterwards.
            </p>
            <div className="sm:col-span-2">
              <Button type="submit" loading={busy} className="px-4 py-2">Close cash register</Button>
            </div>
          </form>
        </section>
      ) : (
        <form onSubmit={openRegister} className="surface-card space-y-4 p-4">
          <div>
            <h2 className="font-semibold">Open cash register</h2>
            <p className="text-sm text-muted-foreground">Only one session can be open at a time.</p>
          </div>
          <Input
            label="Opening balance (declared, optional)"
            type="number"
            min="0"
            step="0.01"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
          />
          <Button type="submit" loading={busy} className="px-4 py-2">Open cash register</Button>
        </form>
      )}

      <section className="surface-card overflow-hidden">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Sessions</h2>
          <p className="text-sm text-muted-foreground">Closed sessions keep their declared count and difference.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                {['Opened', 'Status', 'Opening', 'Expected', 'Counted', 'Difference', 'Closed by', ''].map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registers?.data.map((register) => (
                <tr key={register.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(register.openedAt)}</td>
                  <td className="px-4 py-3">{register.status}</td>
                  <td className="px-4 py-3">{formatMoney(register.openingBalance, register.currency)}</td>
                  <td className="px-4 py-3">{register.expectedAmount ? formatMoney(register.expectedAmount, register.currency) : '—'}</td>
                  <td className="px-4 py-3">{register.countedAmount ? formatMoney(register.countedAmount, register.currency) : '—'}</td>
                  <td className="px-4 py-3">
                    {register.difference ? formatMoney(register.difference, register.currency) : '—'}
                  </td>
                  <td className="px-4 py-3">{register.closedBy?.fullName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Button variant="outline" className="px-2 py-1 text-xs" onClick={() => void openDetail(register)}>
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && registers?.data.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">No cash sessions recorded yet.</p>
          )}
        </div>
      </section>

      {selected && (
        <section className="surface-card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Movements · {formatDateTime(selected.openedAt)}</h2>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setSelected(null)}>Close</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  {['Receipt', 'Member', 'Concept', 'Amount', 'Method', 'Status'].map((header) => (
                    <th key={header} className="px-4 py-3 font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(selected.payments ?? []).map((payment) => (
                  <tr key={payment.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{payment.receiptNumber}</td>
                    <td className="px-4 py-3">{payment.member?.user.fullName ?? '—'}</td>
                    <td className="px-4 py-3">{payment.concept}</td>
                    <td className="px-4 py-3">{formatMoney(payment.amount, payment.currency)}</td>
                    <td className="px-4 py-3">{METHOD_LABELS[payment.method] ?? payment.method}</td>
                    <td className="px-4 py-3">{payment.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(selected.payments ?? []).length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No movements in this session.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
