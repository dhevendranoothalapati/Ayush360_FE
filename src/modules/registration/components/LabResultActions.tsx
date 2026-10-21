import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/core/api/httpClient';
import { Icon } from '@/shared/components/Icons';
import { Modal } from '@/shared/components/Modal';
import { formatTime } from '@/shared/utils/format';
import { registrationApi } from '../api/registrationApi';
import type { FrontDeskQueueItem } from '../types';

/**
 * "⋮" on a visit awaiting lab results (OP Queue). Until the Lab module exists the front desk records:
 *   - Results expected… : what the lab said (in 30 min / 1 hr / 2 hr / at a time / tomorrow or later)
 *   - Results ready     : all tests done. Same day → the patient goes straight back into the doctor's line as
 *                         "Results review" (same token, no fee, seen right after emergencies). Another day →
 *                         only marked ready; the desk books a review when the patient comes back.
 * onChanged(message) → the parent reloads the queue and shows the message.
 */

const QUICK = [
  { label: 'In 30 min', minutes: 30 },
  { label: 'In 1 hour', minutes: 60 },
  { label: 'In 2 hours', minutes: 120 },
  { label: 'In 3 hours', minutes: 180 },
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "14:30" today → ISO. */
const timeToday = (hhmm: string) => new Date(`${todayIso()}T${hhmm}:00`).toISOString();

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function LabResultActions({
  item,
  onChanged,
}: {
  item: FrontDeskQueueItem;
  onChanged: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'expected' | 'ready' | null>(null);
  const [choice, setChoice] = useState<number | 'TIME' | 'LATER' | null>(60);
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const sameDay = item.visitDate === todayIso();
  const backInLine = sameDay && item.queueStatus === 'COMPLETED';

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function open(which: 'expected' | 'ready') {
    setMenuOpen(false);
    setError(null);
    setChoice(item.labResultsExpectedLater ? 'LATER' : 60);
    setTime('');
    setDialog(which);
  }

  async function saveExpected() {
    let at: string | null = null;
    if (typeof choice === 'number') at = new Date(Date.now() + choice * 60000).toISOString();
    if (choice === 'TIME') {
      if (!time) {
        setError('Enter the time the lab gave.');
        return;
      }
      at = timeToday(time);
    }
    setSaving(true);
    setError(null);
    try {
      await registrationApi.setLabExpected(item.visitId, at, choice === 'LATER');
      setDialog(null);
      onChanged(
        choice === 'LATER'
          ? `${item.patientName}: lab results expected tomorrow or later. Book a review when the patient comes back.`
          : `${item.patientName}: lab results expected ~${formatTime(at!)}. Ask the patient to wait at the front desk.`,
      );
    } catch (err) {
      setError(errorText(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  }

  async function markReady() {
    setSaving(true);
    setError(null);
    try {
      await registrationApi.markLabReady(item.visitId);
      setDialog(null);
      onChanged(
        backInLine
          ? `${item.tokenNumber} ${item.patientName} is back in ${item.doctorName}'s line for results review (seen right after emergencies).`
          : `${item.patientName}: lab results marked ready. Book a review with ${item.doctorName} when the patient comes back.`,
      );
    } catch (err) {
      setError(errorText(err, 'Could not mark the results ready.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fq-menu" ref={ref}>
        <button
          type="button"
          className="fq-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Lab results for ${item.tokenNumber} ${item.patientName}`}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {menuOpen && (
          <div className="fq-menu-list" role="menu">
            <button type="button" role="menuitem" onClick={() => open('expected')}>
              <Icon name="lab" size={16} /> Results expected…
            </button>
            <button type="button" role="menuitem" onClick={() => open('ready')}>
              <Icon name="check" size={16} /> Results ready
            </button>
          </div>
        )}
      </div>

      <Modal
        title="When will the lab results be ready?"
        open={dialog === 'expected'}
        onClose={() => !saving && setDialog(null)}
        closeDisabled={saving}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)} disabled={saving}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveExpected()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <p className="fq-dialog-text">
          <strong>{item.patientName}</strong> · {item.tokenNumber} with {item.doctorName}. Shown on the queue so anyone at the
          desk can tell the patient.
        </p>
        <div className="fq-reasons" role="radiogroup" aria-label="Expected">
          {QUICK.map((q) => (
            <button
              key={q.minutes}
              type="button"
              role="radio"
              aria-checked={choice === q.minutes}
              className={choice === q.minutes ? 'fq-chip on' : 'fq-chip'}
              onClick={() => setChoice(q.minutes)}
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'TIME'}
            className={choice === 'TIME' ? 'fq-chip on' : 'fq-chip'}
            onClick={() => setChoice('TIME')}
          >
            At a time…
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'LATER'}
            className={choice === 'LATER' ? 'fq-chip on' : 'fq-chip'}
            onClick={() => setChoice('LATER')}
          >
            Tomorrow or later
          </button>
        </div>
        {choice === 'TIME' && (
          <label className="field">
            <span className="field-label">Time today</span>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        )}
        {error && <div className="alert alert-error">{error}</div>}
      </Modal>

      <Modal
        title="Lab results ready"
        open={dialog === 'ready'}
        onClose={() => !saving && setDialog(null)}
        closeDisabled={saving}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)} disabled={saving}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void markReady()} disabled={saving}>
              {saving ? 'Saving…' : backInLine ? 'Ready – back to the doctor' : 'Mark ready'}
            </button>
          </>
        }
      >
        <p className="fq-dialog-text">
          <strong>{item.patientName}</strong> · {item.tokenNumber} with {item.doctorName}. All tests ordered in this visit are
          marked done.
        </p>
        <p className="fq-dialog-text">
          {backInLine
            ? `The patient goes straight back into ${item.doctorName}'s line as “Results review” with the same token and no fee, seen right after emergencies. Give the paper report to the patient for the doctor.`
            : `Not today's visit${item.queueStatus === 'ADMISSION_REQUESTED' ? ' (or admission requested)' : ''}: it's only marked ready. When the patient comes back, book a review with ${item.doctorName} on the Registration screen.`}
        </p>
        {error && <div className="alert alert-error">{error}</div>}
      </Modal>
    </>
  );
}
