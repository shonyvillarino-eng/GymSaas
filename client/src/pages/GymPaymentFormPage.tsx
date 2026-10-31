import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { METHOD_LABELS, formatMoney, type Obligation, type Paged } from '../lib/finance';

interface MemberOption {
  id: string;
  fullName: string;
  documentNumber: string | null;
}

const METHODS = ['CASH', 'TRANSFER', 'BANK_TRANSFER', 'CARD', 'CHECK', 'OTHER'] as const;

export function GymPaymentFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const presetMember = query.get('memberId') ?? '';
  const presetObligation = query.get('obligationId') ?? '';

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [memberId, setMemberId] = useState(presetMember);
  const [obligationId, setObligationId] = useState(presetObligation);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>('CASH');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    // Any member of the gym can make a payment: suspended or inactive members may
    // still owe money, so the picker is not restricted to ACTIVE members.
    void api<Paged<MemberOption>>('/members?page=1&pageSize=100&status=all')
      .then((result) => {
        if (alive) setMembers(result.data);
      })
      .catch((cause) => {
        if (alive) setError(apiErrorMessage(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Outstanding charges for the selected member drive the optional link.
  useEffect(() => {
    if (!memberId) {
      setObligations([]);
      return;
    }
    let alive = true;
    void api<Paged<Obligation>>(`/financial-obligations?memberId=${memberId}&outstanding=true&page=1&pageSize=50`)
      .then((result) => {
        if (alive) setObligations(result.data);
      })
      .catch(() => {
        if (alive) setObligations([]);
      });
    return () => {
      alive = false;
    };
  }, [memberId]);

  const selected = obligations.find((obligation) => obligation.id === obligationId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setConcept(selected.concept);
    const balance = selected.balance ?? String(Number(selected.originalAmount) - Number(selected.paidAmount));
    setAmount(balance);
  }, [selected]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (selected) {
      const balance = Number(selected.balance ?? Number(selected.originalAmount) - Number(selected.paidAmount));
      if (parsedAmount > balance + 0.0001) {
        setError(`The amount cannot exceed the outstanding balance (${formatMoney(balance, selected.currency)}).`);
        return;
      }
    }
    setBusy(true);
    try {
      const created = await api<{ data: { id: string; receiptNumber: string } }>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId,
          ...(obligationId ? { obligationId } : {}),
          concept: concept.trim(),
          amount: parsedAmount,
          method,
          ...(paidAt ? { paidAt: new Date(paidAt).toISOString() } : {}),
          reference: reference || undefined,
          notes: notes || undefined,
        }),
      });
      navigate(`/gym/payments`, {
        replace: true,
        state: { notice: `Payment registered with receipt ${created.data.receiptNumber}.` },
      });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading payment form…" />;
  if (error && members.length === 0) {
    return <ErrorState title="Payment form unavailable" message={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/gym/payments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All payments
      </Link>
      <header>
        <p className="text-sm text-primary">GYM ADMINISTRATION</p>
        <h1 className="text-2xl font-bold">Register payment</h1>
        <p className="text-sm text-muted-foreground">
          Records money received outside the platform. A receipt number is assigned automatically.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="surface-card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">Member *</span>
            <select
              required
              className="input"
              value={memberId}
              onChange={(event) => {
                setMemberId(event.target.value);
                setObligationId('');
                setConcept('');
                setAmount('');
              }}
            >
              <option value="">Choose member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                  {member.documentNumber ? ` · ${member.documentNumber}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Outstanding charge (optional)</span>
            <select
              className="input"
              value={obligationId}
              disabled={!memberId}
              onChange={(event) => setObligationId(event.target.value)}
            >
              <option value="">No linked charge</option>
              {obligations.map((obligation) => (
                <option key={obligation.id} value={obligation.id}>
                  {obligation.concept} · balance{' '}
                  {formatMoney(obligation.balance ?? Number(obligation.originalAmount) - Number(obligation.paidAmount), obligation.currency)}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Concept"
            required
            maxLength={200}
            value={concept}
            onChange={(event) => setConcept(event.target.value)}
            placeholder="Monthly fee, enrollment, personal training…"
          />
          <Input
            label="Amount *"
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />

          <label>
            <span className="label">Payment method</span>
            <select className="input" value={method} onChange={(event) => setMethod(event.target.value)}>
              {METHODS.map((value) => (
                <option key={value} value={value}>
                  {METHOD_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Paid at</span>
            <input
              className="input"
              type="datetime-local"
              value={paidAt}
              max={new Date().toISOString().slice(0, 16)}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </label>

          <Input
            label="Reference (optional)"
            maxLength={120}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Transfer number, cheque number…"
          />
          <label className="block sm:col-span-2">
            <span className="label">Notes (optional)</span>
            <textarea
              className="input min-h-20"
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>

        {selected && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Linked charge: original {formatMoney(selected.originalAmount, selected.currency)} · already paid{' '}
            {formatMoney(selected.paidAmount, selected.currency)} · due {new Date(selected.dueDate).toLocaleDateString()}.
            Partial payments are allowed; the balance is recalculated automatically.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          No card numbers, security codes or bank credentials are stored. Membership status and member status are never
          changed by a payment.
        </p>

        <div className="flex justify-end gap-2">
          <Link to="/gym/payments">
            <Button type="button" variant="outline" className="px-4 py-2">Cancel</Button>
          </Link>
          <Button type="submit" loading={busy} className="px-4 py-2">Register payment</Button>
        </div>
      </form>
    </div>
  );
}
