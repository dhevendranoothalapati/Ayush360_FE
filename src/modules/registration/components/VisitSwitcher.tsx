import { Icon } from '@/shared/components/Icons';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';

/**
 * Today's open visits for the selected patient (e.g. ENT and General Medicine),
 * plus "New visit". Picking one loads it into the visit form for editing.
 */
export function VisitSwitcher({ form }: { form: RegistrationFormState }) {
  const { selectedPatient, openVisits, openVisit, selectOpenVisit, startNewVisit, saving } = form;
  if (!selectedPatient || openVisits.length === 0) return null;

  return (
    <div className="visit-switcher" role="tablist" aria-label="Today's visits">
      <span className="vs-label">Today's visits</span>
      {openVisits.map((v) => {
        const r = v.registration;
        const active = openVisit?.registration.id === r.id;
        return (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`vs-chip ${active ? 'on' : ''}`}
            onClick={() => selectOpenVisit(r.id)}
            disabled={saving}
          >
            <strong>{r.tokenNumber}</strong>
            <span>
              {r.departmentName} · {r.doctorName}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        role="tab"
        aria-selected={openVisit === null}
        className={`vs-chip vs-new ${openVisit === null ? 'on' : ''}`}
        onClick={startNewVisit}
        disabled={saving}
      >
        <Icon name="plus" size={16} />
        <span>New visit</span>
      </button>
    </div>
  );
}
