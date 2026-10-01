import { Icon } from '@/shared/components/Icons';
import { formatCurrency, formatTime } from '@/shared/utils/format';
import { PAYMENT_MODE_LABEL, QUEUE_STATUS_LABEL } from '../types';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function TodaysVisitCard({ form }: { form: RegistrationFormState }) {
  const { selectedDepartment, selectedDoctor, openVisit, feeQuote, visit } = form;
  const reg = openVisit?.registration;
  const receipt = openVisit?.receipt ?? null;

  // While editing an open visit the form shows the current selection; fall back to the saved names.
  const department = selectedDepartment?.name ?? reg?.departmentName;
  const doctor = selectedDoctor?.name ?? reg?.doctorName;

  const freeFollowUp = reg ? reg.isFollowUp : feeQuote?.isFollowUp === true;
  const fee = reg ? reg.consultationFee : visit.doctorId !== '' ? feeQuote?.fee : undefined;
  const standardFee = feeQuote?.standardFee ?? selectedDoctor?.consultationFee;

  let status: { label: string; cls: string };
  if (reg) status = freeFollowUp ? { label: 'Free follow-up', cls: 'badge-success' } : { label: 'Paid', cls: 'badge-success' };
  else if (freeFollowUp) status = { label: 'Not required', cls: 'badge-success' };
  else status = { label: 'Unpaid', cls: 'badge-danger' };

  return (
    <aside className="card visit-card" aria-labelledby="todays-visit-title">
      <div className="visit-card-head">
        <h2 className="card-title" id="todays-visit-title">
          <span className="icon-badge on-dark">
            <Icon name="calendar" size={20} />
          </span>
          Today's visit
        </h2>
        <span className="visit-card-date">{shortDate(new Date().toISOString())}</span>
      </div>

      <dl className="kv">
        <div>
          <dt>Department</dt>
          <dd>{department ?? '—'}</dd>
        </div>
        <div>
          <dt>Doctor</dt>
          <dd>{doctor ?? '—'}</dd>
        </div>
      </dl>

      <dl className="kv">
        <div>
          <dt>Consultation fee</dt>
          <dd className="fee">
            {fee !== undefined ? formatCurrency(fee) : '—'}
            {freeFollowUp && standardFee !== undefined && standardFee > 0 && (
              <s className="fee-standard">{formatCurrency(standardFee)}</s>
            )}
          </dd>
        </div>
        <div>
          <dt>Payment status</dt>
          <dd>
            <span className={`badge ${status.cls}`}>{status.label}</span>
          </dd>
        </div>
      </dl>

      {!reg && feeQuote?.isFollowUp && feeQuote.followUpOfDate && feeQuote.freeUntil && (
        <div className="followup-note">
          <Icon name="check" size={18} />
          <span>
            <strong>Free follow-up.</strong> Last paid visit {shortDate(feeQuote.followUpOfDate)} ({feeQuote.followUpOf}).
            Free with this doctor until {shortDate(feeQuote.freeUntil)}.
          </span>
        </div>
      )}

      {reg ? (
        <>
          <div className="token-ticket" aria-label={`Token ${reg.tokenNumber}`}>
            <span className="ticket-label">Token number</span>
            <span className="ticket-number">{reg.tokenNumber}</span>
            <span className="ticket-status">
              <span className="pulse-dot" aria-hidden="true" />
              {QUEUE_STATUS_LABEL[reg.queueStatus]}
            </span>
          </div>
          <dl className="kv kv-small">
            <div>
              <dt>Visit ID</dt>
              <dd>{reg.registrationNumber}</dd>
            </div>
            {reg.isFollowUp && reg.followUpOf && (
              <div>
                <dt>Follow-up of</dt>
                <dd>{reg.followUpOf}</dd>
              </div>
            )}
            {receipt && (
              <>
                <div>
                  <dt>Receipt</dt>
                  <dd>{receipt.receiptNumber}</dd>
                </div>
                <div>
                  <dt>Paid via</dt>
                  <dd>
                    {PAYMENT_MODE_LABEL[receipt.mode]}
                    {receipt.referenceNumber ? ` · ${receipt.referenceNumber}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{formatTime(receipt.paidAt)}</dd>
                </div>
              </>
            )}
          </dl>
        </>
      ) : (
        !feeQuote?.isFollowUp && (
          <p className="field-hint">
            The token is issued and the patient joins the OPD queue only after the consultation fee is collected.
          </p>
        )
      )}
    </aside>
  );
}
