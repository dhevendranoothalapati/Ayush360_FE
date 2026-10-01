import { useEffect, useState } from 'react';
import { Icon } from '@/shared/components/Icons';
import { formatTime, fullName } from '@/shared/utils/format';
import { PatientSearch } from '../components/PatientSearch';
import { PatientDetailsForm } from '../components/PatientDetailsForm';
import { VisitDetailsForm } from '../components/VisitDetailsForm';
import { TodaysVisitCard } from '../components/TodaysVisitCard';
import { PaymentDialog } from '../components/PaymentDialog';
import { FrontDeskHero } from '../components/FrontDeskHero';
import { RegistrationStepper } from '../components/RegistrationStepper';
import { PayerDetailsForm } from '../components/PayerDetailsForm';
import { RegistrationReceipt } from '../components/RegistrationReceipt';
import { useRegistrationForm } from '../hooks/useRegistrationForm';
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

  // Bring the success banner and token into view after a registration.
  useEffect(() => {
    if (result) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [result]);

  const patientName = fullName(patient) || 'New patient';

  function printReceipt() {
    window.print();
  }
  const freeFollowUp = feeQuote?.isFollowUp === true;

  async function startRegistration() {
    if (!form.validateAll()) return;
    if (freeFollowUp) {
      // No fee to collect: register straight away.
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

      {result && (
        <div className="success-banner" role="status">
          <span className="success-icon">
            <Icon name="check" size={26} />
          </span>
          <div>
            <div className="success-kicker">
              Registration successful ·{' '}
              {result.registration.isFollowUp ? 'Free follow-up (no fee)' : 'Payment received'}
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

      <div className="registration-grid">
        <div className="registration-main">
          <PatientSearch onSelect={(p) => void form.selectPatient(p)} />

          <div className="card form-card">
            <PatientDetailsForm form={form} disabled={form.saving} />
            <hr className="divider" />
            <VisitDetailsForm form={form} disabled={form.saving} />
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
                <button className="btn btn-primary btn-lg" onClick={() => void startRegistration()} disabled={form.saving}>
                  {form.saving ? 'Registering…' : freeFollowUp ? 'Register free follow-up' : 'Registration'}
                </button>
              </>
            )}
          </div>
        </div>

        <TodaysVisitCard form={form} />
      </div>

      {openVisit && form.selectedPatient && <RegistrationReceipt patient={form.selectedPatient} visit={openVisit} />}

      {selectedDoctor && !openVisit && (
        <PaymentDialog
          open={payOpen}
          amount={feeQuote?.fee ?? selectedDoctor.consultationFee}
          patientName={patientName}
          doctorName={selectedDoctor.name}
          onClose={() => setPayOpen(false)}
          onConfirm={form.submit}
        />
      )}
    </div>
  );
}
