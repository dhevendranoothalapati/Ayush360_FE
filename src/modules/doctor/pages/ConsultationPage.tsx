import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useHasPermission } from '@/core/permissions/usePermission';
import { Permissions } from '@/core/permissions/permissions';
import { CharLimit, FormField } from '@/shared/components/FormField';
import { Icon, type IconName } from '@/shared/components/Icons';
import { PageLoader } from '@/shared/components/PageLoader';
import { formatDateTime, formatMobile, formatTime } from '@/shared/utils/format';
import { useConsultation, type ConsultationState } from '../hooks/useConsultation';
import { VitalsSection } from '../components/VitalsSection';
import { DiagnosisSection } from '../components/DiagnosisSection';
import { PrescriptionSection } from '../components/PrescriptionSection';
import { LabOrdersSection } from '../components/LabOrdersSection';
import { PrescriptionPrint } from '../components/PrescriptionPrint';
import {
  ADMISSION_TYPE_OPTIONS,
  GENDER_SHORT,
  LAB_STATUS_LABEL,
  QUEUE_STATUS_LABEL,
  labStatusOf,
  type AdmissionType,
} from '../types';
import '../doctor.css';

function Section({ icon, title, sub, children }: { icon: IconName; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="card cx-section">
      <h2 className="card-title">
        <span className="icon-badge accent-teal">
          <Icon name={icon} size={20} />
        </span>
        <span>
          {title}
          {sub && <span className="card-sub">{sub}</span>}
        </span>
      </h2>
      {children}
    </section>
  );
}

function todayIso(): string {
  return addDays(0);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FOLLOW_UP_CHOICES = [
  { label: '3 days', days: 3 },
  { label: '5 days', days: 5 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

/** One patient's consultation: notes, vitals, diagnosis, prescription, tests, advice, admission. */
export default function ConsultationPage() {
  const { visitId } = useParams();
  const c = useConsultation(Number(visitId));
  const canPrescribe = useHasPermission(Permissions.PRESCRIPTION_CREATE);
  const navigate = useNavigate();
  const location = useLocation();

  // Opened from the queue by clicking a waiting patient: start the consultation straight away (one click).
  const autoStart = (location.state as { autoStart?: boolean } | null)?.autoStart === true;
  const autoStarted = useRef(false);
  const { data: loaded, busy, start } = c;
  useEffect(() => {
    if (!autoStart || autoStarted.current || !loaded?.canStart || busy) return;
    autoStarted.current = true;
    void start();
    // Forget the request so a page refresh doesn't try again.
    navigate(location.pathname, { replace: true, state: null });
  }, [autoStart, loaded, busy, start, navigate, location.pathname]);

  if (c.loading && !c.data) return <PageLoader label="Loading patient…" />;
  if (!c.data) {
    return (
      <div className="doctor-page">
        <div className="alert alert-error">{c.loadError ?? 'Visit not found.'}</div>
        <Link to="/doctor" className="btn btn-secondary">
          Back to my queue
        </Link>
      </div>
    );
  }

  const { data, form, errors, editable } = c;
  const { patient, visit, encounter } = data;
  const completed = encounter?.status === 'COMPLETED';
  /** Back with lab results: the completed consultation is reopened for review. */
  const reviewWaiting = completed && data.canStart; // in the line, not opened yet
  const reviewing = completed && visit.queueStatus === 'IN_CONSULTATION';
  // Saved tests only (what the lab actually received).
  const labStatus = labStatusOf(visit.queueStatus, encounter?.labOrders ?? []);
  const pendingTests = (encounter?.labOrders ?? []).filter((o) => o.status === 'ORDERED' || o.status === 'SAMPLE_COLLECTED');

  /** No confirmation step: complete, then show the result in the banner (or jump to what needs fixing). */
  async function complete() {
    const ok = await c.complete();
    if (ok) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.setTimeout(
      () => document.querySelector('.cx-main .field-error, .alert-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      0,
    );
  }

  return (
    <div className="doctor-page consultation-page">
      <Link to="/doctor" className="back-link">
        ← My queue
      </Link>

      {/* ---------------- patient banner ---------------- */}
      <section className="patient-banner card">
        <div className="pb-token">
          <span>Token</span>
          <strong>{visit.tokenNumber}</strong>
        </div>
        <div className="pb-main">
          <h1>
            {patient.name}
            <small>
              {patient.ageYears ?? '-'} yrs / {GENDER_SHORT[patient.gender] ?? '-'}
              {patient.bloodGroup ? ` · ${patient.bloodGroup}` : ''}
            </small>
          </h1>
          <div className="pb-meta">
            <span>{patient.patientNumber}</span>
            <span>{visit.visitNumber}</span>
            {patient.mobileNumber && <span>{formatMobile(patient.mobileNumber)}</span>}
            <span>{visit.departmentName}</span>
            <span>{visit.payerType === 'INSURANCE' ? `Insurance · ${visit.insurerName}` : 'Self pay'}</span>
          </div>
          <div className="pb-tags">
            {labStatus ? (
              <span className={`status-pill pill-${labStatus.toLowerCase()}`}>{LAB_STATUS_LABEL[labStatus]}</span>
            ) : (
              <span className={`status-pill pill-${visit.queueStatus.toLowerCase()}`}>{QUEUE_STATUS_LABEL[visit.queueStatus]}</span>
            )}
            {visit.registrationType === 'EMERGENCY' && (
              <span className={`tag tag-triage-${visit.triageLevel.toLowerCase() || 'none'}`}>
                Emergency{visit.triageLevel ? ` · ${visit.triageLevel}` : ''}
              </span>
            )}
            {visit.registrationType === 'ICU' && <span className="tag tag-icu">ICU</span>}
            {visit.isFollowUp && <span className="tag tag-follow">Free follow-up</span>}
            {form.allergies && <span className="tag tag-allergy">Allergy: {form.allergies}</span>}
          </div>
          {visit.visitDate !== todayIso() && (
            <p className="pb-past">Past visit · {formatDateTime(visit.registeredAt)}</p>
          )}
          {visit.reasonForVisit && (
            <p className="pb-reason">
              <b>At the desk:</b> {visit.reasonForVisit}
            </p>
          )}
        </div>
        <div className="pb-actions">
          {encounter && (
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              <Icon name="printer" size={18} /> Print prescription
            </button>
          )}
        </div>
      </section>

      {c.formError && <div className="alert alert-error" role="alert">{c.formError}</div>}

      {(reviewWaiting || reviewing) && (
        <div className="alert alert-info cx-review" role="status">
          <Icon name="lab" size={18} />
          <span>
            <strong>Lab results review.</strong> {patient.name.split(' ')[0]} is back with the results (paper report). Review
            them, update the diagnosis or prescription if needed (kept as an edit of this consultation), then{' '}
            <b>Complete review</b>.
          </span>
          {reviewWaiting && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void c.start()} disabled={c.busy !== null}>
              {c.busy === 'start' ? 'Opening…' : 'Start review'}
            </button>
          )}
        </div>
      )}

      {completed && !reviewing && !reviewWaiting && (
        <div className="alert alert-success cx-done" role="status">
          <Icon name="check" size={18} />
          <span>
            Consultation completed
            {encounter?.completedAt ? ` at ${formatDateTime(encounter.completedAt)}` : ''}
            {visit.queueStatus === 'ADMISSION_REQUESTED' ? ' · Admission requested (front desk will arrange the bed)' : ''}
            {labStatus === 'AWAITING_RESULTS'
              ? ` · Awaiting lab results: ${pendingTests.map((o) => o.testName).join(', ')}`
              : labStatus === 'RESULTS_READY'
                ? ' · Lab results are ready for review'
                : ''}
            .{' '}
            {editable ? 'You can still correct it until midnight today.' : 'It can no longer be changed.'}
            {encounter?.lastEditedAt && (
              <small className="cx-edited">
                Last edited by {encounter.lastEditedBy || 'the doctor'} at {formatDateTime(encounter.lastEditedAt)}
              </small>
            )}
          </span>
        </div>
      )}

      <div className="cx-grid">
        <div className="cx-main">
      {!encounter && (
        <section className="card start-card">
          {data.canStart ? (
            <>
              <div>
                <h2>Ready to see {patient.name.split(' ')[0]}?</h2>
                <p>Starting moves the patient to “In consultation”. The front desk can then no longer change this visit.</p>
              </div>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => void c.start()} disabled={c.busy !== null}>
                <Icon name="stethoscope" size={20} /> {c.busy === 'start' ? 'Starting…' : 'Start consultation'}
              </button>
            </>
          ) : (
            <p className="section-empty">
              {visit.queueStatus === 'WAITING'
                ? `Waiting for ${data.doctor.name}. Only the consulting doctor can start this consultation.`
                : 'No consultation was recorded for this visit.'}
            </p>
          )}
        </section>
      )}

      {encounter && (
          <>
            <Section icon="nurse" title="Vitals" sub="Optional">
              <fieldset className="cx-fieldset" disabled={!editable}>
                <VitalsSection c={c} />
              </fieldset>
            </Section>

            <Section icon="edit" title="Complaints and history">
              <fieldset className="cx-fieldset form-grid" disabled={!editable}>
                <FormField label="Chief complaints" htmlFor="chiefComplaints" required error={errors.chiefComplaints} className="span-2">
                  <textarea
                    id="chiefComplaints"
                    className="textarea"
                    rows={2}
                    value={form.chiefComplaints}
                    onChange={(e) => c.update('chiefComplaints', e.target.value)}
                    maxLength={2000}
                    aria-invalid={errors.chiefComplaints ? true : undefined}
                    placeholder="e.g. Fever for 3 days, dry cough, body ache"
                  />
                </FormField>
                <FormField label="History of present illness" htmlFor="history" error={errors.history} className="span-2">
                  <textarea
                    id="history"
                    className="textarea"
                    rows={2}
                    value={form.history}
                    onChange={(e) => c.update('history', e.target.value)}
                    maxLength={4000}
                  />
                </FormField>
                <FormField label="Past history / current medicines" htmlFor="pastHistory" error={errors.pastHistory}>
                  <textarea
                    id="pastHistory"
                    className="textarea"
                    rows={2}
                    value={form.pastHistory}
                    onChange={(e) => c.update('pastHistory', e.target.value)}
                    maxLength={2000}
                    placeholder="e.g. Diabetic on metformin, hypertension"
                  />
                </FormField>
                <FormField label="Allergies" htmlFor="allergies" error={errors.allergies} hint="Carried forward to future visits">
                  <textarea
                    id="allergies"
                    className="textarea"
                    rows={2}
                    value={form.allergies}
                    onChange={(e) => c.update('allergies', e.target.value)}
                    maxLength={500}
                    placeholder="e.g. Penicillin, sulfa drugs — or NKDA"
                  />
                </FormField>
              </fieldset>
            </Section>

            <Section icon="search" title="Examination">
              <fieldset className="cx-fieldset" disabled={!editable}>
                <textarea
                  className="textarea"
                  rows={3}
                  aria-label="Examination findings"
                  value={form.examination}
                  onChange={(e) => c.update('examination', e.target.value)}
                  placeholder="General and systemic examination findings"
                  maxLength={4000}
                />
                {errors.examination ? (
                  <span className="field-error">{errors.examination}</span>
                ) : (
                  <CharLimit value={form.examination} max={4000} />
                )}
              </fieldset>
            </Section>

            <Section icon="info" title="Diagnosis" sub="ICD-10 or free text · at least one to complete">
              <DiagnosisSection c={c} />
            </Section>

            {(canPrescribe || form.prescriptions.length > 0) && (
              <Section icon="pharmacy" title="Prescription">
                <PrescriptionSection c={{ ...c, editable: editable && canPrescribe } as ConsultationState} />
              </Section>
            )}

            <Section icon="lab" title="Lab tests and investigations">
              <LabOrdersSection c={c} />
            </Section>

            <Section icon="calendar" title="Advice and follow-up">
              <fieldset className="cx-fieldset form-grid" disabled={!editable}>
                <FormField label="Advice" htmlFor="advice" error={errors.advice} className="span-2">
                  <textarea
                    id="advice"
                    className="textarea"
                    rows={2}
                    value={form.advice}
                    onChange={(e) => c.update('advice', e.target.value)}
                    maxLength={2000}
                    placeholder="e.g. Plenty of fluids, rest; come back if fever persists beyond 3 days"
                  />
                </FormField>
                <FormField label="Review on" htmlFor="followUpDate" error={errors.followUpDate} className="span-2">
                  <div className="followup-row">
                    <input
                      id="followUpDate"
                      type="date"
                      className="input"
                      min={addDays(1)}
                      value={form.followUpDate}
                      onChange={(e) => c.update('followUpDate', e.target.value)}
                    />
                    {editable &&
                      FOLLOW_UP_CHOICES.map((f) => (
                        <button
                          key={f.days}
                          type="button"
                          className={form.followUpDate === addDays(f.days) ? 'chip on' : 'chip'}
                          onClick={() => c.update('followUpDate', addDays(f.days))}
                        >
                          {f.label}
                        </button>
                      ))}
                    {editable && form.followUpDate && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => c.update('followUpDate', '')}>
                        Clear
                      </button>
                    )}
                  </div>
                </FormField>
              </fieldset>
            </Section>

            <Section icon="discharge" title="Admission">
              <fieldset className="cx-fieldset" disabled={!editable}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.admissionRequested}
                    onChange={(e) => c.update('admissionRequested', e.target.checked)}
                  />
                  <span>
                    Request admission
                    <small className="field-hint"> The front desk sees “Admission requested” and arranges the bed.</small>
                  </span>
                </label>
                {form.admissionRequested && (
                  <div className="form-grid admission-grid">
                    <FormField label="Admit to" htmlFor="admissionType" required error={errors.admissionType}>
                      <select
                        id="admissionType"
                        className="select"
                        value={form.admissionType}
                        onChange={(e) => c.update('admissionType', e.target.value as AdmissionType | '')}
                        aria-invalid={errors.admissionType ? true : undefined}
                      >
                        <option value="">Select</option>
                        {ADMISSION_TYPE_OPTIONS.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Reason" htmlFor="admissionReason" required error={errors.admissionReason}>
                      <input
                        id="admissionReason"
                        className="input"
                        value={form.admissionReason}
                        onChange={(e) => c.update('admissionReason', e.target.value)}
                        aria-invalid={errors.admissionReason ? true : undefined}
                        maxLength={1000}
                      />
                    </FormField>
                  </div>
                )}
              </fieldset>
            </Section>
          </>
      )}
        </div>

          <aside className="cx-side">
            {encounter && (
            <section className="card side-card">
              <h2 className="card-title">Visit timeline</h2>
              <ol className="timeline">
                <li>
                  <span>Registered</span>
                  <strong>{formatTime(visit.registeredAt)}</strong>
                </li>
                <li>
                  <span>Consultation started</span>
                  <strong>{formatTime(encounter.startedAt)}</strong>
                </li>
                <li className={completed ? '' : 'pending'}>
                  <span>Completed</span>
                  <strong>{encounter.completedAt ? formatTime(encounter.completedAt) : '—'}</strong>
                </li>
                {encounter.lastEditedAt && (
                  <li>
                    <span>Last edited</span>
                    <strong>{formatTime(encounter.lastEditedAt)}</strong>
                  </li>
                )}
              </ol>
            </section>
            )}

            <section className="card side-card">
              <h2 className="card-title">Past visits</h2>
              {data.history.length === 0 ? (
                <p className="section-empty">No earlier visits at this hospital.</p>
              ) : (
                <ul className="history-list">
                  {data.history.map((h) => (
                    <li key={h.visitId}>
                      <button type="button" onClick={() => navigate(`/doctor/visits/${h.visitId}`)}>
                        <span className="h-date">
                          {formatDateTime(h.date)} · {h.visitNumber}
                        </span>
                        <strong>
                          {h.diagnoses || (h.reasonForVisit ? `At desk: ${h.reasonForVisit}` : 'No diagnosis recorded')}
                        </strong>
                        <small>
                          {h.doctorName} · {h.departmentName}
                        </small>
                        <span className="h-tags">
                          {h.registrationType !== 'OP' && <span className="tag tag-icu">{h.registrationType}</span>}
                          {h.consultationStatus === '' && <span className="tag">No consultation recorded</span>}
                          {h.consultationStatus === 'IN_PROGRESS' && <span className="tag">In progress</span>}
                          {h.medicineCount > 0 && (
                            <span className="tag">
                              {h.medicineCount} medicine{h.medicineCount === 1 ? '' : 's'}
                            </span>
                          )}
                          {h.testCount > 0 && (
                            <span className="tag">
                              {h.testCount} test{h.testCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>

      {encounter && editable && (
        <div className="cx-actions">
          <span className="cx-save-state">
            {c.dirty ? 'Unsaved changes' : c.savedAt ? `Saved at ${formatTime(c.savedAt)}` : 'No changes'}
          </span>
          {c.dirty && (
            <button type="button" className="btn btn-ghost" onClick={c.undo} disabled={c.busy !== null}>
              Undo changes
            </button>
          )}
          {reviewing ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => void c.save()} disabled={c.busy !== null || !c.dirty}>
                {c.busy === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void complete()} disabled={c.busy !== null}>
                <Icon name="check" size={18} /> {c.busy === 'complete' ? 'Completing…' : 'Complete review'}
              </button>
            </>
          ) : completed ? (
            <button type="button" className="btn btn-primary" onClick={() => void c.save()} disabled={c.busy !== null || !c.dirty}>
              {c.busy === 'save' ? 'Saving…' : 'Save corrections'}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => void c.save()} disabled={c.busy !== null || !c.dirty}>
                {c.busy === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void complete()} disabled={c.busy !== null}>
                <Icon name="check" size={18} /> {c.busy === 'complete' ? 'Completing…' : 'Complete consultation'}
              </button>
            </>
          )}
        </div>
      )}


      {encounter && <PrescriptionPrint data={data} input={c.input} />}
    </div>
  );
}
