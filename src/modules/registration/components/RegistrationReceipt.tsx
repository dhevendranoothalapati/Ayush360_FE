import { createPortal } from 'react-dom';
import { useCurrentUser } from '@/core/authentication/AuthContext';
import { ageFromDob, formatCurrency, formatDateTime, formatMobile, fullName } from '@/shared/utils/format';
import { GENDER_OPTIONS, PAYMENT_MODE_LABEL, type OpenVisit, type Patient } from '../types';

interface Props {
  patient: Patient;
  visit: OpenVisit;
}

/**
 * Printable OP registration receipt. Rendered outside the app root and shown
 * only by the browser's print (see .print-area in index.css). One page, essentials only.
 */
export function RegistrationReceipt({ patient, visit }: Props) {
  const user = useCurrentUser();
  const reg = visit.registration;
  const receipt = visit.receipt;
  const age = ageFromDob(patient.dateOfBirth);
  const gender = GENDER_OPTIONS.find((g) => g.value === patient.gender)?.label ?? '';

  return createPortal(
    <div className="print-area" aria-hidden="true">
      <div className="rcpt">
        <header className="rcpt-head">
          <div>
            <div className="rcpt-hospital">{user.tenant.name}</div>
            <div className="rcpt-sub">{user.tenant.city}</div>
          </div>
          <div className="rcpt-title">
            OP Registration Receipt
            <span>{receipt?.receiptNumber ?? reg.registrationNumber}</span>
          </div>
        </header>

        <div className="rcpt-token">
          <div>
            <span className="rcpt-label">Token</span>
            <strong>{reg.tokenNumber}</strong>
          </div>
          <div>
            <span className="rcpt-label">Visit ID</span>
            <strong className="rcpt-mid">{reg.registrationNumber}</strong>
          </div>
          <div>
            <span className="rcpt-label">Date &amp; time</span>
            <strong className="rcpt-mid">{formatDateTime(reg.registrationDate)}</strong>
          </div>
        </div>

        <table className="rcpt-table">
          <tbody>
            <tr>
              <th>Patient</th>
              <td>
                {fullName(patient)} <small>({patient.patientNumber})</small>
              </td>
              <th>Age / Gender</th>
              <td>
                {age !== null ? `${age} yrs` : '-'} / {gender || '-'}
              </td>
            </tr>
            <tr>
              <th>Doctor</th>
              <td>{reg.doctorName}</td>
              <th>Department</th>
              <td>{reg.departmentName}</td>
            </tr>
            <tr>
              <th>Mobile</th>
              <td>{formatMobile(patient.mobileNumber)}</td>
              <th>Payer</th>
              <td>
                {reg.payerType === 'INSURANCE' ? `${reg.insurerName} · ${reg.policyNumber}` : 'Self'}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="rcpt-table rcpt-amount">
          <tbody>
            <tr className="rcpt-total">
              <th>
                Amount paid
                {reg.isFollowUp ? ` (free follow-up of ${reg.followUpOf})` : ''}
              </th>
              <td className="num">
                {formatCurrency(receipt?.amount ?? reg.consultationFee)}
                <small>
                  {' '}
                  {receipt ? PAYMENT_MODE_LABEL[receipt.mode] : ''}
                  {receipt?.referenceNumber ? ` · ${receipt.referenceNumber}` : ''}
                </small>
              </td>
            </tr>
          </tbody>
        </table>

        <footer className="rcpt-foot">
          Registered by {user.displayName} · Please wait for your token to be called
        </footer>
      </div>
    </div>,
    document.body,
  );
}
