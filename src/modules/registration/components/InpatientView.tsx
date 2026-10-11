import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/core/authentication/AuthContext';
import { Icon, type IconName } from '@/shared/components/Icons';
import { formatCurrency, formatMobile, formatTime } from '@/shared/utils/format';
import { registrationApi } from '../api/registrationApi';
import type { InpatientItem, InpatientList } from '../types';

/**
 * Patient queue → Inpatients: everyone currently admitted, whatever day they were admitted, plus patients the
 * doctor asked to admit (they need a bed and an advance). Wards / rooms / beds and billing are not built yet:
 * the bed is what the desk typed at registration and "Pending" stays empty until billing exists.
 */

type Filter = 'ALL' | 'ICU' | 'WARD' | 'AWAITING';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ICU', label: 'ICU' },
  { value: 'WARD', label: 'Ward' },
  { value: 'AWAITING', label: 'Awaiting admission' },
];

const UNIT_LABEL: Record<string, string> = {
  MICU: 'MICU',
  SICU: 'SICU',
  CCU: 'CCU',
  NICU: 'NICU',
  PICU: 'PICU',
  HDU: 'HDU',
  WARD: 'Ward',
  ICU: 'ICU',
  DAY_CARE: 'Day care',
};
const GENDER_SHORT: Record<string, string> = { MALE: 'M', FEMALE: 'F', OTHER: 'O' };

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Day 1 = the day of admission. */
function dayOfStay(iso: string): number {
  const start = new Date(iso);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1);
}

function matches(i: InpatientItem, f: Filter): boolean {
  if (f === 'ALL') return true;
  if (f === 'AWAITING') return i.status === 'AWAITING_ADMISSION';
  if (f === 'ICU') return i.status === 'ADMITTED' && i.registrationType === 'ICU';
  return i.status === 'ADMITTED' && i.registrationType === 'IP';
}

export function InpatientView() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [list, setList] = useState<InpatientList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await registrationApi.getInpatients());
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load inpatients.');
    }
  }, []);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([load(), new Promise((r) => window.setTimeout(r, 500))]);
    setRefreshing(false);
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return (list?.items ?? []).filter(
      (i) =>
        matches(i, filter) &&
        (!q ||
          i.patientName.toLowerCase().includes(q) ||
          i.patientNumber.toLowerCase().includes(q) ||
          i.visitNumber.toLowerCase().includes(q) ||
          i.bedNumber.toLowerCase().includes(q) ||
          (digits.length >= 3 && i.mobileNumber.includes(digits))),
    );
  }, [list, filter, search]);

  const counts = list?.counts;
  const advanceTotal = (list?.items ?? []).filter((i) => i.status === 'ADMITTED').reduce((sum, i) => sum + i.advancePaid, 0);

  const stats: { label: string; value: number | undefined; icon: IconName; filter: Filter }[] = [
    { label: 'Admitted', value: counts?.admitted, icon: 'discharge', filter: 'ALL' },
    { label: 'In ICU', value: counts?.icu, icon: 'stethoscope', filter: 'ICU' },
    { label: 'In ward', value: counts?.ward, icon: 'user', filter: 'WARD' },
    { label: 'Awaiting admission', value: counts?.awaitingAdmission, icon: 'queue', filter: 'AWAITING' },
  ];

  return (
    <>
      <section className="fd-hero" aria-label="Inpatients overview">
        <div className="fd-hero-text">
          <span className="fd-hero-kicker">Inpatients · {user.tenant.name}</span>
          <h1 className="fd-hero-title">Admitted patients</h1>
          <p className="fq-hero-sub">
            {counts ? `${counts.admitted} in hospital now` : 'Loading…'}
            {counts && counts.awaitingAdmission > 0 && ` · ${counts.awaitingAdmission} waiting for a bed`}
          </p>
          {list && list.items.length > 0 && (
            <div className="fq-summary">
              <span>
                Advance collected <b>{formatCurrency(advanceTotal)}</b>
              </span>
              <span>
                Amount pending <b>–</b>
              </span>
            </div>
          )}
        </div>
        <div className="fd-stats">
          {stats.map((s) => (
            <button
              type="button"
              key={s.label}
              className={filter === s.filter && s.filter !== 'ALL' ? 'fd-stat fq-stat on' : 'fd-stat fq-stat'}
              onClick={() => setFilter(filter === s.filter ? 'ALL' : s.filter)}
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

      <div className="card fq-card">
        <div className="fq-toolbar">
          <div className="fq-filters" role="tablist" aria-label="Filter inpatients">
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
                {f.value === 'AWAITING' && counts && counts.awaitingAdmission > 0 && (
                  <span className="fq-chip-count">{counts.awaitingAdmission}</span>
                )}
              </button>
            ))}
          </div>
          <div className="fq-tools">
            <div className="fq-search">
              <Icon name="search" size={18} />
              <input
                className="input"
                type="search"
                placeholder="Name, patient ID, IP no., bed or mobile"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search inpatients"
                maxLength={50}
              />
            </div>
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
              <strong>{list ? 'Could not refresh the list.' : 'Could not load the list.'}</strong> {error}
              {list && updatedAt && (
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
        {!list && !error && (
          <p className="fq-empty fq-loading">
            <span className="fq-spinner" aria-hidden="true" /> Loading…
          </p>
        )}
        {list && rows.length === 0 && (
          <p className="fq-empty">{list.items.length === 0 ? 'No patients are admitted right now.' : 'No patients match this filter.'}</p>
        )}

        {rows.length > 0 && (
          <ul className="fq-list">
            {rows.map((i) => {
              const awaiting = i.status === 'AWAITING_ADMISSION';
              const unit = UNIT_LABEL[i.unit] ?? i.unit;
              return (
                <li key={i.visitId}>
                  <button
                    type="button"
                    className={`fq-row ip-row${awaiting ? ' ip-row-awaiting' : ''}${i.registrationType === 'ICU' ? ' ip-row-icu' : ''}`}
                    onClick={() => navigate('/registration', { state: { patientId: i.patientId } })}
                    title="Open on the Registration screen"
                  >
                    <span className="ip-bed">
                      <small>Bed</small>
                      <strong>{awaiting ? '–' : i.bedNumber || '–'}</strong>
                      <small>{unit || (i.registrationType === 'IP' ? 'Ward' : '')}</small>
                    </span>
                    <span className="fq-patient">
                      <strong>{i.patientName}</strong>
                      <small>
                        {i.patientNumber} · {i.ageYears ?? '-'} yrs / {GENDER_SHORT[i.gender] ?? '-'}
                        {i.mobileNumber && ` · ${formatMobile(i.mobileNumber)}`}
                      </small>
                      <span className="fq-tags">
                        <span className="fq-tag">{i.visitNumber}</span>
                        {i.registrationType === 'ICU' && <span className="fq-tag fq-tag-icu">ICU</span>}
                        {i.payerType === 'INSURANCE' && <span className="fq-tag">{i.insurerName || 'Insurance'}</span>}
                        {i.isMlc && <span className="fq-tag fq-tag-warn">MLC</span>}
                      </span>
                    </span>
                    <span className="fq-doctor-cell">
                      <strong>{i.doctorName}</strong>
                      <small>{i.departmentName}</small>
                    </span>
                    <span className="fq-time">
                      <span>{awaiting ? `Requested ${dayMonth(i.since)}` : `Admitted ${dayMonth(i.since)}`}</span>
                      <small>{formatTime(i.since)}</small>
                      {!awaiting && <small className="ip-day">Day {dayOfStay(i.since)}</small>}
                    </span>
                    <span className="fq-status">
                      <span className={`fq-pill ${awaiting ? 'pill-waiting' : 'pill-admission_requested'}`}>
                        {awaiting ? `Awaiting admission${unit ? ` · ${unit}` : ''}` : 'Admitted'}
                      </span>
                      <span className="ip-money">
                        <small>Advance</small> <b>{formatCurrency(i.advancePaid)}</b>
                      </span>
                      <span className="ip-money">
                        <small>Pending</small> <b>{i.amountPending === null ? '–' : formatCurrency(i.amountPending)}</b>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
