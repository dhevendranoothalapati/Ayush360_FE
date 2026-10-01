import { Icon } from '@/shared/components/Icons';
import { isBlank } from '@/shared/utils/validation';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';

/** Shows where the receptionist is in the flow: Patient → Visit → Payment → Token. */
export function RegistrationStepper({ form }: { form: RegistrationFormState }) {
  const { patient, selectedPatient, visit, openVisit, feeQuote } = form;

  const registered = openVisit !== null;
  const regType = registered ? openVisit.registration.registrationType : null;
  const emergency = registered ? regType === 'EMERGENCY' || regType === 'ICU' : visit.source === 'EMERGENCY' || visit.source === 'ICU';
  const deposit = registered ? openVisit.registration.depositAmount ?? 0 : Number(visit.depositAmount || 0);
  const detailsComplete =
    !isBlank(patient.firstName) &&
    !isBlank(patient.lastName) &&
    patient.gender !== '' &&
    (emergency || (patient.mobileNumber.length === 10 && !isBlank(patient.addressLine1)));
  const visitDone = visit.departmentId !== '' && visit.doctorId !== '' && !isBlank(visit.reasonForVisit);
  const followUp = !emergency && (registered ? openVisit.registration.isFollowUp : feeQuote?.isFollowUp === true);

  const steps = [
    { label: 'Patient', hint: selectedPatient ? 'Existing patient' : 'New patient', done: detailsComplete || registered },
    { label: 'Visit', hint: emergency ? 'Doctor & details' : 'Doctor & reason', done: visitDone || registered },
    {
      label: 'Payment',
      hint: emergency ? (deposit > 0 ? 'Advance / deposit' : 'Billed later') : followUp ? 'Free follow-up' : 'Consultation fee',
      done: registered || ((followUp || (emergency && deposit === 0)) && visitDone),
    },
    { label: 'Token', hint: registered ? openVisit.registration.tokenNumber : 'Joins queue', done: registered },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <ol className="stepper" aria-label="Registration progress">
      {steps.map((s, i) => {
        const state = s.done ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s.label} className={`step step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-dot">{s.done ? <Icon name="check" size={16} /> : i + 1}</span>
            <span className="step-text">
              <span className="step-label">{s.label}</span>
              <span className="step-hint">{s.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
