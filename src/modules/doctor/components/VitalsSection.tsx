import type { Vitals } from '../types';
import type { ConsultationState } from '../hooks/useConsultation';

const FIELDS: { key: keyof Vitals; label: string; unit: string; decimals: boolean }[] = [
  { key: 'temperatureF', label: 'Temp', unit: '°F', decimals: true },
  { key: 'pulse', label: 'Pulse', unit: '/min', decimals: false },
  { key: 'systolicBp', label: 'BP systolic', unit: 'mmHg', decimals: false },
  { key: 'diastolicBp', label: 'BP diastolic', unit: 'mmHg', decimals: false },
  { key: 'respiratoryRate', label: 'Resp. rate', unit: '/min', decimals: false },
  { key: 'spo2', label: 'SpO₂', unit: '%', decimals: false },
  { key: 'weightKg', label: 'Weight', unit: 'kg', decimals: true },
  { key: 'heightCm', label: 'Height', unit: 'cm', decimals: true },
];

/** Keep only digits (and one dot for decimal fields). */
function clean(value: string, decimals: boolean): string {
  const v = value.replace(decimals ? /[^\d.]/g : /\D/g, '');
  if (!decimals) return v.slice(0, 3);
  const [whole, ...rest] = v.split('.');
  return rest.length ? `${whole.slice(0, 3)}.${rest.join('').slice(0, 1)}` : whole.slice(0, 3);
}

export function bmiOf(weightKg: string, heightCm: string): string | null {
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!w || !h) return null;
  return (w / (h * h)).toFixed(1);
}

export function VitalsSection({ c }: { c: ConsultationState }) {
  const { form, errors, updateVital } = c;
  const bmi = bmiOf(form.vitals.weightKg, form.vitals.heightCm);

  return (
    <div className="vitals-grid">
      {FIELDS.map((f) => {
        const id = `vital-${f.key}`;
        const error = errors[`vitals.${f.key}`];
        return (
          <div className="vital" key={f.key}>
            <label htmlFor={id}>{f.label}</label>
            <div className="input-group input-group-suffix">
              <input
                id={id}
                className="input"
                inputMode={f.decimals ? 'decimal' : 'numeric'}
                value={form.vitals[f.key]}
                onChange={(e) => updateVital(f.key, clean(e.target.value, f.decimals))}
                aria-invalid={error ? true : undefined}
              />
              <span className="input-suffix">{f.unit}</span>
            </div>
            {error && <span className="field-error">{error}</span>}
          </div>
        );
      })}
      <div className="vital vital-bmi">
        <span className="vital-bmi-label">BMI</span>
        <strong>{bmi ?? '–'}</strong>
      </div>
    </div>
  );
}
