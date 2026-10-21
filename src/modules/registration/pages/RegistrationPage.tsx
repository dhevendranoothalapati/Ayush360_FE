import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/shared/components/Icons';
import { formatTime, fullName } from '@/shared/utils/format';
import { PatientSearch } from '../components/PatientSearch';
import { PatientDetailsForm } from '../components/PatientDetailsForm';
import { VisitDetailsForm } from '../components/VisitDetailsForm';
import { TodaysVisitCard } from '../components/TodaysVisitCard';
import { PatientPendingVisits } from '../components/PatientPendingVisits';
import { PaymentDialog } from '../components/PaymentDialog';
import { FrontDeskHero } from '../components/FrontDeskHero';
import { RegistrationStepper } from '../components/RegistrationStepper';
import { PayerDetailsForm } from '../components/PayerDetailsForm';
import { RegistrationReceipt } from '../components/RegistrationReceipt';
import { AcuteDetailsForm } from '../components/AcuteDetailsForm';
import { isBooking, localIsoDate, useRegistrationForm, visitDayOf } from '../hooks/useRegistrationForm';
import { dayLabel } from '../components/VisitActions';
import type { Patient } from '../types';
import '../registration.css';

/**
 * Front desk: Patient registration (Figure 1 of the workflow guide).
 * Flow: find/enter patient -> visit details -> collect fee -> registration + receipt + token.
 */
export default function RegistrationPage() {
  const form = useRegistrationForm();
  const [payOpen, setPayOpen] = useState(false);
  const { result, patient, selectedDoctor, deskState, feeQuote, openVisit } = form;
  const dirty = form.patientEdited || form.visitEdited;
  const location = useLocation();
  const navigate = useNavigate();
  /** Message after Change date / Cancel on today's open visit. */
  const [visitActionMessage, setVisitActionMessage] = useState<string | null>(null);

  // A different patient (or a new one) clears the message.
  const selectedId = form.selectedPatient?.id;
  useEffect(() => setVisitActionMessage(null), [selectedId]);

  async function afterVisitAction(message: string) {
    if (form.selectedPatient) await form.selectPatient(form.selectedPatient); // reload: visit moved or cancelled
    setVisitActionMessage(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Opened from the Patient queue: load that patient (and today's visit) straight away.
  const openPatientId = (location.state as { patientId?: number } | null)?.patientId;
  useEffect(() => {
    if (!openPatientId) return;
    navigate(location.pathname, { replace: true, state: null }); // so a page reload doesn't load it again
    void form.selectPatient({ id: openPatientId } as Patient); // only the id is used
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPatientId]);

  // Bring the success banner and token into view after a registration.
  useEffect(() => {
    if (result) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [result]);

  const patientName = fullName(patient) || 'New patient';

  function printReceipt() {
    window.print();
  }
  const acute = form.isAcute; // Emergency or ICU: no consultation fee, optional deposit
  const deposit = acute ? Number(form.visit.depositAmount || 0) : 0;
  const freeFollowUp = !acute && feeQuote?.isFollowUp === true;
  // Future appointment: nothing collected now (pay on arrival, at check-in).
  const booking = deskState !== 'OPEN_VISIT' && isBooking(form.visit);
  const noPaymentNow = booking || (acute && deposit === 0) || freeFollowUp;
  const bookedResult = result?.registration.queueStatus === 'BOOKED';

  async function startRegistration() {
    if (!form.validateAll()) return;
    if (noPaymentNow) {
      // Appointment, Emergency / ICU without deposit, or free follow-up: nothing to collect, register straight away.
      try {
        await form.submit();
      } catch {
        /* error shown via form state */
      }
      return;
    }
    setPayOpen(true);
  }

  return (
    <div className="registration-page">
      <FrontDeskHero summary={form.summary} />
      <RegistrationStepper form={form} />

      {result && bookedResult && (
        <div className="success-banner booking-banner" role="status">
          <span className="success-icon">
            <Icon name="calendar" size={26} />
          </span>
          <div>
            <div className="success-kicker">
              {result.registration.source === 'PHONE' ? 'Phone appointment booked' : 'Appointment booked'} · pay on arrival
            </div>
            <div className="success-token">
              Token number: {result.registration.tokenNumber} ·{' '}
              {dayLabel(result.registration.visitDate || result.registration.registrationDate.slice(0, 10))}
            </div>
            <div className="success-text">
              {fullName(result.patient)} ({result.patient.patientNumber}) with {result.registration.doctorName}. When the
              patient arrives that day, open them here and click Check in — the fee is collected then and they join the
              doctor's line with this token.
            </div>
          </div>
        </div>
      )}

      {result && !bookedResult && (
        <div className="success-banner" role="status">
          <span className="success-icon">
            <Icon name="check" size={26} />
          </span>
          <div>
            <div className="success-kicker">
              Registration successful ·{' '}
              {result.registration.registrationType === 'ICU'
                ? 'ICU admission recorded — charges billed per day'
                : result.registration.registrationType === 'EMERGENCY'
                ? 'Emergency — charges billed later'
                : result.registration.isFollowUp
                  ? 'Free follow-up (no fee)'
                  : 'Payment received'}
            </div>
            <div className="success-token">Token number: {result.registration.tokenNumber}</div>
            <div className="success-text">
              {fullName(result.patient)} ({result.patient.patientNumber}) has been added to the patient queue.
              You can still correct any detail below and click Save changes.
            </div>
          </div>
          <button className="btn btn-primary success-print" onClick={printReceipt}>
            <Icon name="printer" size={18} /> Print receipt
          </button>
        </div>
      )}

      {form.pendingDraft && deskState === 'NEW' && (
        <div className="alert alert-warning draft-banner">
          <span>You have an unsaved registration draft from {formatTime(form.pendingDraft.savedAt)}.</span>
          <span className="draft-actions">
            <button className="btn btn-ghost" onClick={form.restoreDraft}>
              Restore draft
            </button>
            <button className="btn btn-ghost" onClick={form.discardDraft}>
              Discard
            </button>
          </span>
        </div>
      )}

      {visitActionMessage && (
        <div className="alert alert-success visit-action-notice" role="status">
          {visitActionMessage}
        </div>
      )}

      <div className="registration-grid">
        <div className="registration-main">
          <PatientSearch onSelect={(p) => void form.selectPatient(p)} />
          <PatientPendingVisits form={form} onChanged={(m) => void afterVisitAction(m)} />

          <div className="card form-card">
            <PatientDetailsForm form={form} disabled={form.saving} />
            <hr className="divider" />
            <VisitDetailsForm form={form} disabled={form.saving} />
            {acute && (
              <>
                <hr className="divider" />
                <AcuteDetailsForm form={form} disabled={form.saving} />
              </>
            )}
            <hr className="divider" />
            <PayerDetailsForm form={form} disabled={form.saving} />
          </div>

          {form.notice && (
            <div className="alert alert-success" role="status">
              {form.notice}
            </div>
          )}

          {form.formError && (
            <div className="alert alert-error" role="alert">
              {form.formError}
            </div>
          )}

          <div className="form-actions">
            {deskState === 'OPEN_VISIT' ? (
              <>
                {dirty && (
                  <button className="btn btn-ghost btn-lg" onClick={form.discardChanges} disabled={form.saving}>
                    Undo changes
                  </button>
                )}
                <button
                  className="btn btn-secondary btn-lg"
                  onClick={printReceipt}
                  title={dirty ? 'Prints the saved details — save your changes first' : 'Print the registration receipt'}
                >
                  <Icon name="printer" size={18} /> Print receipt
                </button>
                <button className="btn btn-secondary btn-lg" onClick={form.startNewVisit} title="Book another visit for this patient">
                  <Icon name="plus" size={18} /> Another visit
                </button>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => void form.saveChanges()}
                  disabled={!dirty || form.saving}
                >
                  {form.saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            ) : (
              <>
                {form.draftSavedAt && (
                  <span className="field-hint">Draft saved at {formatTime(form.draftSavedAt)} (not in queue)</span>
                )}
                {deskState === 'EXISTING' && form.patientEdited && (
                  <button
                    className="btn btn-secondary btn-lg"
                    onClick={() => void form.saveChanges()}
                    disabled={form.saving}
                    title="Save the corrected patient details without booking a visit"
                  >
                    Save patient details
                  </button>
                )}
                <button className="btn btn-secondary btn-lg" onClick={form.saveDraft}>
                  Save draft
                </button>
                <button
                  className={`btn btn-lg ${acute ? 'btn-emergency' : 'btn-primary'}`}
                  onClick={() => void startRegistration()}
                  disabled={form.saving}
                >
                  {form.saving
                    ? booking
                      ? 'Booking…'
                      : 'Registering…'
                    : booking
                      ? `Book appointment · ${
                          visitDayOf(form.visit) === localIsoDate() ? 'Today' : dayLabel(visitDayOf(form.visit))
                        }`
                      : acute
                      ? `Register ${form.isIcu ? 'ICU admission' : 'emergency'}${deposit > 0 ? ' & collect deposit' : ''}`
                      : freeFollowUp
                        ? 'Register free follow-up'
                        : 'Registration'}
                </button>
              </>
            )}
          </div>
        </div>

        <TodaysVisitCard form={form} onVisitAction={(m) => void afterVisitAction(m)} />
      </div>

      {openVisit && form.selectedPatient && <RegistrationReceipt patient={form.selectedPatient} visit={openVisit} />}

      {selectedDoctor && !openVisit && (
        <PaymentDialog
          open={payOpen}
          amount={acute ? deposit : (feeQuote?.fee ?? selectedDoctor.consultationFee)}
          title={acute ? 'Collect advance / deposit' : undefined}
          patientName={patientName}
          doctorName={selectedDoctor.name}
          onClose={() => setPayOpen(false)}
          onConfirm={form.submit}
        />
      )}
    </div>
  );
}
