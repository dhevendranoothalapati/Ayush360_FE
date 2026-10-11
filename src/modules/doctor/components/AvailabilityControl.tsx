import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/core/api/httpClient';
import { Icon } from '@/shared/components/Icons';
import { Modal } from '@/shared/components/Modal';
import { AVAILABLE, AWAY_REASONS, awayLabel, type AwayReason, type DoctorAvailability } from '@/shared/utils/doctorAvailability';
import { formatTime } from '@/shared/utils/format';
import { doctorApi } from '../api/doctorApi';

const BACK_IN: { value: string; label: string }[] = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1½ hours' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '', label: 'Not sure' },
];

const NOTE_MAX = 200;

/**
 * "Pause patients" for the doctor: pick a reason (In OT, emergency call, ward rounds, lunch...) and when you'll be
 * back. The front desk sees it on the Patient queue and can tell waiting patients. "I'm back" (or starting the next
 * consultation) ends it. Pass `reloadKey` to re-read the status (e.g. after the queue refreshes).
 */
export function AvailabilityControl({ reloadKey }: { reloadKey?: unknown }) {
  const [status, setStatus] = useState<DoctorAvailability | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AwayReason | ''>('');
  const [backIn, setBackIn] = useState('30');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setStatus(await doctorApi.getAvailability());
    } catch {
      /* the queue shows connection problems; keep the last known status */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  function openDialog() {
    setReason('');
    setBackIn('30');
    setNote('');
    setError(null);
    setErrors({});
    setOpen(true);
  }

  async function pause() {
    const e: Record<string, string> = {};
    if (!reason) e.reason = 'Choose a reason';
    if (reason === 'OTHER' && !note.trim()) e.note = 'Say where you are';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setError(null);
    try {
      setStatus(await doctorApi.goAway({ reason, note: note.trim(), expectedBackMinutes: backIn ? Number(backIn) : null }));
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your status.');
      if (err instanceof ApiError && err.details && typeof err.details === 'object' && 'errors' in err.details) {
        setErrors((err.details as { errors: Record<string, string> }).errors ?? {});
      }
    } finally {
      setSaving(false);
    }
  }

  async function back() {
    setSaving(true);
    try {
      setStatus(await doctorApi.back());
    } catch {
      setStatus((s) => s ?? AVAILABLE);
    } finally {
      setSaving(false);
    }
  }

  if (!status) return null;

  const overdue = status.expectedBackAt && new Date(status.expectedBackAt).getTime() < Date.now();

  return (
    <>
      {status.isAway ? (
        <div className="away-banner" role="status">
          <span className="away-icon">
            <Icon name="lock" size={20} />
          </span>
          <div className="away-text">
            <strong>
              Paused: {awayLabel(status.reason)}
              {status.note ? ` · ${status.note}` : ''}
            </strong>
            <small>
              Since {status.since ? formatTime(status.since) : '-'}
              {status.expectedBackAt
                ? ` · ${overdue ? 'was expected back' : 'back by'} ${formatTime(status.expectedBackAt)}`
                : ' · return time not given'}
              {' · '}the front desk can see this
            </small>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void back()} disabled={saving}>
            {saving ? 'Updating…' : 'I’m back'}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary avail-btn" onClick={openDialog}>
          <span className="avail-dot" aria-hidden="true" /> Available · Pause patients
        </button>
      )}

      <Modal
        title="Pause seeing patients"
        open={open}
        onClose={() => !saving && setOpen(false)}
        closeDisabled={saving}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void pause()} disabled={saving}>
              {saving ? 'Saving…' : 'Pause'}
            </button>
          </>
        }
      >
        <p className="avail-help">The front desk will see why you are away and tell waiting patients.</p>
        <div className="field">
          <span className="field-label">Reason</span>
          <div className="avail-reasons" role="radiogroup" aria-label="Reason">
            {AWAY_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={reason === r.value}
                className={reason === r.value ? 'chip on' : 'chip'}
                onClick={() => {
                  setReason(r.value);
                  setErrors((x) => ({ ...x, reason: '' }));
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          {errors.reason && <span className="field-error">{errors.reason}</span>}
        </div>
        <div className="field">
          <span className="field-label">Back in</span>
          <div className="avail-reasons" role="radiogroup" aria-label="Back in">
            {BACK_IN.map((b) => (
              <button
                key={b.label}
                type="button"
                role="radio"
                aria-checked={backIn === b.value}
                className={backIn === b.value ? 'chip on' : 'chip'}
                onClick={() => setBackIn(b.value)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">
            Note {reason === 'OTHER' ? '(required)' : '(optional)'}
          </span>
          <input
            className="input"
            value={note}
            maxLength={NOTE_MAX}
            placeholder="e.g. OT 2, appendectomy"
            onChange={(e) => {
              setNote(e.target.value);
              setErrors((x) => ({ ...x, note: '' }));
            }}
            aria-invalid={Boolean(errors.note)}
          />
          {errors.note ? (
            <span className="field-error">{errors.note}</span>
          ) : note.length >= NOTE_MAX * 0.8 ? (
            <span className="field-hint">
              {note.length}/{NOTE_MAX}
            </span>
          ) : null}
        </label>
        {error && <div className="alert alert-error">{error}</div>}
      </Modal>
    </>
  );
}
