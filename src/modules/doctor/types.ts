/**
 * Doctor module contracts. Mirrors the HMS API (/api/doctor/*, Consultations/ConsultationDtos.cs).
 * No tenantId anywhere: the server scopes everything to the signed-in user's hospital,
 * and doctors only ever get their own patients.
 */

/** BOOKED (appointment not checked in) never reaches the doctor's queue; listed so the types match the front desk's. */
export type QueueStatus = 'BOOKED' | 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED' | 'ADMISSION_REQUESTED' | 'CONVERTED_TO_INPATIENT';
export type RegistrationType = 'OP' | 'IP' | 'EMERGENCY' | 'ICU';
export type EncounterStatus = 'IN_PROGRESS' | 'COMPLETED';
export type MedicineTiming = 'BEFORE_FOOD' | 'AFTER_FOOD' | 'WITH_FOOD' | 'EMPTY_STOMACH' | 'BEDTIME';
export type AdmissionType = 'WARD' | 'ICU' | 'HDU' | 'DAY_CARE';

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  BOOKED: 'Booked',
  WAITING: 'Waiting',
  IN_CONSULTATION: 'In consultation',
  COMPLETED: 'Completed',
  ADMISSION_REQUESTED: 'Admission requested',
  CONVERTED_TO_INPATIENT: 'Admitted',
};

/** After the consultation: are ordered tests still pending? (RESULTS_READY once the Laboratory module enters results.) */
export type LabStatus = '' | 'AWAITING_RESULTS' | 'RESULTS_READY';

export const LAB_STATUS_LABEL: Record<Exclude<LabStatus, ''>, string> = {
  AWAITING_RESULTS: 'Awaiting lab results',
  RESULTS_READY: 'Lab results ready for review',
};

/** Lab status of a consultation from its orders (same rule as the server). */
export function labStatusOf(queueStatus: QueueStatus, orders: { status?: string }[]): LabStatus {
  if (queueStatus !== 'COMPLETED' && queueStatus !== 'ADMISSION_REQUESTED') return '';
  const active = orders.filter((o) => o.status !== 'CANCELLED');
  if (!active.length) return '';
  return active.some((o) => !o.status || o.status === 'ORDERED' || o.status === 'SAMPLE_COLLECTED')
    ? 'AWAITING_RESULTS'
    : 'RESULTS_READY';
}

export const GENDER_SHORT: Record<string, string> = { MALE: 'M', FEMALE: 'F', OTHER: 'O' };

/** Morning-afternoon-night patterns used in Indian prescriptions; any other text can be typed too. */
export const FREQUENCY_OPTIONS = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-0', '0-1-1', '1-1-1', '1-1-1-1', 'SOS', 'STAT', 'Once a week'];

export const TIMING_OPTIONS: { value: MedicineTiming; label: string }[] = [
  { value: 'AFTER_FOOD', label: 'After food' },
  { value: 'BEFORE_FOOD', label: 'Before food' },
  { value: 'WITH_FOOD', label: 'With food' },
  { value: 'EMPTY_STOMACH', label: 'Empty stomach' },
  { value: 'BEDTIME', label: 'At bedtime' },
];

export const ADMISSION_TYPE_OPTIONS: { value: AdmissionType; label: string }[] = [
  { value: 'WARD', label: 'Ward' },
  { value: 'ICU', label: 'ICU' },
  { value: 'HDU', label: 'HDU' },
  { value: 'DAY_CARE', label: 'Day care' },
];

// ---------------------------------------------------------------- queue

export interface QueueItem {
  visitId: number;
  tokenNumber: string;
  visitNumber: string;
  registrationType: RegistrationType;
  patientId: number;
  patientNumber: string;
  patientName: string;
  gender: string;
  ageYears: number | null;
  reasonForVisit: string;
  registeredAt: string;
  queueStatus: QueueStatus;
  isFollowUp: boolean;
  isReturning: boolean;
  triageLevel: string;
  doctorName: string;
  encounterId: number | null;
  startedAt: string | null;
  completedAt: string | null;
  labStatus: LabStatus;
  /** e.g. "Dengue fever [classical dengue] (A90)"; '' until the doctor adds one. */
  primaryDiagnosis: string;
  medicineCount: number;
  testCount: number;
  /** yyyy-mm-dd review date the doctor set, or '' */
  followUpDate: string;
  /** Previous visit at this hospital (returning patients). */
  lastVisitAt: string | null;
  /** Its primary diagnosis, else the reason given at the desk. */
  lastVisitSummary: string;
}

export interface QueueCounts {
  total: number;
  waiting: number;
  inConsultation: number;
  completed: number;
  admissionRequested: number;
  awaitingLabResults: number;
}

export interface DoctorQueue {
  date: string;
  doctorName: string | null;
  /** false for admins etc.: they see every doctor's patients but can't write consultations. */
  isDoctor: boolean;
  counts: QueueCounts;
  items: QueueItem[];
}

// ---------------------------------------------------------------- consultation

export interface Vitals {
  temperatureF: number | null;
  pulse: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  respiratoryRate: number | null;
  spo2: number | null;
  weightKg: number | null;
  heightCm: number | null;
}

export interface Diagnosis {
  /** '' for free text. */
  icd10Code: string;
  description: string;
  isPrimary: boolean;
}

export interface PrescriptionLine {
  medicineId: number | null;
  medicineName: string;
  strength: string;
  form: string;
  dose: string;
  frequency: string;
  timing: MedicineTiming | '';
  durationDays: number | null;
  instructions: string;
}

export interface LabOrder {
  testCode: string;
  testName: string;
  notes: string;
  status?: string;
}

export interface EncounterInput {
  chiefComplaints: string;
  history: string;
  pastHistory: string;
  allergies: string;
  examination: string;
  advice: string;
  /** yyyy-mm-dd or '' */
  followUpDate: string;
  vitals: Vitals;
  diagnoses: Diagnosis[];
  prescriptions: PrescriptionLine[];
  labOrders: LabOrder[];
  admissionRequested: boolean;
  admissionType: AdmissionType | '';
  admissionReason: string;
}

export interface Encounter extends EncounterInput {
  id: number;
  status: EncounterStatus;
  startedAt: string;
  completedAt: string | null;
  /** Set when the doctor corrected it after completing (allowed until midnight of the visit day). */
  lastEditedAt: string | null;
  lastEditedBy: string;
}

/** Another visit of the same patient, with its consultation summary if there was one. */
export interface PastVisit {
  visitId: number;
  visitNumber: string;
  date: string;
  registrationType: RegistrationType;
  doctorName: string;
  departmentName: string;
  reasonForVisit: string;
  /** '' = no consultation recorded */
  consultationStatus: EncounterStatus | '';
  diagnoses: string;
  medicineCount: number;
  testCount: number;
}

export interface Consultation {
  patient: {
    id: number;
    patientNumber: string;
    name: string;
    gender: string;
    ageYears: number | null;
    dateOfBirth: string;
    dobEstimated: boolean;
    bloodGroup: string;
    mobileNumber: string;
  };
  visit: {
    id: number;
    visitNumber: string;
    tokenNumber: string;
    visitDate: string;
    registeredAt: string;
    registrationType: RegistrationType;
    departmentName: string;
    reasonForVisit: string;
    queueStatus: QueueStatus;
    visitStatus: string;
    isFollowUp: boolean;
    payerType: string;
    insurerName: string;
    triageLevel: string;
  };
  doctor: {
    id: number;
    name: string;
    qualification: string;
    specialization: string;
    registrationNumber: string;
    medicalCouncil: string;
    departmentName: string;
  };
  encounter: Encounter | null;
  canStart: boolean;
  canEdit: boolean;
  history: PastVisit[];
}

/** What this doctor last prescribed for a diagnosis (used to pre-fill the prescription). */
export interface PrescriptionSuggestion {
  lastUsedAt: string | null;
  visitNumber: string;
  prescriptions: PrescriptionLine[];
}

// ---------------------------------------------------------------- pick lists

export interface Icd10Entry {
  code: string;
  description: string;
}

export interface LabTestEntry {
  code: string;
  name: string;
  category: string;
}

export interface Medicine {
  id: number;
  name: string;
  genericName: string;
  strength: string;
  form: string;
  defaultDose: string;
  defaultFrequency: string;
}

export const EMPTY_VITALS: Vitals = {
  temperatureF: null,
  pulse: null,
  systolicBp: null,
  diastolicBp: null,
  respiratoryRate: null,
  spo2: null,
  weightKg: null,
  heightCm: null,
};

export const EMPTY_ENCOUNTER_INPUT: EncounterInput = {
  chiefComplaints: '',
  history: '',
  pastHistory: '',
  allergies: '',
  examination: '',
  advice: '',
  followUpDate: '',
  vitals: EMPTY_VITALS,
  diagnoses: [],
  prescriptions: [],
  labOrders: [],
  admissionRequested: false,
  admissionType: '',
  admissionReason: '',
};
