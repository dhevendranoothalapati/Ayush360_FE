import { useState } from 'react';
import { Icon } from '@/shared/components/Icons';
import { formatCurrency } from '@/shared/utils/format';
import { registrationApi } from '../api/registrationApi';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';
import type { FeeQuote, Registration } from '../types';
import { PaymentDialog } from './PaymentDialog';
import { VisitActions, addDays, dayLabel } from './VisitActions';

/**
 * Registration screen: the selected patient's visits that aren't "today's open visit", so they'd otherwise be
 * invisible here:
 *   - booked for TODAY (appointment, not arrived yet): Check in & collect fee · Change date · Cancel
 *   - unseen from an EARLIER day (registered or booked, never seen): Move to today · Change date · Cancel
 *   - booked for a LATER day: Change date · Cancel
 */
export function PatientPendingVisits({
  form,
  onChanged,
}: {
  form: RegistrationFormState;
  onChanged: (message: string) => void;
}) {
  const today = addDays(0);
  const [checkInFor, setCheckInFor] = useState<{ visit: Registration; quote: FeeQuote } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localDay = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const visits = form.visitHistory
    .map((r) => ({ r, day: r.visitDate || localDay(r.registrationDate) }))
    .filter(
      ({ r, day }) =>
        r.visitStatus === 'REGISTERED' &&
        (r.queueStatus === 'BOOKED' || (r.queueStatus === 'WAITING' && day < today)),
    )
    .sort((a, b) => a.day.localeCompare(b.day));

  if (!form.selectedPatient || visits.length === 0) return null;
  const name = [form.patient.firstName, form.patient.lastName].filter(Boolean).join(' ');
  const dueToday = visits.filter(({ r, day }) => r.queueStatus === 'BOOKED' && day === today);
  const earlier = visits.filter(({ day }) => day < today);
  const later = visits.filter(({ day }) => day > today);

  /** Fee is decided by the server for today (free follow-up rule); nothing due = check in straight away. */
  async function startCheckIn(visit: Registration) {
    setError(null);
    setBusyId(visit.id);
    try {
      const quote = await registrationApi.getFeeQuote(visit.doctorId, form.selectedPatient!.id);
      if (quote.fee > 0) {
        setCheckInFor({ visit, quote });
      } else {
        await form.checkIn(visit.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the patient in.');
    } finally {
      setBusyId(null);
    }
  }

  const heading =
    dueToday.length > 0
      ? dueToday.length === 1
        ? 'Appointment today — check the patient in'
        : `${dueToday.length} appointments today — check the patient in`
      : earlier.length > 0
        ? earlier.length === 1
          ? 'Unseen visit from an earlier day'
          : `${earlier.length} unseen visits from earlier days`
        : later.length === 1
          ? 'Upcoming appointment'
          : `${later.length} upcoming appointments`;

  return (
    <section className={dueToday.length ? 'pv-banner pv-banner-today' : 'pv-banner'} aria-label="Appointments and unseen visits">
      <div>
        <h3>{heading}</h3>
        <p>
          {dueToday.length > 0
            ? 'Booked earlier, not arrived yet. Check in when the patient is here: the fee is collected and they join the line with their token.'
            : earlier.length > 0
              ? 'Registered but never seen by the doctor. If the patient is here for it, move it to today instead of registering again.'
              : 'Booked ahead; pay on arrival. Change the date or cancel if the patient asks.'}
        </p>
      </div>
      {visits.map(({ r, day }) => {
        const booked = r.queueStatus === 'BOOKED';
        const isDue = booked && day === today;
        return (
          <div className={isDue ? 'pv-item pv-item-due' : 'pv-item'} key={r.id}>
            <span className="pv-item-text">
              <strong>
                {day === today ? 'Today' : dayLabel(day)} · {r.tokenNumber} · {r.doctorName}
              </strong>
              <small>
                {r.departmentName}
                {booked
                  ? day < today
                    ? ' · Booked, patient did not come'
                    : ` · Appointment · pay on arrival (fee ${formatCurrency(r.consultationFee)})`
                  : ''}
                {!booked && r.paymentStatus === 'PAID' && r.consultationFee > 0 ? ` · Paid ${formatCurrency(r.consultationFee)}` : ''}
                {!booked && r.isFollowUp ? ' · Free follow-up' : ''}
              </small>
            </span>
            <span className="pv-item-actions">
              {isDue && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void startCheckIn(r)}
                  disabled={busyId !== null || form.saving}
                >
                  <Icon name="check" size={16} /> {busyId === r.id ? 'Checking…' : 'Check in & collect fee'}
                </button>
              )}
              <VisitActions
                variant="buttons"
                item={{
                  visitId: r.id,
                  visitDate: day,
                  registrationType: r.registrationType,
                  paymentStatus: r.paymentStatus,
                  consultationFee: r.consultationFee,
                  patientName: name,
                  doctorName: r.doctorName,
                  tokenNumber: r.tokenNumber,
                  queueStatus: r.queueStatus,
                }}
                onChanged={onChanged}
              />
            </span>
          </div>
        );
      })}
      {error && <div className="alert alert-error">{error}</div>}

      {checkInFor && (
        <PaymentDialog
          open
          amount={checkInFor.quote.fee}
          title="Check in · collect consultation fee"
          patientName={name}
          doctorName={checkInFor.visit.doctorName}
          onClose={() => setCheckInFor(null)}
          onConfirm={(payment) => form.checkIn(checkInFor.visit.id, payment)}
        />
      )}
    </section>
  );
}
