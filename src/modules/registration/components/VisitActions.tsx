import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/core/api/httpClient';
import { Permissions } from '@/core/permissions/permissions';
import { useHasPermission } from '@/core/permissions/usePermission';
import { Icon } from '@/shared/components/Icons';
import { Modal } from '@/shared/components/Modal';
import { formatCurrency } from '@/shared/utils/format';
import { registrationApi } from '../api/registrationApi';
import type { FrontDeskQueueItem } from '../types';

/**
 * "⋮" actions for a visit the doctor hasn't started, used on the OP Queue and the Registration screen:
 *   - pending visit (earlier day): Move to today · Change date… · Cancel visit…
 *   - today's waiting visit:       Change date… · Cancel visit…
 * Change date is only for OPD (the server refuses Emergency). Cancel asks for a reason and, if the fee was paid,
 * offers a refund (refund receipt dated today). The server re-checks everything (visit must still be WAITING).
 * onChanged(message) → the parent reloads the queue and shows the message.
 */

const CANCEL_REASONS = ['Patient did not come', 'Patient asked to cancel', 'Booked by mistake', 'Doctor not available', 'Other'];
const REASON_MAX = 200;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const dayLabel = (yyyyMmDd: string) =>
  new Date(`${yyyyMmDd}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const fieldErrors = (err.details as { errors?: Record<string, string> } | undefined)?.errors;
    const first = fieldErrors && Object.values(fieldErrors)[0];
    return first || err.message;
  }
  return fallback;
}

/** What the actions need to know about a visit (a queue row, or today's open visit on the Registration screen). */
export type VisitActionTarget = Pick<
  FrontDeskQueueItem,
  'visitId' | 'visitDate' | 'registrationType' | 'paymentStatus' | 'consultationFee' | 'patientName' | 'doctorName' | 'tokenNumber'
> & {
  /** BOOKED = appointment not paid yet: moving keeps it an appointment (new token for that day, pay on arrival). */
  queueStatus?: FrontDeskQueueItem['queueStatus'];
};

export function VisitActions({
  item,
  onChanged,
  variant = 'menu',
}: {
  item: VisitActionTarget;
  onChanged: (message: string) => void;
  /** 'menu' = "⋮" with a dropdown (queue rows); 'buttons' = visible buttons (Today's visit card). */
  variant?: 'menu' | 'buttons';
}) {
  const canRefund = useHasPermission(Permissions.PAYMENT_COLLECT);
  const today = addDays(0);
  const booked = item.queueStatus === 'BOOKED';
  const canMove = item.registrationType === 'OP';
  // Earlier day (never seen) or a later-day appointment the patient came early for.
  const canMoveToToday = canMove && item.visitDate !== today;
  const paid = !booked && item.paymentStatus === 'PAID' && item.consultationFee > 0;
  const minMoveDate = item.visitDate === today ? addDays(1) : today;

  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'move' | 'cancel' | null>(null);
  const [moveDate, setMoveDate] = useState(addDays(1));
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [reasonText, setReasonText] = useState('');
  const [refund, setRefund] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function moveToToday() {
    setMenuOpen(false);
    setBusy(true);
    setRowError(null);
    try {
      const r = await registrationApi.rescheduleVisit(item.visitId, today);
      onChanged(
        booked
          ? `${item.patientName}'s appointment moved to today: new token ${r.tokenNumber}. Check in when the patient is here.`
          : `${item.patientName} moved to today: new token ${r.tokenNumber} with ${item.doctorName}.`,
      );
    } catch (err) {
      setRowError(errorText(err, 'Could not move the visit.'));
    } finally {
      setBusy(false);
    }
  }

  function openMove() {
    setMenuOpen(false);
    setMoveDate(item.visitDate === addDays(1) ? addDays(2) : addDays(1));
    setDialogError(null);
    setDialog('move');
  }

  function openCancel() {
    setMenuOpen(false);
    setReason(CANCEL_REASONS[0]);
    setReasonText('');
    setRefund(false);
    setDialogError(null);
    setDialog('cancel');
  }

  async function confirmMove() {
    setSaving(true);
    setDialogError(null);
    try {
      const r = await registrationApi.rescheduleVisit(item.visitId, moveDate);
      setDialog(null);
      onChanged(
        booked
          ? `${item.patientName}'s appointment moved to ${moveDate === today ? 'today' : dayLabel(moveDate)}: new token ${r.tokenNumber}.`
          : moveDate === today
            ? `${item.patientName} moved to today: new token ${r.tokenNumber}.`
            : `${item.patientName} booked for ${dayLabel(moveDate)} (token ${r.tokenNumber}).`,
      );
    } catch (err) {
      setDialogError(errorText(err, 'Could not move the visit.'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    const text = reason === 'Other' ? reasonText.trim() : [reason, reasonText.trim()].filter(Boolean).join(': ');
    if (!text) {
      setDialogError('Enter why the visit is cancelled.');
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      await registrationApi.cancelVisit(item.visitId, { reason: text.slice(0, REASON_MAX), refund });
      setDialog(null);
      onChanged(
        `Visit ${item.tokenNumber} of ${item.patientName} cancelled` +
          (refund && paid ? `; refund ${formatCurrency(item.consultationFee)} to the patient.` : '.'),
      );
    } catch (err) {
      setDialogError(errorText(err, 'Could not cancel the visit.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {variant === 'buttons' ? (
        <div className="va-buttons">
          {canMoveToToday && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void moveToToday()} disabled={busy}>
              {busy ? 'Moving…' : 'Move to today'}
            </button>
          )}
          {canMove && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={openMove} disabled={busy}>
              <Icon name="calendar" size={16} /> Change date
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm fq-danger" onClick={openCancel} disabled={busy}>
            <Icon name="close" size={16} /> Cancel visit
          </button>
        </div>
      ) : (
      <div className="fq-menu" ref={ref}>
        <button
          type="button"
          className="fq-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Actions for ${item.tokenNumber} ${item.patientName}`}
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
        >
          {busy ? (
            <span className="fq-spinner" aria-hidden="true" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          )}
        </button>
        {menuOpen && (
          <div className="fq-menu-list" role="menu">
            {canMoveToToday && (
              <button type="button" role="menuitem" onClick={() => void moveToToday()}>
                <Icon name="check" size={16} /> Move to today
              </button>
            )}
            {canMove && (
              <button type="button" role="menuitem" onClick={openMove}>
                <Icon name="calendar" size={16} /> Change date…
              </button>
            )}
            <button type="button" role="menuitem" className="danger" onClick={openCancel}>
              <Icon name="close" size={16} /> Cancel visit…
            </button>
          </div>
        )}
      </div>
      )}
      {rowError && <span className="fq-pending-error">{rowError}</span>}

      <Modal
        title="Change appointment date"
        open={dialog === 'move'}
        onClose={() => !saving && setDialog(null)}
        closeDisabled={saving}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)} disabled={saving}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void confirmMove()} disabled={saving || !moveDate}>
              {saving ? 'Moving…' : 'Move visit'}
            </button>
          </>
        }
      >
        <p className="fq-dialog-text">
          <strong>{item.patientName}</strong> · {item.tokenNumber} with {item.doctorName}, booked for {dayLabel(item.visitDate)}.
          {booked
            ? ' Stays an appointment for the chosen day with a new token for that day; the fee is collected on arrival.'
            : ' The visit gets a new token for the chosen day; the fee already paid carries over.'}
        </p>
        <label className="field">
          <span className="field-label">New date</span>
          <input
            className="input"
            type="date"
            value={moveDate}
            min={minMoveDate}
            max={addDays(30)}
            onChange={(e) => setMoveDate(e.target.value)}
          />
        </label>
        {dialogError && <div className="alert alert-error">{dialogError}</div>}
      </Modal>

      <Modal
        title={booked ? 'Cancel appointment' : 'Cancel visit'}
        open={dialog === 'cancel'}
        onClose={() => !saving && setDialog(null)}
        closeDisabled={saving}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)} disabled={saving}>
              Keep visit
            </button>
            <button type="button" className="btn btn-primary fq-danger-solid" onClick={() => void confirmCancel()} disabled={saving}>
              {saving ? 'Cancelling…' : 'Cancel visit'}
            </button>
          </>
        }
      >
        <p className="fq-dialog-text">
          <strong>{item.patientName}</strong> · {item.tokenNumber} with {item.doctorName}, {dayLabel(item.visitDate)}. The visit
          stays in the patient's history as cancelled.
        </p>
        <div className="field">
          <span className="field-label">Reason</span>
          <div className="fq-reasons" role="radiogroup" aria-label="Reason">
            {CANCEL_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                className={reason === r ? 'fq-chip on' : 'fq-chip'}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">{reason === 'Other' ? 'Details (required)' : 'Details (optional)'}</span>
          <input
            className="input"
            value={reasonText}
            maxLength={150}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="e.g. patient called, will come next week"
          />
        </label>
        {paid && canRefund && (
          <label className="fq-refund">
            <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
            <span>
              Refund <b>{formatCurrency(item.consultationFee)}</b> to the patient now
              <small>Recorded as a refund in today's collection.</small>
            </span>
          </label>
        )}
        {dialogError && <div className="alert alert-error">{dialogError}</div>}
      </Modal>
    </>
  );
}
