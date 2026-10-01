import { FormField } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icons';
import { formatCurrency } from '@/shared/utils/format';
import { VISIT_SOURCE_OPTIONS, type VisitSource } from '../types';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';
import { VisitSwitcher } from './VisitSwitcher';

export function VisitDetailsForm({ form, disabled = false }: { form: RegistrationFormState; disabled?: boolean }) {
  const { visit, errors, departments, doctors, updateVisit, loadingMasters, openVisit, visitEdited } = form;
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

        <FormField label="Doctor" htmlFor="doctorId" required error={errors.doctorId}>
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
                {d.name} ({formatCurrency(d.consultationFee)})
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Visit type" htmlFor="source" required>
          <select
            id="source"
            className="select"
            value={visit.source}
            onChange={(e) => updateVisit('source', e.target.value as VisitSource)}
          >
            {VISIT_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Reason for visit" htmlFor="reasonForVisit" required error={errors.reasonForVisit}>
          <input
            id="reasonForVisit"
            className="input"
            placeholder="e.g. General consultation"
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
