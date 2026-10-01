import { useEffect, useState } from 'react';
import { ApiError } from '@/core/api/httpClient';
import { Modal } from '@/shared/components/Modal';
import { FormField } from '@/shared/components/FormField';
import { formatCurrency } from '@/shared/utils/format';
import { PAYMENT_MODE_OPTIONS, type PaymentInput, type PaymentMode } from '../types';

interface PaymentDialogProps {
  open: boolean;
  amount: number;
  patientName: string;
  doctorName: string;
  onClose: () => void;
  onConfirm: (payment: PaymentInput) => Promise<unknown>;
  /** Dialog title, e.g. "Collect advance / deposit" for Emergency / ICU. */
  title?: string;
}

/** Collect the consultation fee. Registration is created only if this succeeds. */
export function PaymentDialog({
  open,
  amount,
  patientName,
  doctorName,
  onClose,
  onConfirm,
  title = 'Collect consultation fee',
}: PaymentDialogProps) {
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMode('CASH');
      setReference('');
      setError(null);
    }
  }, [open]);

  const needsReference = mode !== 'CASH';

  async function confirm() {
    if (needsReference && !reference.trim()) {
      setError('Enter the transaction reference number.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ mode, amount, referenceNumber: needsReference ? reference.trim() : undefined });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Payment could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      closeDisabled={submitting}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void confirm()} disabled={submitting}>
            {submitting ? 'Processing…' : `Confirm payment & register`}
          </button>
        </>
      }
    >
      <div className="pay-summary">
        <div>
          <span className="field-hint">Patient</span>
          <strong>{patientName}</strong>
        </div>
        <div>
          <span className="field-hint">Doctor</span>
          <strong>{doctorName}</strong>
        </div>
        <div className="pay-amount">
          <span className="field-hint">Amount</span>
          <strong>{formatCurrency(amount)}</strong>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Payment mode</span>
        <div className="pay-modes" role="radiogroup" aria-label="Payment mode">
          {PAYMENT_MODE_OPTIONS.map((m) => (
            <label key={m.value} className={`pay-mode ${mode === m.value ? 'on' : ''}`}>
              <input
                type="radio"
                name="paymentMode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => {
                  setMode(m.value);
                  setError(null);
                }}
                disabled={submitting}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      {needsReference && (
        <FormField
          label={mode === 'UPI' ? 'UPI transaction ID' : 'Card approval code'}
          htmlFor="paymentReference"
          required
          hint="Demo: enter 0000 to simulate a declined payment."
        >
          <input
            id="paymentReference"
            className="input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={submitting}
            autoFocus
          />
        </FormField>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
