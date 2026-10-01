/**
 * Permission codes shared with the backend (core.permissions).
 * The frontend only uses these to show/hide UI. The backend remains the
 * security boundary and must enforce every one of them.
 */
export const Permissions = {
  // Front Desk
  PATIENT_VIEW: 'PATIENT_VIEW',
  PATIENT_CREATE: 'PATIENT_CREATE',
  PATIENT_EDIT: 'PATIENT_EDIT',
  REGISTRATION_CREATE: 'REGISTRATION_CREATE',
  PAYMENT_COLLECT: 'PAYMENT_COLLECT',
  QUEUE_VIEW: 'QUEUE_VIEW',
  /** See every desk's collection (admins / accounts). Receptionists see only their own. */
  COLLECTION_VIEW_ALL: 'COLLECTION_VIEW_ALL',
  // Billing
  BILLING_VIEW: 'BILLING_VIEW',
  DISCHARGE_MANAGE: 'DISCHARGE_MANAGE',
  // Doctor
  ENCOUNTER_VIEW: 'ENCOUNTER_VIEW',
  ENCOUNTER_EDIT: 'ENCOUNTER_EDIT',
  PRESCRIPTION_CREATE: 'PRESCRIPTION_CREATE',
  // Nursing
  VITALS_EDIT: 'VITALS_EDIT',
  // Pharmacy
  DISPENSE_CREATE: 'DISPENSE_CREATE',
  // Lab
  LAB_ORDER_VIEW: 'LAB_ORDER_VIEW',
  LAB_RESULT_ENTRY: 'LAB_RESULT_ENTRY',
  // Payroll
  PAYROLL_VIEW: 'PAYROLL_VIEW',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * Sellable module codes, matching core.tenant_modules (licensing per hospital).
 * One code = one product that can be enabled or disabled for a hospital.
 */
export const Modules = {
  REGISTRATION: 'REGISTRATION', // Front Desk: registration + patient queue
  BILLING: 'BILLING', // Billing and discharge
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  PHARMACY: 'PHARMACY',
  LAB: 'LAB',
  PAYROLL: 'PAYROLL',
} as const;

export type ModuleCode = (typeof Modules)[keyof typeof Modules];
