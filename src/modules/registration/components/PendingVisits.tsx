import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/shared/components/Icons';
import { formatCurrency, formatMobile } from '@/shared/utils/format';
import type { FrontDeskQueueItem } from '../types';
import { VisitActions, addDays, dayLabel } from './VisitActions';

/**
 * OP Queue → "Pending from earlier days": every earlier OPD visit the doctor never saw, however old (patient didn't
 * turn up, or wasn't called). Shown at the top of today's queue so the desk deals with them first. Each row has a
 * "⋮" menu (VisitActions): Move to today · Change date… · Cancel visit… Clicking the row opens the patient on the
 * Registration screen (which shows the same actions for unseen earlier visits).
 * After any action the parent reloads the queue (onChanged) and shows the message.
 */

const VISIBLE = 5;

const daysAgo = (yyyyMmDd: string) => {
  const n = Math.round((new Date(`${addDays(0)}T00:00:00`).getTime() - new Date(`${yyyyMmDd}T00:00:00`).getTime()) / 86_400_000);
  return n === 1 ? 'yesterday' : `${n} days ago`;
};

export function PendingVisits({
  items,
  onChanged,
}: {
  items: FrontDeskQueueItem[];
  onChanged: (message: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();
  if (items.length === 0) return null;
  const shown = showAll ? items : items.slice(0, VISIBLE);

  return (
    <section className="card fq-pending" aria-label="Pending visits from earlier days">
      <div className="fq-pending-head">
        <span className="fq-pending-icon">
          <Icon name="calendar" size={20} />
        </span>
        <div>
          <h2>
            Pending from earlier days <span className="fq-pending-count">{items.length}</span>
          </h2>
          <p>Registered (or booked) but never seen by the doctor. Use ⋮ to move to today, change the date, or cancel.</p>
        </div>
      </div>

      <ul className="fq-pending-list">
        {shown.map((i) => (
          <li key={i.visitId} className="fq-pending-row">
            <button
              type="button"
              className="fq-pending-open"
              onClick={() => navigate('/registration', { state: { patientId: i.patientId } })}
              title="Open on the Registration screen"
            >
            <span className="fq-pending-when">
              <strong>{dayLabel(i.visitDate)}</strong>
              <small>
                {daysAgo(i.visitDate)} · {i.tokenNumber}
              </small>
            </span>
            <span className="fq-patient">
              <strong>{i.patientName}</strong>
              <small>
                {i.patientNumber}
                {i.mobileNumber && ` · ${formatMobile(i.mobileNumber)}`}
              </small>
            </span>
            <span className="fq-doctor-cell">
              <strong>{i.doctorName}</strong>
              <small>
                {i.departmentName}
                {i.queueStatus === 'BOOKED'
                  ? ' · Appointment, did not come'
                  : i.paymentStatus === 'PAID' && i.consultationFee > 0
                  ? ` · Paid ${formatCurrency(i.consultationFee)}`
                  : i.isFollowUp
                    ? ' · Free follow-up'
                    : ''}
              </small>
            </span>
            </button>
            <span className="fq-pending-actions">
              <VisitActions item={i} onChanged={onChanged} />
            </span>
          </li>
        ))}
      </ul>
      {items.length > VISIBLE && (
        <button type="button" className="fq-pending-more" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
