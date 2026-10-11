/**
 * Doctor availability (shared by the Doctor module and the Front Desk queue).
 * A doctor can pause seeing OPD patients with a reason; the front desk sees it and tells waiting patients.
 * Codes match the HMS API (doctor.doctor_breaks.reason).
 */
export type AwayReason = 'OPERATION_THEATRE' | 'EMERGENCY_CALL' | 'WARD_ROUNDS' | 'LUNCH_BREAK' | 'MEETING' | 'OTHER';

export interface DoctorAvailability {
  isAway: boolean;
  /** '' when available. */
  reason: AwayReason | '';
  note: string;
  since: string | null;
  /** null = not sure when. */
  expectedBackAt: string | null;
}

export const AWAY_REASONS: { value: AwayReason; label: string; short: string }[] = [
  { value: 'OPERATION_THEATRE', label: 'In operation theatre', short: 'In OT' },
  { value: 'EMERGENCY_CALL', label: 'Emergency patient call', short: 'Emergency call' },
  { value: 'WARD_ROUNDS', label: 'Ward rounds (inpatients)', short: 'Ward rounds' },
  { value: 'LUNCH_BREAK', label: 'Lunch break', short: 'Lunch break' },
  { value: 'MEETING', label: 'Meeting', short: 'Meeting' },
  { value: 'OTHER', label: 'Other', short: 'Away' },
];

export function awayLabel(reason: string, short = false): string {
  const r = AWAY_REASONS.find((x) => x.value === reason);
  return r ? (short ? r.short : r.label) : 'Away';
}

export const AVAILABLE: DoctorAvailability = { isAway: false, reason: '', note: '', since: null, expectedBackAt: null };
