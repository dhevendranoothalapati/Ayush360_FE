import { FormField } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icons';
import { digitsOnly } from '@/shared/utils/validation';
import {
  ADMISSION_SOURCE_OPTIONS,
  BROUGHT_BY_OPTIONS,
  ICU_UNIT_OPTIONS,
  TRIAGE_OPTIONS,
  type AdmissionSource,
  type BroughtBy,
  type IcuUnit,
} from '../types';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';

/**
 * Extra front-desk details for Emergency and ICU entries:
 * arrival, who brought the patient, attendant, triage (ER), ICU unit/bed (ICU), MLC, advance deposit.
 */
export function AcuteDetailsForm({ form, disabled = false }: { form: RegistrationFormState; disabled?: boolean }) {
  const { visit, errors, updateVisit, isIcu, openVisit } = form;
  const invalid = (f: keyof typeof errors) => (errors[f] ? true : undefined);
  const mlcNumber = openVisit?.registration.mlcNumber;

  return (
    <section className={`acute-section ${isIcu ? 'acute-icu' : 'acute-er'}`} aria-labelledby="acute-title">
      <div className="section-head">
        <h2 className="card-title" id="acute-title">
          <span className="icon-badge accent-rose">
            <Icon name={isIcu ? 'nurse' : 'info'} size={20} />
          </span>
          <span>
            {isIcu ? 'ICU admission details' : 'Emergency details'}
            <span className="card-sub">
              {isIcu ? 'Unit, bed, attendant and medico-legal status' : 'Arrival, triage, attendant and medico-legal status'}
            </span>
          </span>
        </h2>
      </div>

      <fieldset className="form-grid" disabled={disabled}>
        <FormField
          label={isIcu ? 'Admission date & time' : 'Arrival date & time'}
          htmlFor="arrivalTime"
          required
          error={errors.arrivalTime}
        >
          <input
            id="arrivalTime"
            type="datetime-local"
            className="input"
            value={visit.arrivalTime}
            onChange={(e) => updateVisit('arrivalTime', e.target.value)}
            aria-invalid={invalid('arrivalTime')}
          />
        </FormField>

        {isIcu ? (
          <FormField label="Admitted from" htmlFor="admissionSource" required error={errors.admissionSource}>
            <select
              id="admissionSource"
              className="select"
              value={visit.admissionSource}
              onChange={(e) => updateVisit('admissionSource', e.target.value as AdmissionSource | '')}
              aria-invalid={invalid('admissionSource')}
            >
              <option value="">Select</option>
              {ADMISSION_SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <FormField label="Brought by" htmlFor="broughtBy" required error={errors.broughtBy}>
            <select
              id="broughtBy"
              className="select"
              value={visit.broughtBy}
              onChange={(e) => updateVisit('broughtBy', e.target.value as BroughtBy | '')}
              aria-invalid={invalid('broughtBy')}
            >
              <option value="">Select</option>
              {BROUGHT_BY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {isIcu && (
          <>
            <div className="split-two">
              <FormField label="ICU unit" htmlFor="icuUnit" required error={errors.icuUnit}>
                <select
                  id="icuUnit"
                  className="select"
                  value={visit.icuUnit}
                  onChange={(e) => updateVisit('icuUnit', e.target.value as IcuUnit | '')}
                  aria-invalid={invalid('icuUnit')}
                >
                  <option value="">Select</option>
                  {ICU_UNIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Bed no." htmlFor="bedNumber" hint="If already allotted">
                <input
                  id="bedNumber"
                  className="input"
                  placeholder="e.g. MICU-04"
                  value={visit.bedNumber}
                  onChange={(e) => updateVisit('bedNumber', e.target.value.toUpperCase())}
                  maxLength={20}
                />
              </FormField>
            </div>
            {visit.admissionSource === 'OTHER_HOSPITAL' ? (
              <FormField label="Referred from (hospital)" htmlFor="referredFrom">
                <input
                  id="referredFrom"
                  className="input"
                  value={visit.referredFrom}
                  onChange={(e) => updateVisit('referredFrom', e.target.value)}
                  maxLength={150}
                />
              </FormField>
            ) : (
              <div />
            )}
          </>
        )}

        {!isIcu && (
          <div className="field span-2">
            <span className="field-label">
              Triage colour<span className="req">*</span>
            </span>
            <div className="triage-options" role="radiogroup" aria-label="Triage colour">
              {TRIAGE_OPTIONS.map((t) => (
                <label key={t.value} className={`triage-chip triage-${t.value.toLowerCase()} ${visit.triageLevel === t.value ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="triageLevel"
                    value={t.value}
                    checked={visit.triageLevel === t.value}
                    onChange={() => updateVisit('triageLevel', t.value)}
                  />
                  <span className="triage-dot" aria-hidden="true" />
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </label>
              ))}
            </div>
            {errors.triageLevel && <span className="field-error">{errors.triageLevel}</span>}
          </div>
        )}

        <FormField
          label={isIcu ? 'Attendant / next of kin' : 'Attendant name'}
          htmlFor="attendantName"
          required={isIcu}
          error={errors.attendantName}
        >
          <input
            id="attendantName"
            className="input"
            value={visit.attendantName}
            onChange={(e) => updateVisit('attendantName', e.target.value)}
            aria-invalid={invalid('attendantName')}
            maxLength={100}
          />
        </FormField>
        <FormField label="Attendant phone" htmlFor="attendantPhone" required={isIcu} error={errors.attendantPhone}>
          <div className="input-group">
            <span className="input-prefix">+91</span>
            <input
              id="attendantPhone"
              className="input"
              inputMode="numeric"
              value={visit.attendantPhone}
              onChange={(e) => updateVisit('attendantPhone', digitsOnly(e.target.value, 10))}
              aria-invalid={invalid('attendantPhone')}
            />
          </div>
        </FormField>

        <label className="checkbox span-2 mlc-check">
          <input type="checkbox" checked={visit.isMlc} onChange={(e) => updateVisit('isMlc', e.target.checked)} />
          <span>
            <strong>Medico-legal case (MLC)</strong>
            {mlcNumber && <span className="mlc-number">{mlcNumber}</span>}
            <span className="field-hint" style={{ display: 'block' }}>
              Accident, assault, poisoning, burns, unknown cause of injury — police must be informed.
            </span>
          </span>
        </label>
        {visit.isMlc && (
          <>
            <FormField label="Police station" htmlFor="policeStation" required error={errors.policeStation}>
              <input
                id="policeStation"
                className="input"
                value={visit.policeStation}
                onChange={(e) => updateVisit('policeStation', e.target.value)}
                aria-invalid={invalid('policeStation')}
                maxLength={150}
              />
            </FormField>
            <FormField label="FIR / GD / intimation no." htmlFor="firNumber" hint="Can be added later">
              <input
                id="firNumber"
                className="input"
                value={visit.firNumber}
                onChange={(e) => updateVisit('firNumber', e.target.value.toUpperCase())}
                maxLength={50}
              />
            </FormField>
          </>
        )}

        <FormField
          label="Advance / deposit now"
          htmlFor="depositAmount"
          error={errors.depositAmount}
          hint={
            openVisit
              ? 'Collected at registration — further payments in Billing'
              : 'Optional. Charges are billed later; leave empty to collect nothing now.'
          }
        >
          <div className="input-group">
            <span className="input-prefix">₹</span>
            <input
              id="depositAmount"
              className="input"
              inputMode="numeric"
              value={visit.depositAmount}
              readOnly={openVisit !== null}
              onChange={(e) => updateVisit('depositAmount', digitsOnly(e.target.value, 7))}
              aria-invalid={invalid('depositAmount')}
            />
          </div>
        </FormField>
      </fieldset>
    </section>
  );
}
