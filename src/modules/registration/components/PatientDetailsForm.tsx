import { useEffect, useState } from 'react';
import { FormField } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icons';
import { ageFromDob, formatDateTime } from '@/shared/utils/format';
import { digitsOnly } from '@/shared/utils/validation';
import { BLOOD_GROUPS, GENDER_OPTIONS, type BloodGroup, type Gender } from '../types';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';
import { VisitHistory } from './VisitHistory';

/**
 * Patient fields. Always the same editable form — for a new patient, a patient
 * picked from search, or one with an open visit today.
 */
export function PatientDetailsForm({ form, disabled = false }: { form: RegistrationFormState; disabled?: boolean }) {
  const { patient, errors, updatePatient, selectedPatient, lastVisit, openVisits, patientEdited, loadingPatient, reset } =
    form;
  const [showMore, setShowMore] = useState(false);
  const invalid = (f: keyof typeof errors) => (errors[f] ? true : undefined);

  // When a saved patient is loaded, open the optional section if they have data there.
  useEffect(() => {
    if (!selectedPatient) {
      setShowMore(false);
      return;
    }
    const p = selectedPatient;
    setShowMore(
      Boolean(
        p.middleName || p.dateOfBirth || p.email || p.bloodGroup || p.addressLine2 || p.city || p.state ||
          p.postalCode || p.emergencyContactName || p.emergencyContactPhone,
      ),
    );
  }, [selectedPatient]);

  const age = selectedPatient ? ageFromDob(selectedPatient.dateOfBirth) : null;

  // Age and date of birth are one value: typing an age stores an estimated DOB (same day, N years ago).
  const exactDob = Boolean(patient.dateOfBirth) && !patient.dobEstimated;
  const currentAge = patient.dateOfBirth ? ageFromDob(patient.dateOfBirth) : null;
  const ageValue = currentAge !== null ? String(currentAge) : '';
  const ageHint = exactDob ? 'From date of birth' : undefined;

  function setAge(raw: string) {
    const digits = digitsOnly(raw, 3);
    if (digits === '') {
      updatePatient('dateOfBirth', '');
      updatePatient('dobEstimated', false);
      return;
    }
    const years = Math.min(Number(digits), 120);
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    updatePatient('dateOfBirth', d.toISOString().slice(0, 10));
    updatePatient('dobEstimated', true);
  }

  return (
    <section aria-labelledby="patient-details-title" aria-busy={loadingPatient}>
      <div className="section-head">
        <h2 className="card-title" id="patient-details-title">
          <span className="icon-badge accent-teal">
            <Icon name="user" size={20} />
          </span>
          <span>
            Patient details
            <span className="card-sub">
              {selectedPatient ? 'Existing patient — all details can be corrected here' : 'New patient — or search above'}
            </span>
          </span>
        </h2>
        {selectedPatient && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
            <Icon name="plus" size={16} /> New patient
          </button>
        )}
      </div>

      {selectedPatient && (
        <div className="returning-strip">
          <span className="rs-id">{selectedPatient.patientNumber}</span>
          <span className="rs-meta">
            {age !== null ? `${age} years · ` : ''}
            {lastVisit
              ? `Last visit ${formatDateTime(lastVisit.registrationDate)} · ${lastVisit.doctorName}`
              : openVisits.length
                ? 'First visit'
                : 'No earlier visits'}
          </span>
          {openVisits.length > 0 && (
            <span className="rs-open">
              <span className="pulse-dot dark" aria-hidden="true" />
              {openVisits.length === 1
                ? `Open visit today · Token ${openVisits[0].registration.tokenNumber}`
                : `${openVisits.length} open visits today · ${openVisits.map((v) => v.registration.tokenNumber).join(', ')}`}
            </span>
          )}
          {patientEdited && <span className="rs-edited">Unsaved changes</span>}
        </div>
      )}

      <VisitHistory form={form} />

        <fieldset className="form-grid" disabled={disabled}>
          <FormField label="First Name" htmlFor="firstName" required error={errors.firstName}>
            <input
              id="firstName"
              className="input"
              value={patient.firstName}
              onChange={(e) => updatePatient('firstName', e.target.value)}
              aria-invalid={invalid('firstName')}
              autoComplete="off"
              maxLength={60}
            />
          </FormField>
          <FormField label="Last Name" htmlFor="lastName" required error={errors.lastName}>
            <input
              id="lastName"
              className="input"
              value={patient.lastName}
              onChange={(e) => updatePatient('lastName', e.target.value)}
              aria-invalid={invalid('lastName')}
              autoComplete="off"
              maxLength={60}
            />
          </FormField>
          <div className="split-gender-age">
            <FormField label="Gender" htmlFor="gender" required error={errors.gender}>
              <select
                id="gender"
                className="select"
                value={patient.gender}
                onChange={(e) => updatePatient('gender', e.target.value as Gender | '')}
                aria-invalid={invalid('gender')}
              >
                <option value="">Select gender</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Age"
              htmlFor="ageYears"
              required
              error={errors.dateOfBirth}
              hint={ageHint}
            >
              <div className="input-group input-group-suffix">
                <input
                  id="ageYears"
                  className="input"
                  inputMode="numeric"
                  placeholder="Years"
                  value={ageValue}
                  readOnly={exactDob}
                  onChange={(e) => setAge(e.target.value)}
                  aria-invalid={invalid('dateOfBirth')}
                />
                <span className="input-suffix">yrs</span>
              </div>
            </FormField>
          </div>
          <FormField
            label="Mobile number"
            htmlFor="mobileNumber"
            required={!form.isAcute}
            error={errors.mobileNumber}
          >
            <div className="input-group">
              <span className="input-prefix">+91</span>
              <input
                id="mobileNumber"
                className="input"
                inputMode="numeric"
                placeholder="10-digit mobile number"
                value={patient.mobileNumber}
                onChange={(e) => updatePatient('mobileNumber', digitsOnly(e.target.value, 10))}
                aria-invalid={invalid('mobileNumber')}
              />
            </div>
          </FormField>
          <FormField
            label="Address"
            htmlFor="addressLine1"
            required={!form.isAcute}
            error={errors.addressLine1}
            className="span-2"
          >
            <textarea
              id="addressLine1"
              className="textarea"
              rows={2}
              value={patient.addressLine1}
              onChange={(e) => updatePatient('addressLine1', e.target.value)}
              aria-invalid={invalid('addressLine1')}
              maxLength={250}
            />
          </FormField>

          <div className="span-2">
            <button type="button" className="btn btn-ghost" onClick={() => setShowMore((s) => !s)} aria-expanded={showMore}>
              <Icon name={showMore ? 'chevronDown' : 'plus'} size={16} />
              {showMore ? 'Hide additional details' : 'Add additional details (DOB, email, blood group, emergency contact)'}
            </button>
          </div>

          {showMore && (
            <>
              <FormField label="Middle Name" htmlFor="middleName">
                <input
                  id="middleName"
                  className="input"
                  value={patient.middleName}
                  onChange={(e) => updatePatient('middleName', e.target.value)}
                  maxLength={60}
                />
              </FormField>
              <FormField
                label="Date of birth"
                htmlFor="dateOfBirth"
                hint={
                  patient.dobEstimated
                    ? 'Estimated from age — enter the exact date if known'
                    : patient.dateOfBirth
                      ? `Age: ${ageFromDob(patient.dateOfBirth) ?? '-'} years`
                      : undefined
                }
              >
                <input
                  id="dateOfBirth"
                  type="date"
                  className="input"
                  max={new Date().toISOString().slice(0, 10)}
                  value={patient.dobEstimated ? '' : patient.dateOfBirth}
                  onChange={(e) => {
                    updatePatient('dateOfBirth', e.target.value);
                    updatePatient('dobEstimated', false);
                  }}
                />
              </FormField>
              <FormField label="Email" htmlFor="email" error={errors.email}>
                <input
                  id="email"
                  type="email"
                  className="input"
                  value={patient.email}
                  onChange={(e) => updatePatient('email', e.target.value)}
                  aria-invalid={invalid('email')}
                />
              </FormField>
              <FormField label="Blood group" htmlFor="bloodGroup">
                <select
                  id="bloodGroup"
                  className="select"
                  value={patient.bloodGroup}
                  onChange={(e) => updatePatient('bloodGroup', e.target.value as BloodGroup | '')}
                >
                  <option value="">Unknown</option>
                  {BLOOD_GROUPS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Address line 2" htmlFor="addressLine2" className="span-2">
                <input
                  id="addressLine2"
                  className="input"
                  value={patient.addressLine2}
                  onChange={(e) => updatePatient('addressLine2', e.target.value)}
                />
              </FormField>
              <FormField label="City" htmlFor="city">
                <input id="city" className="input" value={patient.city} onChange={(e) => updatePatient('city', e.target.value)} />
              </FormField>
              <FormField label="State" htmlFor="state">
                <input id="state" className="input" value={patient.state} onChange={(e) => updatePatient('state', e.target.value)} />
              </FormField>
              <FormField label="PIN code" htmlFor="postalCode" error={errors.postalCode}>
                <input
                  id="postalCode"
                  className="input"
                  inputMode="numeric"
                  value={patient.postalCode}
                  onChange={(e) => updatePatient('postalCode', digitsOnly(e.target.value, 6))}
                  aria-invalid={invalid('postalCode')}
                />
              </FormField>
              <div />
              <FormField label="Emergency contact name" htmlFor="emergencyContactName">
                <input
                  id="emergencyContactName"
                  className="input"
                  value={patient.emergencyContactName}
                  onChange={(e) => updatePatient('emergencyContactName', e.target.value)}
                />
              </FormField>
              <FormField label="Emergency contact phone" htmlFor="emergencyContactPhone" error={errors.emergencyContactPhone}>
                <div className="input-group">
                  <span className="input-prefix">+91</span>
                  <input
                    id="emergencyContactPhone"
                    className="input"
                    inputMode="numeric"
                    value={patient.emergencyContactPhone}
                    onChange={(e) => updatePatient('emergencyContactPhone', digitsOnly(e.target.value, 10))}
                    aria-invalid={invalid('emergencyContactPhone')}
                  />
                </div>
              </FormField>
            </>
          )}
        </fieldset>
    </section>
  );
}
