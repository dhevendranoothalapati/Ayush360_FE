import { createPortal } from 'react-dom';
import { useCurrentUser } from '@/core/authentication/AuthContext';
import { formatDateTime } from '@/shared/utils/format';
import { ADMISSION_TYPE_OPTIONS, GENDER_SHORT, TIMING_OPTIONS, type Consultation, type EncounterInput } from '../types';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Printable A5 prescription (shown only by the browser's print; see .print-area in index.css).
 * Prints what is on screen, so the doctor can print before or after completing.
 */
export function PrescriptionPrint({ data, input }: { data: Consultation; input: EncounterInput }) {
  const user = useCurrentUser();
  const { patient, visit, doctor } = data;
  const v = input.vitals;
  const vitals = [
    v.temperatureF !== null && `Temp ${v.temperatureF} °F`,
    v.pulse !== null && `Pulse ${v.pulse}/min`,
    v.systolicBp !== null && v.diastolicBp !== null && `BP ${v.systolicBp}/${v.diastolicBp} mmHg`,
    v.respiratoryRate !== null && `RR ${v.respiratoryRate}/min`,
    v.spo2 !== null && `SpO₂ ${v.spo2}%`,
    v.weightKg !== null && `Wt ${v.weightKg} kg`,
    v.heightCm !== null && `Ht ${v.heightCm} cm`,
  ].filter(Boolean);
  const timing = (t: string) => TIMING_OPTIONS.find((o) => o.value === t)?.label ?? '';
  const primary = input.diagnoses.filter((d) => d.description.trim());

  return createPortal(
    <div className="print-area" aria-hidden="true">
      <div className="rx-print">
        <header className="rxp-head">
          <div>
            <div className="rxp-hospital">{user.tenant.name}</div>
            <div className="rxp-sub">{user.tenant.city}</div>
          </div>
          <div className="rxp-doctor">
            <strong>{doctor.name}</strong>
            {doctor.qualification && <span>{doctor.qualification}</span>}
            <span>{doctor.departmentName}</span>
            {doctor.registrationNumber && (
              <span>
                Reg. No. {doctor.registrationNumber}
                {doctor.medicalCouncil ? ` · ${doctor.medicalCouncil}` : ''}
              </span>
            )}
          </div>
        </header>

        <table className="rxp-patient">
          <tbody>
            <tr>
              <td>
                <span className="rxp-label">Patient</span>
                {patient.name} ({patient.patientNumber})
              </td>
              <td>
                <span className="rxp-label">Age / Sex</span>
                {patient.ageYears ?? '-'} yrs / {GENDER_SHORT[patient.gender] ?? '-'}
              </td>
              <td>
                <span className="rxp-label">Date</span>
                {formatDateTime(data.encounter?.startedAt ?? visit.registeredAt)}
              </td>
              <td>
                <span className="rxp-label">Visit</span>
                {visit.visitNumber} · {visit.tokenNumber}
              </td>
            </tr>
          </tbody>
        </table>

        {vitals.length > 0 && <p className="rxp-line"><b>Vitals:</b> {vitals.join(' · ')}</p>}
        {input.allergies && <p className="rxp-line rxp-allergy"><b>Allergies:</b> {input.allergies}</p>}
        {input.chiefComplaints && <p className="rxp-line"><b>Complaints:</b> {input.chiefComplaints}</p>}
        {input.examination && <p className="rxp-line"><b>Findings:</b> {input.examination}</p>}
        {primary.length > 0 && (
          <p className="rxp-line">
            <b>Diagnosis:</b>{' '}
            {primary.map((d) => (d.icd10Code ? `${d.description} (${d.icd10Code})` : d.description)).join('; ')}
          </p>
        )}

        <div className="rxp-rx">℞</div>
        {input.prescriptions.length === 0 ? (
          <p className="rxp-line">No medicines.</p>
        ) : (
          <table className="rxp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Medicine</th>
                <th>Dose</th>
                <th>Frequency</th>
                <th>When</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {input.prescriptions.map((p, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <b>{p.medicineName}</b> {p.strength} {p.form && <small>({p.form})</small>}
                    {p.instructions && <div className="rxp-note">{p.instructions}</div>}
                  </td>
                  <td>{p.dose}</td>
                  <td>{p.frequency}</td>
                  <td>{timing(p.timing)}</td>
                  <td>{p.durationDays ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {input.labOrders.length > 0 && (
          <p className="rxp-line">
            <b>Investigations:</b>{' '}
            {input.labOrders.map((o) => (o.notes ? `${o.testName} (${o.notes})` : o.testName)).join(', ')}
          </p>
        )}
        {input.advice && <p className="rxp-line"><b>Advice:</b> {input.advice}</p>}
        {input.admissionRequested && (
          <p className="rxp-line">
            <b>Admission advised:</b> {ADMISSION_TYPE_OPTIONS.find((a) => a.value === input.admissionType)?.label ?? ''}
            {input.admissionReason ? ` — ${input.admissionReason}` : ''}
          </p>
        )}
        {input.followUpDate && <p className="rxp-line"><b>Review on:</b> {formatDate(input.followUpDate)}</p>}

        <footer className="rxp-foot">
          <span>Not valid for medico-legal purposes unless signed.</span>
          <span className="rxp-sign">
            {doctor.name}
            <small>Signature</small>
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
