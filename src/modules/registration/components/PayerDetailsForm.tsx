import { FormField } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icons';
import { fullName } from '@/shared/utils/format';
import { INSURER_SUGGESTIONS, RELATION_OPTIONS, type PayerType, type PolicyHolderRelation } from '../types';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';

const PAYER_CHOICES: { value: PayerType; title: string; text: string; icon: 'user' | 'lock' }[] = [
  { value: 'SELF', title: 'Self', text: 'Patient pays', icon: 'user' },
  { value: 'INSURANCE', title: 'Insurance', text: 'Insurer / TPA / scheme', icon: 'lock' },
];

/** Who pays for this visit. Insurance details appear only when Insurance is chosen. */
export function PayerDetailsForm({ form, disabled = false }: { form: RegistrationFormState; disabled?: boolean }) {
  const { visit, errors, updateVisit, patient } = form;
  const invalid = (f: keyof typeof errors) => (errors[f] ? true : undefined);
  const insured = visit.payerType === 'INSURANCE';

  function setRelation(rel: PolicyHolderRelation | '') {
    updateVisit('policyHolderRelation', rel);
    // Patient is the policy holder: fill the name for them.
    if (rel === 'SELF' && !visit.policyHolderName.trim()) updateVisit('policyHolderName', fullName(patient));
  }

  return (
    <section aria-labelledby="payer-title">
      <div className="section-head">
        <h2 className="card-title" id="payer-title">
          <span className="icon-badge accent-amber">
            <Icon name="billing" size={20} />
          </span>
          <span>
            Payer details
            <span className="card-sub">Who pays for this visit?</span>
          </span>
        </h2>
      </div>

      <fieldset className="payer-fieldset" disabled={disabled}>
        <div className="payer-choices" role="radiogroup" aria-label="Payer">
          {PAYER_CHOICES.map((c) => (
            <label key={c.value} className={`payer-choice ${visit.payerType === c.value ? 'on' : ''}`}>
              <input
                type="radio"
                name="payerType"
                value={c.value}
                checked={visit.payerType === c.value}
                onChange={() => updateVisit('payerType', c.value)}
              />
              <span className="payer-icon">
                <Icon name={c.icon} size={18} />
              </span>
              <span>
                <strong>{c.title}</strong>
                <small>{c.text}</small>
              </span>
            </label>
          ))}
        </div>

        {insured && (
          <div className="insurance-panel">
            <div className="form-grid">
              <FormField
                label="Insurer / scheme"
                htmlFor="insurerName"
                required
                error={errors.insurerName}
                hint="Choose from the list or type a name"
              >
                <input
                  id="insurerName"
                  className="input"
                  list="insurer-options"
                  autoComplete="off"
                  placeholder="e.g. Star Health Insurance"
                  value={visit.insurerName}
                  onChange={(e) => updateVisit('insurerName', e.target.value)}
                  aria-invalid={invalid('insurerName')}
                  maxLength={100}
                />
                <datalist id="insurer-options">
                  {INSURER_SUGGESTIONS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="TPA (if any)" htmlFor="tpaName">
                <input
                  id="tpaName"
                  className="input"
                  placeholder="e.g. Medi Assist"
                  value={visit.tpaName}
                  onChange={(e) => updateVisit('tpaName', e.target.value)}
                  maxLength={100}
                />
              </FormField>
              <FormField label="Policy number" htmlFor="policyNumber" required error={errors.policyNumber}>
                <input
                  id="policyNumber"
                  className="input"
                  value={visit.policyNumber}
                  onChange={(e) => updateVisit('policyNumber', e.target.value.toUpperCase())}
                  aria-invalid={invalid('policyNumber')}
                  maxLength={50}
                />
              </FormField>
              <FormField label="Member / card ID" htmlFor="memberId">
                <input
                  id="memberId"
                  className="input"
                  value={visit.memberId}
                  onChange={(e) => updateVisit('memberId', e.target.value.toUpperCase())}
                  maxLength={50}
                />
              </FormField>
              <FormField label="Policy holder name" htmlFor="policyHolderName" required error={errors.policyHolderName}>
                <input
                  id="policyHolderName"
                  className="input"
                  value={visit.policyHolderName}
                  onChange={(e) => updateVisit('policyHolderName', e.target.value)}
                  aria-invalid={invalid('policyHolderName')}
                  maxLength={100}
                />
              </FormField>
              <div className="split-two">
                <FormField
                  label="Relation to patient"
                  htmlFor="policyHolderRelation"
                  required
                  error={errors.policyHolderRelation}
                >
                  <select
                    id="policyHolderRelation"
                    className="select"
                    value={visit.policyHolderRelation}
                    onChange={(e) => setRelation(e.target.value as PolicyHolderRelation | '')}
                    aria-invalid={invalid('policyHolderRelation')}
                  >
                    <option value="">Select</option>
                    {RELATION_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Valid until" htmlFor="policyValidUntil" error={errors.policyValidUntil}>
                  <input
                    id="policyValidUntil"
                    type="date"
                    className="input"
                    value={visit.policyValidUntil}
                    onChange={(e) => updateVisit('policyValidUntil', e.target.value)}
                    aria-invalid={invalid('policyValidUntil')}
                  />
                </FormField>
              </div>
            </div>
            <p className="field-hint insurance-note">
              The OPD consultation fee is still collected at the desk. Insurance details are saved with the visit for
              claims and for inpatient admission.
            </p>
          </div>
        )}
      </fieldset>
    </section>
  );
}
