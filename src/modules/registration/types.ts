/**
 * Registration module contracts.
 * Mirrors registration.patients / registration.registrations (architecture doc §5).
 * Note: no tenantId anywhere — the server owns tenant scoping.
 */

import type { DoctorAvailability } from '@/shared/utils/doctorAvailability';
import { DEFAULT_STATE } from '@/shared/utils/indianStates';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export type RecordStatus = 'ACTIVE' | 'INACTIVE';
export type RegistrationType = 'OP' | 'IP' | 'EMERGENCY' | 'ICU';
/**
 * EMERGENCY = casualty case, ICU = critical-care admission entry.
 * Both are "acute" visits: no consultation fee at the desk — charges go to the patient's bill,
 * an optional advance/deposit can be collected.
 */
export type VisitSource = 'WALK_IN' | 'ONLINE' | 'REFERRAL' | 'EMERGENCY' | 'ICU';
export const isAcuteSource = (s: VisitSource) => s === 'EMERGENCY' || s === 'ICU';
export type VisitStatus = 'REGISTERED' | 'CANCELLED' | 'COMPLETED';
export type QueueStatus = 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED' | 'ADMISSION_REQUESTED' | 'CONVERTED_TO_INPATIENT';
export type PaymentStatus = 'PAID' | 'UNPAID';
/** FOLLOW_UP = no fee collected (free follow-up visit within the hospital's follow-up window). */
export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'FOLLOW_UP';

export const VISIT_SOURCE_OPTIONS: { value: VisitSource; label: string }[] = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'ONLINE', label: 'Online appointment' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'ICU', label: 'ICU admission' },
];

export type BroughtBy = 'SELF' | 'RELATIVE' | 'POLICE' | 'AMBULANCE' | 'REFERRAL' | 'OTHER';
export const BROUGHT_BY_OPTIONS: { value: BroughtBy; label: string }[] = [
  { value: 'SELF', label: 'Self' },
  { value: 'RELATIVE', label: 'Relative / friend' },
  { value: 'AMBULANCE', label: 'Ambulance (108 / private)' },
  { value: 'POLICE', label: 'Police' },
  { value: 'REFERRAL', label: 'Referred by hospital / doctor' },
  { value: 'OTHER', label: 'Other / bystander' },
];

export type TriageLevel = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';
export const TRIAGE_OPTIONS: { value: TriageLevel; label: string; hint: string }[] = [
  { value: 'RED', label: 'Red', hint: 'Immediate' },
  { value: 'ORANGE', label: 'Orange', hint: 'Very urgent' },
  { value: 'YELLOW', label: 'Yellow', hint: 'Urgent' },
  { value: 'GREEN', label: 'Green', hint: 'Standard' },
];

export type IcuUnit = 'MICU' | 'SICU' | 'CCU' | 'NICU' | 'PICU' | 'HDU';
export const ICU_UNIT_OPTIONS: { value: IcuUnit; label: string }[] = [
  { value: 'MICU', label: 'MICU — Medical ICU' },
  { value: 'SICU', label: 'SICU — Surgical ICU' },
  { value: 'CCU', label: 'CCU — Cardiac care' },
  { value: 'NICU', label: 'NICU — Neonatal' },
  { value: 'PICU', label: 'PICU — Paediatric' },
  { value: 'HDU', label: 'HDU — High dependency' },
];

export type AdmissionSource = 'EMERGENCY' | 'OPD' | 'WARD' | 'OTHER_HOSPITAL' | 'DIRECT';
export const ADMISSION_SOURCE_OPTIONS: { value: AdmissionSource; label: string }[] = [
  { value: 'EMERGENCY', label: 'From Emergency' },
  { value: 'OPD', label: 'From OPD' },
  { value: 'WARD', label: 'Transfer from ward' },
  { value: 'OTHER_HOSPITAL', label: 'Referred from another hospital' },
  { value: 'DIRECT', label: 'Direct admission' },
];

/** Extra details for Emergency and ICU entries (stored on the visit). */
export interface AcuteFields {
  /** Arrival (ER) or admission (ICU) date-time, yyyy-MM-ddTHH:mm. */
  arrivalTime: string;
  broughtBy: BroughtBy | '';
  attendantName: string;
  attendantPhone: string;
  triageLevel: TriageLevel | '';
  /** Medico-legal case (accident, assault, poisoning, burns…). */
  isMlc: boolean;
  policeStation: string;
  /** FIR / GD / police intimation number. */
  firNumber: string;
  icuUnit: IcuUnit | '';
  bedNumber: string;
  admissionSource: AdmissionSource | '';
  referredFrom: string;
}

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  FOLLOW_UP: 'Free follow-up',
};

/** Modes the receptionist can choose when a fee is due. */
export const PAYMENT_MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
];

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  WAITING: 'Waiting',
  IN_CONSULTATION: 'In consultation',
  COMPLETED: 'Completed',
  ADMISSION_REQUESTED: 'Admission requested',
  CONVERTED_TO_INPATIENT: 'Converted to inpatient',
};

/** Fields the receptionist captures for a patient (master record). */
export interface PatientInput {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: Gender | '';
  dateOfBirth: string;
  mobileNumber: string;
  email: string;
  bloodGroup: BloodGroup | '';
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  /** True when the DOB was derived from an age the patient told us (no exact birth date). */
  dobEstimated: boolean;
  /**
   * Aadhaar typed at the desk (12 digits, no spaces). Only sent when entered or changed;
   * empty = keep what is already on file. The server stores it encrypted and never sends it back.
   */
  aadhaarNumber: string;
}

export interface Patient extends PatientInput {
  id: number;
  patientNumber: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  lastVisitDate: string | null;
  /** "XXXX XXXX 1234" when an Aadhaar is on file, otherwise "". The full number is never sent to the browser. */
  aadhaarMasked: string;
}

export interface Department {
  id: number;
  code: string;
  name: string;
}

export interface Doctor {
  id: number;
  name: string;
  departmentId: number;
  qualification: string;
  consultationFee: number;
}

export type PayerType = 'SELF' | 'INSURANCE';
export type PolicyHolderRelation = 'SELF' | 'SPOUSE' | 'CHILD' | 'PARENT' | 'OTHER';

export const PAYER_TYPE_LABEL: Record<PayerType, string> = { SELF: 'Self (patient pays)', INSURANCE: 'Insurance' };

export const RELATION_OPTIONS: { value: PolicyHolderRelation; label: string }[] = [
  { value: 'SELF', label: 'Self' },
  { value: 'SPOUSE', label: 'Spouse' },
  { value: 'CHILD', label: 'Child' },
  { value: 'PARENT', label: 'Parent' },
  { value: 'OTHER', label: 'Other' },
];

/** Suggestions only — the receptionist can type any insurer or scheme. Later: hospital master list. */
export const INSURER_SUGGESTIONS = [
  'Star Health Insurance',
  'HDFC ERGO Health',
  'ICICI Lombard',
  'Niva Bupa Health',
  'Care Health Insurance',
  'Bajaj Allianz General',
  'Aditya Birla Health',
  'New India Assurance',
  'United India Insurance',
  'National Insurance',
  'Oriental Insurance',
  'Tata AIG',
  'SBI General',
  'Ayushman Bharat (PM-JAY)',
  'CGHS',
  'ECHS',
];

/** Who pays for the visit. Insurance fields are used only when payerType = INSURANCE. */
export interface PayerFields {
  payerType: PayerType;
  insurerName: string;
  tpaName: string;
  policyNumber: string;
  memberId: string;
  policyHolderName: string;
  policyHolderRelation: PolicyHolderRelation | '';
  policyValidUntil: string;
}

export interface VisitInput extends PayerFields, AcuteFields {
  /** Advance / deposit collected now for Emergency or ICU (digits; '' = none). */
  depositAmount: string;
  departmentId: number | '';
  doctorId: number | '';
  registrationType: RegistrationType;
  source: VisitSource;
  reasonForVisit: string;
  messageConsent: boolean;
}

export interface PaymentInput {
  mode: PaymentMode;
  amount: number;
  referenceNumber?: string;
}

/**
 * Either patientId (existing) or patient (new) must be provided.
 * patientId + patient also updates the existing patient's details.
 * payment is omitted when the fee quote is 0 (free follow-up).
 */
export interface CreateRegistrationRequest {
  patientId?: number;
  patient?: PatientInput;
  visit: VisitInput;
  payment?: PaymentInput;
}

export interface Registration extends PayerFields, AcuteFields {
  /** Advance collected at registration (Emergency / ICU). Charges are billed later. */
  depositAmount: number;
  /** Hospital MLC register number, generated by the server when isMlc. */
  mlcNumber: string | null;
  id: number;
  registrationNumber: string;
  registrationDate: string;
  registrationType: RegistrationType;
  patientId: number;
  departmentId: number;
  departmentName: string;
  doctorId: number;
  doctorName: string;
  source: VisitSource;
  reasonForVisit: string;
  messageConsent: boolean;
  visitStatus: VisitStatus;
  queueStatus: QueueStatus;
  tokenNumber: string;
  consultationFee: number;
  paymentStatus: PaymentStatus;
  /** True when no fee was charged because it is a follow-up within the hospital's window. */
  isFollowUp: boolean;
  /** Registration number of the paid visit this follow-up belongs to. */
  followUpOf: string | null;
  createdAt: string;
}

export interface Receipt {
  receiptNumber: string;
  amount: number;
  mode: PaymentMode;
  referenceNumber: string | null;
  paidAt: string;
}

export interface CreateRegistrationResponse {
  isNewPatient: boolean;
  patient: Patient;
  registration: Registration;
  /** null for emergency visits (fee is billed later). */
  receipt: Receipt | null;
}

export const EMPTY_PATIENT: PatientInput = {
  firstName: '',
  middleName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  mobileNumber: '',
  email: '',
  bloodGroup: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: DEFAULT_STATE,
  postalCode: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  dobEstimated: false,
  aadhaarNumber: '',
};

export const EMPTY_ACUTE: AcuteFields = {
  arrivalTime: '',
  broughtBy: '',
  attendantName: '',
  attendantPhone: '',
  triageLevel: '',
  isMlc: false,
  policeStation: '',
  firNumber: '',
  icuUnit: '',
  bedNumber: '',
  admissionSource: '',
  referredFrom: '',
};

export const EMPTY_VISIT: VisitInput = {
  departmentId: '',
  doctorId: '',
  registrationType: 'OP',
  source: 'WALK_IN',
  reasonForVisit: '',
  messageConsent: false,
  payerType: 'SELF',
  insurerName: '',
  tpaName: '',
  policyNumber: '',
  memberId: '',
  policyHolderName: '',
  policyHolderRelation: '',
  policyValidUntil: '',
  ...EMPTY_ACUTE,
  depositAmount: '',
};


export const EMPTY_INSURANCE: Omit<PayerFields, 'payerType'> = {
  insurerName: '',
  tpaName: '',
  policyNumber: '',
  memberId: '',
  policyHolderName: '',
  policyHolderRelation: '',
  policyValidUntil: '',
};

/** Front desk dashboard numbers for today (current hospital only). */
export interface TodaySummary {
  /** Hospital-wide counts (all desks). */
  registeredToday: number;
  waiting: number;
  newPatients: number;
  /** Fees collected today by the signed-in user (their cash drawer / shift). */
  myCollectedToday: number;
  /** Fees collected today by all desks. null unless the user has COLLECTION_VIEW_ALL. */
  totalCollectedToday: number | null;
}

/** Server-calculated consultation fee for a patient + doctor (follow-up rules applied). */
export interface FeeQuote {
  doctorId: number;
  /** Amount to collect now. 0 for a free follow-up. */
  fee: number;
  /** The doctor's normal consultation fee. */
  standardFee: number;
  isFollowUp: boolean;
  /** Paid visit the follow-up is linked to. */
  followUpOf: string | null;
  followUpOfDate: string | null;
  /** Last day the follow-up is free. */
  freeUntil: string | null;
  /** Hospital setting: free follow-up window in days (0 = disabled). */
  followUpFreeDays: number;
}

export interface OpenVisit {
  registration: Registration;
  receipt: Receipt | null;
}

/** Everything the front desk needs after picking a patient from search. */
export interface PatientContext {
  patient: Patient;
  /** All of today's visits that are still open (waiting / in consultation), newest first. */
  openVisits: OpenVisit[];
  /** Visit history, newest first (includes today's visits; server returns the latest 20). */
  visits: Registration[];
  /** Most recent visit that is not open today, for display. */
  lastVisit: Registration | null;
}

// ---------------------------------------------------------------- patient queue (GET /registration/queue)

/** After the consultation: tests still pending, or all results in. '' = no tests / not seen yet. */
export type QueueLabStatus = '' | 'AWAITING_RESULTS' | 'RESULTS_READY';

/** One patient in the front desk queue. Status only: no diagnosis or other clinical details. */
export interface FrontDeskQueueItem {
  visitId: number;
  tokenNumber: string;
  visitNumber: string;
  registrationType: RegistrationType;
  patientId: number;
  patientNumber: string;
  patientName: string;
  gender: string;
  ageYears: number | null;
  mobileNumber: string;
  doctorId: number;
  doctorName: string;
  departmentName: string;
  reasonForVisit: string;
  registeredAt: string;
  queueStatus: QueueStatus;
  /** RED, ORANGE, YELLOW, GREEN or '' */
  triageLevel: string;
  isFollowUp: boolean;
  isReturning: boolean;
  paymentStatus: PaymentStatus;
  consultationFee: number;
  payerType: string;
  /** When the doctor started / finished the consultation. */
  startedAt: string | null;
  completedAt: string | null;
  labStatus: QueueLabStatus;
  /** Review date the doctor asked for (yyyy-mm-dd), or '': the desk can book it. */
  followUpDate: string;
  /** WARD, ICU, HDU, DAY_CARE when the doctor requested admission, else ''. */
  admissionType: string;
}

export interface FrontDeskQueueCounts {
  total: number;
  waiting: number;
  inConsultation: number;
  completed: number;
  admissionRequested: number;
  awaitingLabResults: number;
  emergency: number;
}

/** A doctor in the day's list: available or paused (reason, expected back) and their pace. */
export interface FrontDeskDoctor {
  doctorId: number;
  name: string;
  availability: DoctorAvailability;
  /** Average minutes per patient. */
  avgConsultMinutes: number;
  /** TODAY (3+ seen today), RECENT (last 30 days) or DEFAULT (no history: 10 min). */
  avgBasis: 'TODAY' | 'RECENT' | 'DEFAULT';
  seenToday: number;
  /** First consultation of the day; null = OPD not started yet. */
  firstStartedAt: string | null;
  lastCompletedAt: string | null;
}

export interface FrontDeskQueue {
  date: string;
  counts: FrontDeskQueueCounts;
  items: FrontDeskQueueItem[];
  doctors: FrontDeskDoctor[];
}

// ---------------------------------------------------------------- inpatients (GET /registration/inpatients)

export type InpatientStatus = 'ADMITTED' | 'AWAITING_ADMISSION';

/** A patient currently admitted (any admission date), or one the doctor asked to admit. */
export interface InpatientItem {
  visitId: number;
  visitNumber: string;
  tokenNumber: string;
  status: InpatientStatus;
  /** IP / ICU when admitted; OP when the doctor requested admission from the OPD. */
  registrationType: RegistrationType;
  patientId: number;
  patientNumber: string;
  patientName: string;
  gender: string;
  ageYears: number | null;
  mobileNumber: string;
  doctorName: string;
  departmentName: string;
  /** Admitted at, or when the doctor requested admission. */
  since: string;
  /** ICU unit (MICU, SICU…) or requested admission type (WARD, ICU, HDU, DAY_CARE), or ''. */
  unit: string;
  /** As typed at the desk, until the bed board is built. */
  bedNumber: string;
  payerType: string;
  insurerName: string;
  isMlc: boolean;
  /** Deposits collected so far. */
  advancePaid: number;
  /** null until billing is built. */
  amountPending: number | null;
}

export interface InpatientList {
  counts: { admitted: number; icu: number; ward: number; awaitingAdmission: number };
  items: InpatientItem[];
}
