import { FormField } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icons';
import { formatCurrency } from '@/shared/utils/format';
import { VISIT_SOURCE_OPTIONS, type VisitSource } from '../types';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';
import { VisitSwitcher } from './VisitSwitcher';

export function VisitDetailsForm({ form, disabled = false }: { form: RegistrationFormState; disabled?: boolean }) {
  const { visit, errors, departments, doctors, updateVisit, loadingMasters, openVisit, visitEdited, isAcute, isIcu } = form;
  const invalid = (f: keyof typeof errors) => (errors[f] ? true : undefined);

  return (
    <section aria-labelledby="visit-details-title">
      <div className="section-head">
        <h2 className="card-title" id="visit-details-title">
          <span className="icon-badge accent-violet">
            <Icon name="stethoscope" size={20} />
          </span>
          <span>
            Visit details
            <span className="card-sub">
              {openVisit
                ? `Today's open visit · ${openVisit.registration.registrationNumber} — edit and save`
                : 'New visit — department, doctor and reason'}
            </span>
          </span>
        </h2>
        {visitEdited && <span className="rs-edited">Unsaved changes</span>}
      </div>

      <VisitSwitcher form={form} />

      {visit.source === 'EMERGENCY' && (
        <div className="emergency-note" role="note">
          <strong>Emergency case</strong> — gets an E-token and is seen first. No consultation fee at the desk: emergency
          charges go to the patient's bill (an advance can be taken below). Mobile and address can be filled in later; use
          "Unknown" as the name if the patient cannot be identified.
        </div>
      )}
      {isIcu && (
        <div className="emergency-note icu-note" role="note">
          <strong>ICU admission entry</strong> — records the patient's entry into the ICU. ICU bed and care charges are
          billed per day to the patient's account; collect an advance / deposit below if your hospital requires it.
        </div>
      )}

      <fieldset className="form-grid" disabled={disabled}>
        <FormField label="Department" htmlFor="departmentId" required error={errors.departmentId}>
          <select
            id="departmentId"
            className="select"
            value={visit.departmentId}
            onChange={(e) => updateVisit('departmentId', e.target.value ? Number(e.target.value) : '')}
            aria-invalid={invalid('departmentId')}
            disabled={loadingMasters}
          >
            <option value="">{loadingMasters ? 'Loading…' : 'Select department'}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label={isIcu ? 'Admitting consultant' : isAcute ? 'Duty doctor' : 'Doctor'}
          htmlFor="doctorId"
          required
          error={errors.doctorId}
        >
          <select
            id="doctorId"
            className="select"
            value={visit.doctorId}
            onChange={(e) => updateVisit('doctorId', e.target.value ? Number(e.target.value) : '')}
            aria-invalid={invalid('doctorId')}
            disabled={visit.departmentId === ''}
          >
            <option value="">{visit.departmentId === '' ? 'Select department first' : 'Select doctor'}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {/* OPD shows the consultation fee; Emergency / ICU charges are billed later. */}
                {isAcute ? d.name : `${d.name} (${formatCurrency(d.consultationFee)})`}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Visit type" htmlFor="source" required>
          <select
            id="source"
            data-emergency={isAcute || undefined}
            className="select"
            value={visit.source}
            onChange={(e) => {
              // Emergency / ICU defaults (department, arrival time) are applied by the form hook.
              updateVisit('source', e.target.value as VisitSource);
            }}
          >
            {VISIT_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label={isIcu ? 'Provisional diagnosis' : isAcute ? 'Chief complaint' : 'Reason for visit'}
          htmlFor="reasonForVisit"
          required
          error={errors.reasonForVisit}
        >
          <input
            id="reasonForVisit"
            className="input"
            placeholder={isIcu ? 'e.g. Sepsis with shock' : isAcute ? 'e.g. Road traffic accident' : 'e.g. General consultation'}
            value={visit.reasonForVisit}
            onChange={(e) => updateVisit('reasonForVisit', e.target.value)}
            aria-invalid={invalid('reasonForVisit')}
            maxLength={200}
          />
        </FormField>

        <label className="checkbox span-2">
          <input
            type="checkbox"
            checked={visit.messageConsent}
            onChange={(e) => updateVisit('messageConsent', e.target.checked)}
          />
          <span>
            Patient agreed to appointment messages
            <span className="field-hint" style={{ display: 'block' }}>
              We can send appointment reminders and updates to the patient's mobile number.
            </span>
          </span>
        </label>
      </fieldset>
    </section>
  );
}
