import { Icon } from '@/shared/components/Icons';
import { QUEUE_STATUS_LABEL, type Registration } from '../types';
import type { RegistrationFormState } from '../hooks/useRegistrationForm';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** Why a visit of today can't be edited any more (seen by the doctor, admitted...). */
function closedLabel(r: Registration): string {
  return r.queueStatus === 'WAITING' ? 'Completed' : QUEUE_STATUS_LABEL[r.queueStatus];
}

/**
 * All of today's visits for the selected patient (e.g. ENT and General Medicine), plus "New visit".
 * Open ones (still waiting) can be picked and edited. Ones the doctor has already seen are shown greyed out with
 * their status: they are read-only (details are in Visit history), but the desk should still see them.
 */
export function VisitSwitcher({ form }: { form: RegistrationFormState }) {
  const { selectedPatient, openVisits, openVisit, selectOpenVisit, startNewVisit, saving, visitHistory } = form;
  const openIds = new Set(openVisits.map((v) => v.registration.id));
  const closedToday = visitHistory.filter(
    (r) => !openIds.has(r.id) && r.visitStatus !== 'CANCELLED' && isToday(r.registrationDate),
  );
  if (!selectedPatient || openVisits.length + closedToday.length === 0) return null;

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
      {closedToday.map((r) => (
        <span
          key={r.id}
          className="vs-chip vs-closed"
          title="Already seen by the doctor: read-only. Full details are in Visit history."
        >
          <strong>{r.tokenNumber}</strong>
          <span>
            {r.departmentName} · {r.doctorName}
          </span>
          <em className="vs-status">{closedLabel(r)}</em>
        </span>
      ))}
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
