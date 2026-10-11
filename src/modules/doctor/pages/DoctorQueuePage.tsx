import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/core/authentication/AuthContext';
import { Icon, type IconName } from '@/shared/components/Icons';
import { formatTime } from '@/shared/utils/format';
import { doctorApi } from '../api/doctorApi';
import { AvailabilityControl } from '../components/AvailabilityControl';
import {
  GENDER_SHORT,
  LAB_STATUS_LABEL,
  QUEUE_STATUS_LABEL,
  type DoctorQueue,
  type QueueItem,
  type QueueStatus,
} from '../types';
import '../doctor.css';

type Filter = 'ALL' | QueueStatus | 'AWAITING_RESULTS';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'IN_CONSULTATION', label: 'In consultation' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ADMISSION_REQUESTED', label: 'Admission requested' },
  { value: 'AWAITING_RESULTS', label: 'Awaiting lab results' },
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/** Minutes between two moments (null if either is missing). */
function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

function duration(m: number): string {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Waiting time colour: normal, amber after 30 min, red after 60 min. */
function waitLevel(m: number | null): '' | 'wait-long' | 'wait-very-long' {
  if (m === null || m < 30) return '';
  return m < 60 ? 'wait-long' : 'wait-very-long';
}

/** One short line per fact, so nothing wraps mid-phrase. */
function elapsed(item: QueueItem): { lines: string[]; level: string } {
  if (item.queueStatus === 'WAITING') {
    const m = minutesSince(item.registeredAt);
    return { lines: m === null ? [] : [`Waiting ${duration(m)}`], level: waitLevel(m) };
  }
  if (item.queueStatus === 'IN_CONSULTATION') {
    const m = minutesSince(item.startedAt);
    return { lines: [m === null ? 'With doctor' : `With doctor ${duration(m)}`], level: '' };
  }
  const waited = minutesBetween(item.registeredAt, item.startedAt);
  const seen = minutesBetween(item.startedAt, item.completedAt);
  const lines = [waited !== null ? `Waited ${duration(waited)}` : '', seen !== null ? `Seen ${duration(seen)}` : ''].filter(Boolean);
  return { lines: lines.length ? lines : item.completedAt ? [`Done ${formatTime(item.completedAt)}`] : [], level: '' };
}

const shortDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Today's averages for the header (only finished / started consultations count). */
function daySummary(items: QueueItem[]) {
  const waits = items.map((i) => minutesBetween(i.registeredAt, i.startedAt)).filter((m): m is number => m !== null);
  const consults = items.map((i) => minutesBetween(i.startedAt, i.completedAt)).filter((m): m is number => m !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const finished = items.filter((i) => i.completedAt);
  const last = finished.map((i) => i.completedAt!).sort().at(-1) ?? null;
  return { seen: finished.length, avgWait: avg(waits), avgConsult: avg(consults), lastSeenAt: last };
}

/** Order: in consultation first, then emergencies (by triage), then waiting by arrival, then finished. */
function sortQueue(items: QueueItem[]): QueueItem[] {
  const rank = (i: QueueItem) =>
    i.queueStatus === 'IN_CONSULTATION' ? 0 : i.queueStatus === 'WAITING' ? (i.registrationType === 'OP' ? 2 : 1) : 3;
  const triage = (i: QueueItem) => ['RED', 'ORANGE', 'YELLOW', 'GREEN'].indexOf(i.triageLevel);
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 1 ? triage(a) - triage(b) : 0) ||
      new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime(),
  );
}

/** Doctor workspace: today's patients booked with the signed-in doctor. */
export default function DoctorQueuePage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso);
  const [queue, setQueue] = useState<DoctorQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** When the list on screen was last loaded successfully. */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const isToday = date === todayIso();

  const load = useCallback(async () => {
    try {
      setQueue(await doctorApi.getQueue(date));
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue.');
    }
  }, [date]);

  // Refresh button: show a spinner for at least half a second so the click is visibly acknowledged.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([load(), new Promise((r) => window.setTimeout(r, 500))]);
    setRefreshing(false);
  };

  // Refresh every 30 s so new registrations appear without reloading.
  useEffect(() => {
    void load();
    if (!isToday) return;
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load, isToday]);

  const rows = useMemo(() => {
    if (!queue) return [];
    const q = search.trim().toLowerCase();
    return sortQueue(queue.items).filter(
      (i) =>
        (filter === 'ALL' || i.queueStatus === filter || (filter === 'AWAITING_RESULTS' && i.labStatus === 'AWAITING_RESULTS')) &&
        (!q ||
          i.patientName.toLowerCase().includes(q) ||
          i.tokenNumber.toLowerCase().includes(q) ||
          i.patientNumber.toLowerCase().includes(q)),
    );
  }, [queue, filter, search]);

  /** Waiting patient of mine today: open AND start the consultation in one click. Others: just open. */
  function open(item: QueueItem) {
    const startNow = Boolean(queue?.isDoctor) && isToday && item.queueStatus === 'WAITING';
    navigate(`/doctor/visits/${item.visitId}`, { state: startNow ? { autoStart: true } : null });
  }

  const next = queue?.isDoctor && isToday ? sortQueue(queue.items).find((i) => i.queueStatus === 'WAITING') : undefined;
  const firstName = user.displayName.replace(/^dr\.?\s+/i, '').split(' ')[0];
  const counts = queue?.counts;
  const summary = daySummary(queue?.items ?? []);

  const stats: { label: string; value: number | undefined; icon: IconName; filter: Filter }[] = [
    { label: 'Waiting', value: counts?.waiting, icon: 'queue', filter: 'WAITING' },
    { label: 'In consultation', value: counts?.inConsultation, icon: 'stethoscope', filter: 'IN_CONSULTATION' },
    { label: 'Completed', value: counts?.completed, icon: 'check', filter: 'COMPLETED' },
    { label: 'Admission requested', value: counts?.admissionRequested, icon: 'discharge', filter: 'ADMISSION_REQUESTED' },
  ];

  return (
    <div className="doctor-page">
      <section className="dw-hero" aria-label="Doctor overview">
        <div className="dw-hero-text">
          <span className="dw-hero-kicker">Doctor workspace · {user.tenant.name}</span>
          <h1 className="dw-hero-title">
            {greeting()}, {queue?.isDoctor ? `Dr. ${firstName}` : firstName}
          </h1>
          <p className="dw-hero-sub">
            {queue?.isDoctor
              ? `${counts?.total ?? 0} patient${counts?.total === 1 ? '' : 's'} booked with you ${isToday ? 'today' : 'on this day'}`
              : 'All doctors’ patients (view only)'}
          </p>
          {queue && queue.items.length > 0 && (
            <div className="dw-summary">
              <span>
                <b>
                  {summary.seen} of {counts?.total ?? 0}
                </b>{' '}
                seen
              </span>
              <span>
                Avg wait <b>{summary.avgWait !== null ? duration(summary.avgWait) : '–'}</b>
              </span>
              <span>
                Avg consultation <b>{summary.avgConsult !== null ? duration(summary.avgConsult) : '–'}</b>
              </span>
              {summary.lastSeenAt && (
                <span>
                  Last patient <b>{formatTime(summary.lastSeenAt)}</b>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="dw-stats">
          {stats.map((s) => (
            <button
              type="button"
              key={s.label}
              className={filter === s.filter ? 'dw-stat on' : 'dw-stat'}
              onClick={() => setFilter(filter === s.filter ? 'ALL' : s.filter)}
            >
              <span className="dw-stat-icon">
                <Icon name={s.icon} size={18} />
              </span>
              <span className="dw-stat-value">{s.value ?? '–'}</span>
              <span className="dw-stat-label">{s.label}</span>
            </button>
          ))}
        </div>
      </section>

      {queue?.isDoctor && isToday && (
        <div className="avail-row">
          <AvailabilityControl reloadKey={updatedAt?.getTime()} />
        </div>
      )}

      {next && (
        <div className="next-patient card">
          <div>
            <span className="np-label">Next patient</span>
            <div className="np-main">
              <span className="np-token">{next.tokenNumber}</span>
              <span>
                <strong>{next.patientName}</strong>
                <small>
                  {next.ageYears ?? '-'} yrs / {GENDER_SHORT[next.gender] ?? '-'} · {next.reasonForVisit || 'No reason given'}
                </small>
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => open(next)}>
            <Icon name="stethoscope" size={18} /> See patient
          </button>
        </div>
      )}

      <div className="card queue-card">
        <div className="queue-toolbar">
          <div className="queue-filters" role="tablist" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                className={filter === f.value ? 'chip on' : 'chip'}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                {f.value === 'AWAITING_RESULTS' && counts && counts.awaitingLabResults > 0 && (
                  <span className="chip-count">{counts.awaitingLabResults}</span>
                )}
              </button>
            ))}
          </div>
          <div className="queue-tools">
            <div className="queue-search">
              <Icon name="search" size={18} />
              <input
                className="input"
                type="search"
                placeholder="Name, token or patient ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search the queue"
              />
            </div>
            <input
              className="input queue-date"
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value || todayIso())}
              aria-label="Queue date"
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-refresh"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              {refreshing && <span className="spinner-sm" aria-hidden="true" />}
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error queue-error" role="alert">
            <div>
              <strong>{queue ? 'Could not refresh the list.' : 'Could not load the list.'}</strong> {error}
              {queue && updatedAt && (
                <small>
                  Showing the list as of{' '}
                  {updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.
                </small>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-refresh"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              {refreshing && <span className="spinner-sm" aria-hidden="true" />}
              {refreshing ? 'Trying…' : 'Try again'}
            </button>
          </div>
        )}
        {!queue && !error && (
          <p className="queue-empty queue-loading">
            <span className="spinner-sm" aria-hidden="true" /> Loading…
          </p>
        )}
        {queue && rows.length === 0 && (
          <p className="queue-empty">
            {queue.items.length === 0 ? 'No patients booked for this day yet.' : 'No patients match this filter.'}
          </p>
        )}

        {rows.length > 0 && (
          <ul className="queue-list">
            {rows.map((item) => (
              <li key={item.visitId}>
                <button
                  type="button"
                  className={`queue-row status-${item.queueStatus.toLowerCase()}`}
                  onClick={() => open(item)}
                >
                  <span className={`q-token ${item.registrationType !== 'OP' ? 'q-token-acute' : ''}`}>{item.tokenNumber}</span>
                  <span className="q-patient">
                    <strong>{item.patientName}</strong>
                    <small>
                      {item.patientNumber} · {item.ageYears ?? '-'} yrs / {GENDER_SHORT[item.gender] ?? '-'}
                    </small>
                    <span className="q-tags">
                      {item.registrationType === 'EMERGENCY' && (
                        <span className={`tag tag-triage-${item.triageLevel.toLowerCase() || 'none'}`}>
                          Emergency{item.triageLevel ? ` · ${item.triageLevel}` : ''}
                        </span>
                      )}
                      {item.registrationType === 'ICU' && <span className="tag tag-icu">ICU</span>}
                      {item.lastVisitAt ? (
                        <span className="tag" title="Previous visit">
                          Last seen {shortDate(item.lastVisitAt)}
                          {item.lastVisitSummary ? ` · ${item.lastVisitSummary}` : ''}
                        </span>
                      ) : (
                        <span className="tag">{item.isReturning ? 'Return' : 'New'}</span>
                      )}
                      {item.isFollowUp && <span className="tag tag-follow">Free follow-up</span>}
                    </span>
                  </span>
                  {item.primaryDiagnosis ? (
                    <span className="q-reason q-dx">
                      <strong>{item.primaryDiagnosis}</strong>
                      <small>
                        {[
                          item.medicineCount > 0 && `${item.medicineCount} medicine${item.medicineCount === 1 ? '' : 's'}`,
                          item.testCount > 0 && `${item.testCount} test${item.testCount === 1 ? '' : 's'}`,
                          item.followUpDate && `Review ${shortDate(item.followUpDate)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  ) : (
                    <span className="q-reason">{item.reasonForVisit || <em>No reason given</em>}</span>
                  )}
                  <span className="q-time">
                    <span>{formatTime(item.registeredAt)}</span>
                    {(() => {
                      const e = elapsed(item);
                      return e.lines.map((line) => (
                        <small key={line} className={e.level}>
                          {line}
                        </small>
                      ));
                    })()}
                    {!queue?.isDoctor && <small>{item.doctorName}</small>}
                  </span>
                  <span className="q-status">
                    {item.labStatus ? (
                      <span className={`status-pill pill-${item.labStatus.toLowerCase()}`}>{LAB_STATUS_LABEL[item.labStatus]}</span>
                    ) : (
                      <span className={`status-pill pill-${item.queueStatus.toLowerCase()}`}>{QUEUE_STATUS_LABEL[item.queueStatus]}</span>
                    )}
                    <span className="q-action">
                      {queue?.isDoctor && isToday && item.queueStatus === 'WAITING'
                        ? 'Start'
                        : queue?.isDoctor && item.queueStatus === 'IN_CONSULTATION'
                          ? 'Continue'
                          : 'View'}
                      <Icon name="chevronDown" size={16} className="q-arrow" />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
