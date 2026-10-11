import { CharLimit } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icons';
import { doctorApi } from '../api/doctorApi';
import type { LabTestEntry } from '../types';
import type { ConsultationState } from '../hooks/useConsultation';
import { Typeahead } from './Typeahead';

/** Lab tests and investigations. Results come with the Laboratory module; for now they're printed. */
export function LabOrdersSection({ c }: { c: ConsultationState }) {
  const { form, errors, editable, addLabOrder, updateLabOrder, removeLabOrder } = c;

  return (
    <div className="lab">
      {editable && (
        <Typeahead<LabTestEntry>
          label="Add test"
          placeholder="Search tests (e.g. CBC, sugar, X-ray) or type a test and press Enter"
          search={(term, signal) => doctorApi.searchLabTests(term, signal)}
          itemKey={(t) => t.code}
          renderItem={(t) => (
            <>
              {t.name} <small>{t.category}</small>
            </>
          )}
          onPick={(t) => addLabOrder({ testCode: t.code, testName: t.name, notes: '' })}
          onFreeText={(text) => addLabOrder({ testCode: '', testName: text, notes: '' })}
          showOnFocus
        />
      )}
      {errors.labOrders && <span className="field-error">{errors.labOrders}</span>}

      {form.labOrders.length === 0 ? (
        <p className="section-empty">No tests ordered.</p>
      ) : (
        <ul className="lab-list">
          {form.labOrders.map((o, i) => (
            <li className="lab-item" key={`${o.testCode}-${o.testName}`}>
              <span className="lab-name">
                <Icon name="lab" size={16} /> {o.testName}
              </span>
              <input
                className="input"
                placeholder="Notes for the lab (optional)"
                value={o.notes}
                onChange={(e) => updateLabOrder(i, e.target.value)}
                disabled={!editable}
                aria-label={`Notes for ${o.testName}`}
                maxLength={300}
              />
              {editable && (
                <button type="button" className="icon-btn" aria-label={`Remove ${o.testName}`} onClick={() => removeLabOrder(i)}>
                  <Icon name="close" size={16} />
                </button>
              )}
              {errors[`labOrders.${i}.testName`] && <span className="field-error">{errors[`labOrders.${i}.testName`]}</span>}
              <CharLimit value={o.notes} max={300} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
