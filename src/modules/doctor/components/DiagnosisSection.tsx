import { useHasPermission } from '@/core/permissions/usePermission';
import { Permissions } from '@/core/permissions/permissions';
import { Icon } from '@/shared/components/Icons';
import { doctorApi } from '../api/doctorApi';
import type { Icd10Entry } from '../types';
import type { ConsultationState } from '../hooks/useConsultation';
import { Typeahead } from './Typeahead';

/** Diagnoses: pick ICD-10 or type freely. One is primary (used in reports and claims). */
export function DiagnosisSection({ c }: { c: ConsultationState }) {
  const { form, errors, editable, addDiagnosis, removeDiagnosis, setPrimaryDiagnosis, suggestPrescriptionFor } = c;
  const canPrescribe = useHasPermission(Permissions.PRESCRIPTION_CREATE);

  function add(dx: { icd10Code: string; description: string }) {
    const isNew = !form.diagnoses.some((x) => (dx.icd10Code && x.icd10Code === dx.icd10Code) || x.description === dx.description);
    addDiagnosis(dx);
    // Pre-fill what this doctor usually prescribes for it (reviewable before saving).
    if (isNew && canPrescribe) void suggestPrescriptionFor(dx);
  }

  return (
    <div className="dx">
      {editable && (
        <Typeahead<Icd10Entry>
          label="Add diagnosis"
          placeholder="Search ICD-10 (e.g. fever, J06) or type a diagnosis and press Enter"
          search={(term, signal) => doctorApi.searchIcd10(term, signal)}
          itemKey={(d) => d.code}
          renderItem={(d) => (
            <>
              <span className="code">{d.code}</span> {d.description}
            </>
          )}
          onPick={(d) => add({ icd10Code: d.code, description: d.description })}
          onFreeText={(text) => add({ icd10Code: '', description: text })}
          freeTextHint="(no ICD code)"
        />
      )}
      {errors.diagnoses && <span className="field-error">{errors.diagnoses}</span>}

      {form.diagnoses.length === 0 ? (
        <p className="section-empty">No diagnosis added yet.</p>
      ) : (
        <ul className="dx-list">
          {form.diagnoses.map((d, i) => (
            <li key={`${d.icd10Code}-${d.description}`} className={d.isPrimary ? 'dx-item primary' : 'dx-item'}>
              <span className={d.icd10Code ? 'code' : 'code code-free'}>{d.icd10Code || 'Free text'}</span>
              <span className="dx-text">{d.description}</span>
              {editable ? (
                <label className="dx-primary">
                  <input type="radio" name="primary-dx" checked={d.isPrimary} onChange={() => setPrimaryDiagnosis(i)} />
                  Primary
                </label>
              ) : (
                d.isPrimary && <span className="dx-primary-tag">Primary</span>
              )}
              {editable && (
                <button type="button" className="icon-btn" aria-label={`Remove ${d.description}`} onClick={() => removeDiagnosis(i)}>
                  <Icon name="close" size={16} />
                </button>
              )}
              {errors[`diagnoses.${i}.description`] && (
                <span className="field-error">{errors[`diagnoses.${i}.description`]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
