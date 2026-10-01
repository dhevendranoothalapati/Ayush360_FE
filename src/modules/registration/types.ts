/**
 * Registration module contracts.
 * Mirrors registration.patients / registration.registrations (architecture doc §5).
 * Note: no tenantId anywhere — the server owns tenant scoping.
 */

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export type RecordStatus = 'ACTIVE' | 'INACTIVE';
export type RegistrationType = 'OP' | 'IP' | 'EMERGENCY';
export type VisitSource = 'WALK_IN' | 'ONLINE' | 'REFERRAL';
export type VisitStatus = 'REGISTERED' | 'CANCELLED' | 'COMPLETED';
export type QueueStatus = 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED' | 'ADMISSION_REQUESTED' | 'CONVERTED_TO_INPATIENT';
export type PaymentStatus = 'PAID' | 'UNPAID';
/** FOLLOW_UP = no fee collected (free follow-up visit within the hospital's follow-up window). */
export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'FOLLOW_UP';

export const VISIT_SOURCE_OPTIONS: { value: VisitSource; label: string }[] = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'ONLINE', label: 'Online appointment' },
  { value: 'REFERRAL', label: 'Referral' },
];

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
}

export interface Patient extends PatientInput {
  id: number;
  patientNumber: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  lastVisitDate: string | null;
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

export interface VisitInput extends PayerFields {
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

export interface Registration extends PayerFields {
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
  receipt: Receipt;
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
  state: '',
  postalCode: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  dobEstimated: false,
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
