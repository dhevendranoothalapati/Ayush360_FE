import { FormField } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icons';
import { doctorApi } from '../api/doctorApi';
import { FREQUENCY_OPTIONS, TIMING_OPTIONS, type Medicine, type MedicineTiming } from '../types';
import type { ConsultationState, PrescriptionForm } from '../hooks/useConsultation';
import { Typeahead } from './Typeahead';

const ONE_DOSE = ['SOS', 'STAT'];

function newLine(name: string, m?: Medicine): PrescriptionForm {
  return {
    medicineId: m?.id ?? null,
    medicineName: m?.name ?? name,
    strength: m?.strength ?? '',
    form: m?.form ?? '',
    dose: m?.defaultDose ?? '',
    frequency: m?.defaultFrequency ?? '1-0-1',
    timing: 'AFTER_FOOD',
    durationDays: m?.defaultFrequency && ONE_DOSE.includes(m.defaultFrequency) ? '' : '5',
    instructions: '',
  };
}

/** Medicines: pick from the hospital list (fills strength, dose, frequency) or type any name. */
export function PrescriptionSection({ c }: { c: ConsultationState }) {
  const { form, errors, editable, addPrescription, updatePrescription, removePrescription, suggestion } = c;
  const err = (i: number, field: string) => errors[`prescriptions.${i}.${field}`];

  return (
    <div className="rx">
      {editable && (
        <Typeahead<Medicine>
          label="Add medicine"
          placeholder="Search medicine (e.g. paracetamol) or type a name and press Enter"
          search={(term, signal) => doctorApi.searchMedicines(term, signal)}
          itemKey={(m) => String(m.id)}
          renderItem={(m) => (
            <>
              <strong>{m.name}</strong> {m.strength} <small>{m.form}{m.genericName && m.genericName !== m.name ? ` · ${m.genericName}` : ''}</small>
            </>
          )}
          onPick={(m) => addPrescription(newLine(m.name, m))}
          onFreeText={(text) => addPrescription(newLine(text))}
          freeTextHint="(not in list)"
        />
      )}
      {errors.prescriptions && <span className="field-error">{errors.prescriptions}</span>}

      {editable && suggestion && form.prescriptions.some((p) => p.suggestedFor) && (
        <div className="rx-suggest" role="status">
          <Icon name="info" size={18} />
          <span>
            Added {suggestion.count} medicine{suggestion.count === 1 ? '' : 's'} you prescribed for <b>{suggestion.diagnosis}</b>
            {suggestion.lastUsedAt ? ` on ${new Date(suggestion.lastUsedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
            Please review doses before completing.
          </span>
          <span className="rx-suggest-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={c.removeSuggested}>
              Remove them
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={c.dismissSuggestion}>
              OK
            </button>
          </span>
        </div>
      )}

      {form.prescriptions.length === 0 ? (
        <p className="section-empty">No medicines prescribed.</p>
      ) : (
        <ol className="rx-list">
          {form.prescriptions.map((p, i) => (
            <li className={p.suggestedFor ? 'rx-item rx-suggested' : 'rx-item'} key={i}>
              <div className="rx-head">
                <span className="rx-no">{i + 1}</span>
                <span className="rx-name">
                  <strong>{p.medicineName}</strong> {p.strength} <small>{p.form}</small>
                  {p.suggestedFor && <span className="tag tag-suggested">Suggested · review</span>}
                </span>
                {editable && (
                  <button type="button" className="icon-btn" aria-label={`Remove ${p.medicineName}`} onClick={() => removePrescription(i)}>
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
              {err(i, 'medicineName') && <span className="field-error">{err(i, 'medicineName')}</span>}
              <fieldset className="rx-fields" disabled={!editable}>
                <FormField label="Dose" htmlFor={`rx-dose-${i}`}>
                  <input
                    id={`rx-dose-${i}`}
                    className="input"
                    placeholder="1 tablet"
                    value={p.dose}
                    onChange={(e) => updatePrescription(i, 'dose', e.target.value)}
                    maxLength={60}
                  />
                </FormField>
                <FormField label="Frequency" htmlFor={`rx-freq-${i}`} error={err(i, 'frequency')}>
                  <input
                    id={`rx-freq-${i}`}
                    className="input"
                    list="rx-frequencies"
                    value={p.frequency}
                    onChange={(e) => updatePrescription(i, 'frequency', e.target.value)}
                    aria-invalid={err(i, 'frequency') ? true : undefined}
                    maxLength={30}
                  />
                </FormField>
                <div className="field">
                  <label className="field-label" htmlFor={`rx-timing-${i}`}>When</label>
                  <select
                    id={`rx-timing-${i}`}
                    className="select"
                    value={p.timing}
                    onChange={(e) => updatePrescription(i, 'timing', e.target.value as MedicineTiming | '')}
                  >
                    <option value="">—</option>
                    {TIMING_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`rx-days-${i}`}>Days</label>
                  <input
                    id={`rx-days-${i}`}
                    className="input"
                    inputMode="numeric"
                    value={p.durationDays}
                    onChange={(e) => updatePrescription(i, 'durationDays', e.target.value.replace(/\D/g, '').slice(0, 3))}
                    aria-invalid={err(i, 'durationDays') ? true : undefined}
                  />
                  {err(i, 'durationDays') && <span className="field-error">{err(i, 'durationDays')}</span>}
                </div>
                <FormField label="Instructions" htmlFor={`rx-note-${i}`} className="rx-instructions">
                  <input
                    id={`rx-note-${i}`}
                    className="input"
                    placeholder="Optional"
                    value={p.instructions}
                    onChange={(e) => updatePrescription(i, 'instructions', e.target.value)}
                    maxLength={300}
                  />
                </FormField>
              </fieldset>
            </li>
          ))}
        </ol>
      )}
      <datalist id="rx-frequencies">
        {FREQUENCY_OPTIONS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </div>
  );
}
