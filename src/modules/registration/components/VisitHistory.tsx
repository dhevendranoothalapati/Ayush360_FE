import { useState } from 'react';
import { Icon } from '@/shared/components/Icons';
import { formatCurrency, formatDateTime } from '@/shared/utils/format';
import { QUEUE_STATUS_LABEL, type Registration } from '../types';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';

function statusOf(r: Registration): { label: string; cls: string } {
  if (r.visitStatus === 'CANCELLED') return { label: 'Cancelled', cls: 'vh-cancelled' };
  if (r.visitStatus === 'COMPLETED') return { label: 'Completed', cls: 'vh-done' };
  return { label: QUEUE_STATUS_LABEL[r.queueStatus], cls: 'vh-open' };
}

/** All visits of the selected patient (newest first). Read-only; open visits can be picked for editing. */
export function VisitHistory({ form }: { form: RegistrationFormState }) {
  const { visitHistory, openVisits, openVisit, selectOpenVisit } = form;
  const [open, setOpen] = useState(false);
  if (visitHistory.length === 0) return null;

  const openIds = new Set(openVisits.map((v) => v.registration.id));

  return (
    <div className="visit-history">
      <button type="button" className="vh-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="calendar" size={16} />
        Visit history ({visitHistory.length})
        <Icon name="chevronDown" size={16} className={open ? 'vh-caret up' : 'vh-caret'} />
      </button>

      {open && (
        <div className="vh-table-wrap">
          <table className="vh-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Token</th>
                <th>Department · Doctor</th>
                <th>Payer</th>
                <th className="num">Fee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visitHistory.map((r) => {
                const st = statusOf(r);
                const editable = openIds.has(r.id);
                const current = openVisit?.registration.id === r.id;
                return (
                  <tr
                    key={r.id}
                    className={`${editable ? 'vh-editable' : ''} ${current ? 'vh-current' : ''}`}
                    onClick={editable ? () => selectOpenVisit(r.id) : undefined}
                    title={editable ? 'Open this visit for editing' : undefined}
                  >
                    <td>
                      {formatDateTime(r.registrationDate)}
                      <small>{r.registrationNumber}</small>
                    </td>
                    <td>{r.tokenNumber}</td>
                    <td>
                      {r.departmentName}
                      <small>{r.doctorName}</small>
                    </td>
                    <td>{r.payerType === 'INSURANCE' ? r.insurerName : 'Self'}</td>
                    <td className="num">
                      {formatCurrency(r.consultationFee)}
                      {r.isFollowUp && <small>Follow-up</small>}
                    </td>
                    <td>
                      <span className={`vh-status ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
