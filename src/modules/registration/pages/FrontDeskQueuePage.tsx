import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/core/authentication/AuthContext';
import { Icon, type IconName } from '@/shared/components/Icons';
import { formatMobile, formatTime } from '@/shared/utils/format';
import { registrationApi } from '../api/registrationApi';
import { PendingVisits } from '../components/PendingVisits';
import { VisitActions } from '../components/VisitActions';
import { LabResultActions } from '../components/LabResultActions';
import { awayLabel } from '@/shared/utils/doctorAvailability';
import type { FrontDeskDoctor, FrontDeskQueue, FrontDeskQueueCounts, FrontDeskQueueItem, QueueStatus } from '../types';
import '../registration.css';

/**
 * Front Desk → OP Queue: everyone registered for the day (OPD + Emergency), all doctors, with where they are now:
 * waiting (and their place in the doctor's line), with the doctor, completed, lab results pending, admission
 * requested. No diagnosis or other clinical details. Admitted patients (IP / ICU) are on the Inpatient Queue page.
 * On today's queue, OPD visits of earlier days the doctor never saw come first ("Pending from earlier days"):
 * the desk moves them to today / another day or cancels them (PendingVisits).
 * Refreshes every 30 s; clicking a patient opens them on the Registration screen.
 */

type Filter = 'ALL' | 'NEXT' | QueueStatus | 'AWAITING_RESULTS' | 'ACUTE';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'NEXT', label: 'Next patients' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'IN_CONSULTATION', label: 'With doctor' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ADMISSION_REQUESTED', label: 'Admission requested' },
  { value: 'AWAITING_RESULTS', label: 'Awaiting lab results' },
  { value: 'ACUTE', label: 'Emergency' },
  { value: 'BOOKED', label: 'Appointments' },
];

/** Front desk wording: "With doctor" reads better at the counter than "In consultation". */
const STATUS_LABEL: Record<QueueStatus, string> = {
  BOOKED: 'Booked · pay on arrival',
  WAITING: 'Waiting',
  IN_CONSULTATION: 'With doctor',
  COMPLETED: 'Completed',
  ADMISSION_REQUESTED: 'Admission requested',
  CONVERTED_TO_INPATIENT: 'Admitted',
};

const ADMISSION_LABEL: Record<string, string> = { WARD: 'Ward', ICU: 'ICU', HDU: 'HDU', DAY_CARE: 'Day care' };
const GENDER_SHORT: Record<string, string> = { MALE: 'M', FEMALE: 'F', OTHER: 'O' };

/** How far ahead appointments can be booked (and looked at here). */
const BOOKING_MAX_DAYS = 30;

const todayIso = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const shortDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

function duration(m: number): string {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const isAcute = (i: FrontDeskQueueItem) => i.registrationType === 'EMERGENCY' || i.registrationType === 'ICU';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Token number as a number ("A-012" → 12): the doctor's line goes by token, so a booked patient keeps their place. */
const tokenNo = (i: { tokenNumber: string }) => Number(i.tokenNumber.replace(/\D/g, '')) || 0;

/** Place in the doctor's line for waiting OP patients (1 = next). Emergencies are seen first and get no number. */
function linePositions(items: FrontDeskQueueItem[]): Map<number, number> {
  const byDoctor = new Map<number, FrontDeskQueueItem[]>();
  // Same order as the line itself: lab results reviews first, then by token.
  sortQueue(items.filter((i) => i.queueStatus === 'WAITING' && !isAcute(i)))
    .forEach((i) => byDoctor.set(i.doctorId, [...(byDoctor.get(i.doctorId) ?? []), i]));
  const out = new Map<number, number>();
  byDoctor.forEach((list) => list.forEach((i, idx) => out.set(i.visitId, idx + 1)));
  return out;
}

/** Waiting time colour: normal, amber after 30 min, red after 60 min. */
function waitLevel(m: number | null): '' | 'wait-long' | 'wait-very-long' {
  if (m === null || m < 30) return '';
  return m < 60 ? 'wait-long' : 'wait-very-long';
}

function timeLines(item: FrontDeskQueueItem, isToday: boolean): { lines: string[]; level: string } {
  // Appointment: booked on registeredAt's day; not in the doctor's line until checked in.
  if (item.queueStatus === 'BOOKED') {
    const past = item.visitDate < todayIso();
    return {
      lines: [`Booked ${shortDate(item.registeredAt)}`, past ? 'Did not come' : isToday ? 'Not arrived yet' : 'Pay on arrival'],
      level: past ? 'wait-very-long' : '',
    };
  }
  // A later day: paid visit moved ahead by the desk.
  if (item.queueStatus === 'WAITING' && item.visitDate > todayIso()) {
    return { lines: ['Scheduled (paid)'], level: '' };
  }
  // Looking at an earlier day: a patient still "waiting" was never seen; hours since then mean nothing.
  if (item.queueStatus === 'WAITING' && !isToday) {
    return { lines: ['Not seen by doctor'], level: 'wait-very-long' };
  }
  if (item.queueStatus === 'WAITING') {
    const m = minutesSince(item.registeredAt);
    return { lines: m === null ? [] : [`Waiting ${duration(m)}`], level: waitLevel(m) };
  }
  if (item.queueStatus === 'IN_CONSULTATION') {
    const waited = minutesBetween(item.registeredAt, item.startedAt);
    const m = minutesSince(item.startedAt);
    return {
      lines: [waited !== null ? `Waited ${duration(waited)}` : '', m !== null ? `With doctor ${duration(m)}` : 'With doctor'].filter(
        Boolean,
      ),
      level: '',
    };
  }
  const waited = minutesBetween(item.registeredAt, item.startedAt);
  return {
    lines: [waited !== null ? `Waited ${duration(waited)}` : '', item.completedAt ? `Done ${formatTime(item.completedAt)}` : ''].filter(
      Boolean,
    ),
    level: '',
  };
}

/**
 * Waiting line: 1) emergencies (by triage) 2) lab results reviews (by when they came back) 3) everyone else by
 * token number. Then with doctor, then finished (latest first), then appointments not arrived.
 */
function sortQueue(items: FrontDeskQueueItem[]): FrontDeskQueueItem[] {
  const rank = (i: FrontDeskQueueItem) =>
    i.queueStatus === 'WAITING'
      ? isAcute(i) ? 0 : i.isLabReview ? 0.5 : 1
      : i.queueStatus === 'IN_CONSULTATION' ? 2 : i.queueStatus === 'BOOKED' ? 4 : 3;
  const triage = (i: FrontDeskQueueItem) => {
    const t = ['RED', 'ORANGE', 'YELLOW', 'GREEN'].indexOf(i.triageLevel);
    return t < 0 ? 4 : t;
  };
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (rank(a) === 0) return triage(a) - triage(b) || a.registeredAt.localeCompare(b.registeredAt);
    if (rank(a) === 1 || rank(a) === 4) return tokenNo(a) - tokenNo(b);
    if (rank(a) === 3) return (b.completedAt ?? b.registeredAt).localeCompare(a.completedAt ?? a.registeredAt);
    return a.registeredAt.localeCompare(b.registeredAt);
  });
}

const AVG_BASIS: Record<FrontDeskDoctor['avgBasis'], string> = {
  TODAY: 'today',
  RECENT: 'last 30 days',
  DEFAULT: 'estimate',
};

/** If nobody has been seen for this long while patients wait, the desk is told (doctor may be with inpatients). */
const IDLE_MINUTES = 20;

/** Called but not there: skipped as "next" for this long, then back in line with their token (Admin setting later). */
const NOT_HERE_MINUTES = 15;

/** When a "not here" patient comes back into line, or null if they aren't marked (or the time has passed). */
function notHereUntil(i: FrontDeskQueueItem): Date | null {
  if (!i.notHereAt) return null;
  const until = new Date(new Date(i.notHereAt).getTime() + NOT_HERE_MINUTES * 60000);
  return until.getTime() > Date.now() ? until : null;
}

interface NextUp {
  item: FrontDeskQueueItem;
  /** Doctor is free right now (started OPD, not paused, nobody with them): send this patient in. */
  sendNow: boolean;
  doctorName: string;
}

/**
 * Each doctor's next patient (emergencies first, then lowest token), skipping patients marked "not here" in the
 * last 15 min. sendNow when the doctor has started OPD, isn't paused and has nobody with them.
 */
function nextPatients(items: FrontDeskQueueItem[], doctors: FrontDeskDoctor[]): Map<number, NextUp> {
  const out = new Map<number, NextUp>();
  doctors.forEach((d) => {
    const next = sortQueue(items.filter((i) => i.doctorId === d.doctorId && i.queueStatus === 'WAITING')).find(
      (i) => !notHereUntil(i),
    );
    if (!next) return;
    const withDoctor = items.some((i) => i.doctorId === d.doctorId && i.queueStatus === 'IN_CONSULTATION');
    out.set(d.doctorId, {
      item: next,
      sendNow: !d.availability.isAway && !withDoctor && Boolean(d.firstStartedAt),
      doctorName: d.name,
    });
  });
  return out;
}

interface Eta {
  /** Expected time to see the doctor, or null when it can't be estimated (doctor away without a return time). */
  at: Date | null;
  note: string;
}

/**
 * Expected time for each waiting patient, per doctor:
 *   start = now, or the doctor's expected return if paused
 *   + what is left of the current consultation (average minus time already spent, at least 2 min)
 *   + average minutes x patients ahead (emergencies first, then by arrival).
 */
function expectedTimes(items: FrontDeskQueueItem[], doctors: FrontDeskDoctor[]): Map<number, Eta> {
  const out = new Map<number, Eta>();
  const now = Date.now();
  doctors.forEach((d) => {
    const avg = d.avgConsultMinutes * 60000;
    const waiting = sortQueue(items.filter((i) => i.doctorId === d.doctorId && i.queueStatus === 'WAITING'));
    if (!waiting.length) return;
    const a = d.availability;
    if (a.isAway && !a.expectedBackAt) {
      waiting.forEach((i) => out.set(i.visitId, { at: null, note: `Doctor ${awayLabel(a.reason, true).toLowerCase()}` }));
      return;
    }
    let t = a.isAway && a.expectedBackAt ? Math.max(now, new Date(a.expectedBackAt).getTime()) : now;
    const current = items
      .filter((i) => i.doctorId === d.doctorId && i.queueStatus === 'IN_CONSULTATION' && i.startedAt)
      .sort((x, y) => y.startedAt!.localeCompare(x.startedAt!))[0];
    // Not seeing patients (OPD not started, or nobody seen for a while) and no return time given: any time we
    // printed would be a guess, so say so instead of promising "any moment".
    if (!a.isAway && !current) {
      const idle = minutesSince(d.lastCompletedAt);
      const note = !d.firstStartedAt
        ? 'Doctor hasn’t started OPD'
        : idle !== null && idle >= IDLE_MINUTES
          ? `No patient seen for ${duration(idle)}`
          : '';
      if (note) {
        waiting.forEach((i) => out.set(i.visitId, { at: null, note }));
        return;
      }
    }
    if (current && !a.isAway) t += Math.max(avg - (now - new Date(current.startedAt!).getTime()), 2 * 60000);
    waiting.forEach((i) => {
      out.set(i.visitId, {
        at: new Date(t),
        // Make the reason for the later time visible in the row, not just in a tooltip.
        note: a.isAway && a.expectedBackAt ? `Doctor: ${awayLabel(a.reason)} till ${formatTime(a.expectedBackAt)}` : '',
      });
      t += avg;
    });
  });
  return out;
}

/** One line about where the doctor is, for the doctor cards. */
function doctorState(d: FrontDeskDoctor, items: FrontDeskQueueItem[]): { tone: 'ok' | 'busy' | 'away' | 'idle'; title: string; sub: string } {
  const a = d.availability;
  if (a.isAway) {
    const back = a.expectedBackAt ? new Date(a.expectedBackAt) : null;
    const late = back && back.getTime() < Date.now() ? Math.round((Date.now() - back.getTime()) / 60000) : 0;
    return {
      tone: 'away',
      title: `${awayLabel(a.reason)}${a.note ? ` · ${a.note}` : ''}`,
      sub: `Since ${a.since ? formatTime(a.since) : '-'} · ${
        back ? (late > 0 ? `was due back ${formatTime(back)} (${duration(late)} late)` : `back ~${formatTime(back)}`) : 'return time not given'
      }`,
    };
  }
  const current = items
    .filter((i) => i.doctorId === d.doctorId && i.queueStatus === 'IN_CONSULTATION')
    .sort((x, y) => (y.startedAt ?? '').localeCompare(x.startedAt ?? ''))[0];
  if (current) {
    const m = minutesSince(current.startedAt);
    return { tone: 'busy', title: `With patient ${current.tokenNumber}`, sub: m !== null ? `for ${duration(m)}` : '' };
  }
  const waiting = items.filter((i) => i.doctorId === d.doctorId && i.queueStatus === 'WAITING');
  if (!d.firstStartedAt) {
    return waiting.length
      ? { tone: 'idle', title: 'OPD not started yet', sub: 'No patient seen today' }
      : { tone: 'ok', title: 'Available', sub: 'No patients yet' };
  }
  const idle = minutesSince(d.lastCompletedAt);
  if (waiting.length && idle !== null && idle >= IDLE_MINUTES) {
    return { tone: 'idle', title: `No patient seen for ${duration(idle)}`, sub: 'May be with inpatients – check with the doctor' };
  }
  return { tone: 'ok', title: 'Available', sub: d.lastCompletedAt ? `Last patient done ${formatTime(d.lastCompletedAt)}` : '' };
}

/** Doctors needing the desk's attention first: away, OPD not started / idle, then busy, then available. */
const TONE_ORDER = { away: 0, idle: 1, busy: 2, ok: 3 } as const;

/**
 * Doctor cards in ONE row that scrolls sideways (arrows, mouse wheel, touch), so the patient list never moves down
 * however many doctors the hospital has. Click a card to show only that doctor's patients.
 */
function DoctorStrip({
  board,
  items,
  nextUp,
  selected,
  onSelect,
}: {
  board: FrontDeskDoctor[];
  items: FrontDeskQueueItem[];
  nextUp: Map<number, NextUp>;
  selected: number | 'ALL';
  onSelect: (id: number | 'ALL') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const cards = board
    .map((d) => ({ d, st: doctorState(d, items), waiting: items.filter((i) => i.doctorId === d.doctorId && i.queueStatus === 'WAITING').length }))
    .sort((a, b) => TONE_ORDER[a.st.tone] - TONE_ORDER[b.st.tone] || b.waiting - a.waiting || a.d.name.localeCompare(b.d.name));

  // Show an arrow only when there is more to scroll to on that side.
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, board.length]);

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth - 80), behavior: 'smooth' });

  // Vertical mouse wheel scrolls the row sideways (only when it can actually scroll).
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    el.scrollLeft += e.deltaY;
  };

  return (
    <div className="fq-strip">
      {edges.left && (
        <button type="button" className="fq-strip-arrow left" onClick={() => scroll(-1)} aria-label="Previous doctors">
          <Icon name="chevronDown" size={20} />
        </button>
      )}
      <div className="fq-doctors" ref={ref} onScroll={measure} onWheel={onWheel} aria-label={`Doctors (${board.length})`}>
        {cards.map(({ d, st, waiting }) => (
          <button
            type="button"
            key={d.doctorId}
            className={`fq-doc tone-${st.tone}${selected === d.doctorId ? ' on' : ''}${nextUp.get(d.doctorId)?.sendNow ? ' fq-doc-sendnow' : ''}`}
            onClick={() => onSelect(selected === d.doctorId ? 'ALL' : d.doctorId)}
            aria-pressed={selected === d.doctorId}
            title="Show only this doctor's patients"
          >
            <span className="fq-doc-head">
              <span className="fq-doc-dot" aria-hidden="true" />
              <strong>{d.name}</strong>
            </span>
            <span className="fq-doc-state">{st.title}</span>
            {st.sub && <small>{st.sub}</small>}
            {nextUp.get(d.doctorId) && (
              <span className={nextUp.get(d.doctorId)!.sendNow ? 'fq-doc-next send' : 'fq-doc-next'}>
                {nextUp.get(d.doctorId)!.sendNow ? 'Send in now: ' : 'Next: '}
                <b>{nextUp.get(d.doctorId)!.item.tokenNumber}</b> {nextUp.get(d.doctorId)!.item.patientName}
              </span>
            )}
            <span className="fq-doc-foot">
              <b>{waiting}</b> waiting · {d.seenToday} seen · ~{d.avgConsultMinutes} min/patient
              <small> ({AVG_BASIS[d.avgBasis]})</small>
            </span>
          </button>
        ))}
      </div>
      {edges.right && (
        <button type="button" className="fq-strip-arrow right" onClick={() => scroll(1)} aria-label="More doctors">
          <Icon name="chevronDown" size={20} />
        </button>
      )}
    </div>
  );
}

function matchesFilter(i: FrontDeskQueueItem, f: Filter): boolean {
  if (f === 'ALL') return true;
  if (f === 'AWAITING_RESULTS') return i.labStatus === 'AWAITING_RESULTS';
  if (f === 'ACUTE') return isAcute(i);
  return i.queueStatus === f;
}

export default function FrontDeskQueuePage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso);
  const [queue, setQueue] = useState<FrontDeskQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [doctorId, setDoctorId] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const isToday = date === todayIso();
  const isFuture = date > todayIso();

  const load = useCallback(async () => {
    try {
      setQueue(await registrationApi.getQueue(date));
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue.');
    }
  }, [date]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([load(), new Promise((r) => window.setTimeout(r, 500))]);
    setRefreshing(false);
  };

  // New registrations and doctors' updates appear by themselves every 30 s (today only).
  useEffect(() => {
    setQueue(null);
    void load();
    if (!isToday) return;
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load, isToday]);

  // Keep "Waiting 12 min" ticking between refreshes.
  useEffect(() => {
    if (!isToday) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [isToday]);

  const items = useMemo(
    () => (queue?.items ?? []).filter((i) => i.registrationType === 'OP' || i.registrationType === 'EMERGENCY'),
    [queue],
  );
  const positions = useMemo(() => linePositions(items), [items]);
  const board = useMemo(() => (isToday ? queue?.doctors ?? [] : []), [queue, isToday]);
  const etas = expectedTimes(items, board);
  // Recomputed on every render (the 1-minute tick brings "not here" patients back into line on time).
  const nextUp = nextPatients(items, board);
  const nextIds = new Map<number, NextUp>([...nextUp.values()].map((n) => [n.item.visitId, n] as const));
  const sendNowCount = [...nextUp.values()].filter((n) => n.sendNow).length;
  const [marking, setMarking] = useState<number | null>(null);
  /** A failed Not here / Here now, shown in red under that row's button. */
  const [markError, setMarkError] = useState<{ visitId: number; message: string } | null>(null);

  async function markNotHere(item: FrontDeskQueueItem, notHere: boolean) {
    setMarking(item.visitId);
    setMarkError(null);
    try {
      await registrationApi.markNotHere(item.visitId, notHere);
      const back = new Date(Date.now() + NOT_HERE_MINUTES * 60000);
      changed(
        notHere
          ? `${item.tokenNumber} ${item.patientName} is not here — skipped for now, back in line at ${formatTime(back.toISOString())}.`
          : `${item.tokenNumber} ${item.patientName} is here — back in line with token ${item.tokenNumber}.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setMarkError({
        visitId: item.visitId,
        message: `Not saved${message ? `: ${message}` : ''}. Try again; if it keeps failing, the server may need a restart.`,
      });
    } finally {
      setMarking(null);
    }
  }

  /** Doctors seen in today's list, with how many are still waiting for each. */
  const doctors = useMemo(() => {
    const map = new Map<number, { id: number; name: string; waiting: number }>();
    items.forEach((i) => {
      const d = map.get(i.doctorId) ?? { id: i.doctorId, name: i.doctorName, waiting: 0 };
      if (i.queueStatus === 'WAITING') d.waiting++;
      map.set(i.doctorId, d);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // A doctor picked on another day may not exist on this one.
  useEffect(() => {
    if (doctorId !== 'ALL' && queue && !doctors.some((d) => d.id === doctorId)) setDoctorId('ALL');
  }, [doctors, doctorId, queue]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    // "Next patients": each doctor's next patient, the ones to send in now first.
    const base =
      filter === 'NEXT'
        ? [...nextPatients(items, board).values()]
            .sort((a, b) => Number(b.sendNow) - Number(a.sendNow) || a.doctorName.localeCompare(b.doctorName))
            .map((n) => n.item)
        : sortQueue(items);
    return base.filter(
      (i) =>
        (filter === 'NEXT' || matchesFilter(i, filter)) &&
        (doctorId === 'ALL' || i.doctorId === doctorId) &&
        (!q ||
          i.patientName.toLowerCase().includes(q) ||
          i.tokenNumber.toLowerCase().includes(q) ||
          i.patientNumber.toLowerCase().includes(q) ||
          (digits.length >= 3 && i.mobileNumber.includes(digits))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, board, filter, doctorId, search, tick]);

  const counts: FrontDeskQueueCounts | undefined = queue
    ? {
        total: items.filter((i) => i.queueStatus !== 'BOOKED').length,
        booked: items.filter((i) => i.queueStatus === 'BOOKED').length,
        waiting: items.filter((i) => i.queueStatus === 'WAITING').length,
        inConsultation: items.filter((i) => i.queueStatus === 'IN_CONSULTATION').length,
        completed: items.filter((i) => i.queueStatus === 'COMPLETED').length,
        admissionRequested: items.filter((i) => i.queueStatus === 'ADMISSION_REQUESTED').length,
        awaitingLabResults: items.filter((i) => i.labStatus === 'AWAITING_RESULTS').length,
        emergency: items.filter(isAcute).length,
      }
    : undefined;
  const waits = items.map((i) => minutesBetween(i.registeredAt, i.startedAt)).filter((m): m is number => m !== null);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  const longest = isToday
    ? items
        .filter((i) => i.queueStatus === 'WAITING')
        .reduce<number | null>((max, i) => Math.max(max ?? 0, minutesSince(i.registeredAt) ?? 0), null)
    : null;

  const stats: { label: string; value: number | undefined; icon: IconName; filter: Filter }[] = [
    { label: 'Waiting', value: counts?.waiting, icon: 'queue', filter: 'WAITING' },
    { label: 'With doctor', value: counts?.inConsultation, icon: 'stethoscope', filter: 'IN_CONSULTATION' },
    { label: 'Completed', value: counts?.completed, icon: 'check', filter: 'COMPLETED' },
    { label: 'Admission requested', value: counts?.admissionRequested, icon: 'discharge', filter: 'ADMISSION_REQUESTED' },
  ];

  /** After Move / Change date / Cancel: show what happened and reload the lists. */
  function changed(message: string) {
    setNotice(message);
    void load();
  }

  function open(item: FrontDeskQueueItem) {
    navigate('/registration', { state: { patientId: item.patientId } });
  }

  return (
    <div className="fq-page">
      <section className="fd-hero" aria-label="OP queue overview">
        <div className="fd-hero-text">
          <span className="fd-hero-kicker">OP queue · {user.tenant.name}</span>
          <h1 className="fd-hero-title">{isToday ? 'Today’s OPD patients' : longDate(date)}</h1>
          <p className="fq-hero-sub">
            {counts ? (isFuture ? `${counts.booked} appointments booked` : `${counts.total} registered`) : 'Loading…'}
            {counts && !isFuture && counts.booked > 0 && ` · ${counts.booked} ${isToday ? 'appointments not arrived yet' : 'appointments missed'}`}
            {counts && counts.emergency > 0 && ` · ${counts.emergency} emergency`}
          </p>
          {items.length > 0 && (
            <div className="fq-summary">
              <span>
                Avg wait <b>{avgWait !== null ? duration(avgWait) : '–'}</b>
              </span>
              {longest !== null && (
                <span>
                  Longest waiting now <b>{duration(longest)}</b>
                </span>
              )}
              {counts && counts.awaitingLabResults > 0 && (
                <span>
                  Lab results pending <b>{counts.awaitingLabResults}</b>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="fd-stats">
          {stats.map((s) => (
            <button
              type="button"
              key={s.label}
              className={filter === s.filter ? 'fd-stat fq-stat on' : 'fd-stat fq-stat'}
              onClick={() => setFilter(filter === s.filter ? 'ALL' : s.filter)}
              aria-pressed={filter === s.filter}
            >
              <span className="fd-stat-icon">
                <Icon name={s.icon} size={18} />
              </span>
              <span className="fd-stat-value">{s.value ?? '–'}</span>
              <span className="fd-stat-label">{s.label}</span>
            </button>
          ))}
        </div>
      </section>

      {notice && (
        <div className="alert alert-success fq-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {isToday && queue && (
        <PendingVisits items={queue.pending ?? []} onChanged={changed} />
      )}

      {board.length > 0 && (
        <DoctorStrip board={board} items={items} nextUp={nextUp} selected={doctorId} onSelect={setDoctorId} />
      )}

      <div className="card fq-card">
        <div className="fq-toolbar">
          <div className="fq-filters" role="tablist" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                className={filter === f.value ? 'fq-chip on' : 'fq-chip'}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                {f.value === 'NEXT' && isToday && sendNowCount > 0 && (
                  <span className="fq-chip-count fq-chip-count-send" title="Doctors free now">
                    {sendNowCount}
                  </span>
                )}
                {f.value === 'AWAITING_RESULTS' && counts && counts.awaitingLabResults > 0 && (
                  <span className="fq-chip-count">{counts.awaitingLabResults}</span>
                )}
                {f.value === 'ACUTE' && counts && counts.emergency > 0 && (
                  <span className="fq-chip-count fq-chip-count-red">{counts.emergency}</span>
                )}
              </button>
            ))}
          </div>
          <div className="fq-tools">
            <select
              className="select fq-doctor"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              aria-label="Doctor"
            >
              <option value="ALL">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.waiting > 0 ? ` (${d.waiting} waiting)` : ''}
                </option>
              ))}
            </select>
            <div className="fq-search">
              <Icon name="search" size={18} />
              <input
                className="input"
                type="search"
                placeholder="Name, token, patient ID or mobile"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search the queue"
                maxLength={50}
              />
            </div>
            <input
              className="input fq-date"
              type="date"
              value={date}
              max={todayIso(BOOKING_MAX_DAYS)}
              onChange={(e) => setDate(e.target.value || todayIso())}
              aria-label="Queue date"
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm fq-refresh"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              {refreshing && <span className="fq-spinner" aria-hidden="true" />}
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error fq-error" role="alert">
            <div>
              <strong>{queue ? 'Could not refresh the list.' : 'Could not load the list.'}</strong> {error}
              {queue && updatedAt && (
                <small>
                  Showing the list as of {updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.
                </small>
              )}
            </div>
            <button type="button" className="btn btn-secondary btn-sm fq-refresh" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing && <span className="fq-spinner" aria-hidden="true" />}
              {refreshing ? 'Trying…' : 'Try again'}
            </button>
          </div>
        )}
        {!queue && !error && (
          <p className="fq-empty fq-loading">
            <span className="fq-spinner" aria-hidden="true" /> Loading…
          </p>
        )}
        {queue && rows.length === 0 && (
          <p className="fq-empty">
            {items.length === 0
              ? isToday
                ? 'No patients registered yet today.'
                : isFuture
                  ? 'No appointments booked for this day yet.'
                  : 'No patients were registered on this day.'
              : 'No patients match this filter.'}
          </p>
        )}

        {rows.length > 0 && (
          <ul className="fq-list">
            {rows.map((item) => {
              const t = timeLines(item, isToday);
              const place = positions.get(item.visitId);
              const feePending = item.registrationType === 'OP' && item.paymentStatus === 'UNPAID' && item.consultationFee > 0;
              const up = isToday ? nextIds.get(item.visitId) : undefined;
              const awayUntil = isToday && item.queueStatus === 'WAITING' ? notHereUntil(item) : null;
              return (
                <li
                  key={item.visitId}
                  className={`fq-item status-${item.queueStatus.toLowerCase()}${isAcute(item) ? ' fq-item-acute' : ''}${
                    up?.sendNow ? ' fq-item-sendnow' : ''
                  }${awayUntil ? ' fq-item-nothere' : ''}`}
                >
                  <button
                    type="button"
                    className={`fq-row status-${item.queueStatus.toLowerCase()}${isAcute(item) ? ' fq-row-acute' : ''}`}
                    onClick={() => open(item)}
                    title="Open on the Registration screen"
                  >
                    <span className={`fq-token ${isAcute(item) ? 'fq-token-acute' : ''}`}>{item.tokenNumber}</span>
                    <span className="fq-patient">
                      <strong>{item.patientName}</strong>
                      <small>
                        {item.patientNumber} · {item.ageYears ?? '-'} yrs / {GENDER_SHORT[item.gender] ?? '-'}
                        {item.mobileNumber && ` · ${formatMobile(item.mobileNumber)}`}
                      </small>
                      <span className="fq-tags">
                        {item.registrationType === 'EMERGENCY' && (
                          <span className={`fq-tag fq-triage-${item.triageLevel.toLowerCase() || 'none'}`}>
                            Emergency{item.triageLevel ? ` · ${item.triageLevel}` : ''}
                          </span>
                        )}
                        {item.registrationType === 'ICU' && <span className="fq-tag fq-tag-icu">ICU</span>}
                        <span className="fq-tag">{item.isReturning ? 'Return' : 'New'}</span>
                        {item.source === 'PHONE' && (
                          <span className="fq-tag fq-tag-phone" title="Booked over the phone; fee collected on arrival">
                            Phone appointment
                          </span>
                        )}
                        {item.isLabReview && (
                          <span className="fq-tag fq-tag-review" title="Back with lab results: same token, no fee">
                            {item.queueStatus === 'WAITING' || item.queueStatus === 'IN_CONSULTATION' ? 'Results review' : 'Results reviewed'}
                          </span>
                        )}
                        {item.isFollowUp && <span className="fq-tag fq-tag-follow">Free follow-up</span>}
                        {item.rescheduledFrom && (
                          <span className="fq-tag fq-tag-moved" title="Moved by the front desk from an earlier day">
                            Moved from {shortDate(item.rescheduledFrom)}
                          </span>
                        )}
                        {item.payerType === 'INSURANCE' && <span className="fq-tag">Insurance</span>}
                        {feePending && <span className="fq-tag fq-tag-warn">Fee pending</span>}
                      </span>
                    </span>
                    <span className="fq-doctor-cell">
                      <strong>{item.doctorName}</strong>
                      <small>{item.departmentName}</small>
                      {item.reasonForVisit && <small className="fq-reason">{item.reasonForVisit}</small>}
                    </span>
                    <span className="fq-time">
                      <span>{formatTime(item.registeredAt)}</span>
                      {t.lines.map((line) => (
                        <small key={line} className={t.level}>
                          {line}
                        </small>
                      ))}
                    </span>
                    <span className="fq-status">
                      <span className={`fq-pill pill-${item.queueStatus.toLowerCase()}`}>
                        {STATUS_LABEL[item.queueStatus]}
                        {item.queueStatus === 'ADMISSION_REQUESTED' && item.admissionType
                          ? ` · ${ADMISSION_LABEL[item.admissionType] ?? item.admissionType}`
                          : ''}
                      </span>
                      {item.queueStatus === 'BOOKED' && isToday && (
                        <small className="fq-line fq-checkin-hint">Open to check in &amp; collect fee</small>
                      )}
                      {up?.sendNow && <span className="fq-sendnow">Send in now</span>}
                      {awayUntil && (
                        <small className="fq-line fq-nothere">
                          Not here at {formatTime(item.notHereAt!)} · back in line {formatTime(awayUntil.toISOString())}
                        </small>
                      )}
                      {item.queueStatus === 'WAITING' && isToday && !up?.sendNow && !awayUntil && (
                        <small className="fq-line">
                          {isAcute(item) ? 'Seen first' : up ? 'Next for this doctor' : place ? `${ordinal(place)} in line` : ''}
                        </small>
                      )}
                      {item.queueStatus === 'WAITING' && isToday && etas.get(item.visitId) && (() => {
                        const eta = etas.get(item.visitId)!;
                        if (!eta.at)
                          return (
                            <small className="fq-eta fq-eta-unknown">
                              {eta.note}
                              <br />
                              Time not known
                            </small>
                          );
                        const mins = Math.max(0, Math.round((eta.at.getTime() - Date.now()) / 60000));
                        return (
                          <>
                            {eta.note && <small className="fq-eta fq-eta-away">{eta.note}</small>}
                            <small className="fq-eta" title="Based on the doctor’s average time per patient">
                              Expected ~{formatTime(eta.at)} {mins > 0 ? `(in ${duration(mins)})` : '(next)'}
                            </small>
                          </>
                        );
                      })()}
                      {item.labStatus === 'AWAITING_RESULTS' && <span className="fq-pill pill-awaiting_results">Awaiting lab results</span>}
                      {item.labStatus === 'AWAITING_RESULTS' && (item.labResultsExpectedAt || item.labResultsExpectedLater) && (
                        <small className="fq-line fq-lab-expected">
                          {item.labResultsExpectedLater
                            ? 'Results expected tomorrow or later'
                            : `Results expected ~${formatTime(item.labResultsExpectedAt!)}`}
                        </small>
                      )}
                      {item.labStatus === 'RESULTS_READY' && <span className="fq-pill pill-results_ready">Lab results ready</span>}
                      {item.labStatus === 'RESULTS_READY' && <small className="fq-line">Book a review when the patient comes</small>}
                      {item.followUpDate && <small className="fq-line">Review on {shortDate(item.followUpDate)}</small>}
                    </span>
                  </button>
                  {/* Today's patients still waiting: Change date / Cancel (the doctor hasn't started yet). */}
                  <span className="fq-item-actions">
                    {(isToday || isFuture) && (item.queueStatus === 'WAITING' || item.queueStatus === 'BOOKED') && !item.isLabReview && (
                      <VisitActions item={item} onChanged={changed} />
                    )}
                    {item.labStatus === 'AWAITING_RESULTS' && <LabResultActions item={item} onChanged={changed} />}
                    {up && !awayUntil && (
                      <button
                        type="button"
                        className="fq-mini-btn"
                        onClick={() => void markNotHere(item, true)}
                        disabled={marking === item.visitId}
                        title={`Called but not there: skip for ${NOT_HERE_MINUTES} min, then back in line`}
                      >
                        Not here
                      </button>
                    )}
                    {awayUntil && (
                      <button
                        type="button"
                        className="fq-mini-btn on"
                        onClick={() => void markNotHere(item, false)}
                        disabled={marking === item.visitId}
                        title="The patient is back: put them back in line now"
                      >
                        Here now
                      </button>
                    )}
                    {markError?.visitId === item.visitId && (
                      <small className="fq-mark-error" role="alert">
                        {markError.message}
                      </small>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
