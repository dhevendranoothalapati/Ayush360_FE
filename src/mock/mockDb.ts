/**
 * In-browser stand-in for the PostgreSQL schemas (core.*, registration.*).
 * Used only when VITE_USE_MOCK_API=true. Persisted to localStorage so data
 * survives a page refresh. Every tenant-owned row carries tenantId, exactly
 * like the real tables — the mock server filters on it.
 */
import { Modules, Permissions, type ModuleCode, type Permission } from '@/core/permissions/permissions';
import type { Department, Doctor, Patient, PayerFields, Receipt, Registration } from '@/modules/registration/types';
import { EMPTY_ACUTE } from '@/modules/registration/types';

export interface DbTenant {
  id: number;
  code: string;
  name: string;
  city: string;
  enabledModules: ModuleCode[];
  /** Hospital setting: a revisit to the same doctor within this many days is free (0 = off). */
  followUpFreeDays: number;
}
export interface DbUser {
  id: number;
  tenantId: number;
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  status: 'ACTIVE' | 'INACTIVE';
}
export type Tenanted<T> = T & { tenantId: number };

export interface MockDb {
  tenants: DbTenant[];
  users: DbUser[];
  rolePermissions: Record<string, Permission[]>;
  departments: Tenanted<Department>[];
  doctors: Tenanted<Doctor>[];
  patients: Tenanted<Patient>[];
  registrations: Tenanted<Registration>[];
  receipts: Tenanted<Receipt & { registrationId: number; collectedByUserId?: number }>[];
  sessions: Record<string, number>; // token -> userId
  sequences: Record<string, number>;
}

const STORAGE_KEY = 'ayush360.mockdb.v9';

function iso(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function seedPatient(
  tenantId: number,
  id: number,
  patientNumber: string,
  p: Partial<Patient> & Pick<Patient, 'firstName' | 'lastName' | 'gender' | 'mobileNumber' | 'addressLine1'>,
  lastVisitDaysAgo: number | null,
): Tenanted<Patient> {
  return {
    tenantId,
    id,
    patientNumber,
    middleName: '',
    dateOfBirth: '',
    email: '',
    bloodGroup: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    dobEstimated: false,
    status: 'ACTIVE',
    createdAt: iso(120),
    updatedAt: iso(30),
    lastVisitDate: lastVisitDaysAgo === null ? null : iso(lastVisitDaysAgo),
    ...p,
  };
}

function pastVisit(
  tenantId: number,
  id: number,
  patientId: number,
  registrationNumber: string,
  daysAgo: number,
  departmentId: number,
  departmentName: string,
  doctorId: number,
  doctorName: string,
  fee: number,
  reason: string,
  payer: Partial<PayerFields> = {},
): Tenanted<Registration> {
  return {
    tenantId,
    id,
    registrationNumber,
    registrationDate: iso(daysAgo),
    registrationType: 'OP',
    patientId,
    departmentId,
    departmentName,
    doctorId,
    doctorName,
    source: 'WALK_IN',
    reasonForVisit: reason,
    messageConsent: false,
    visitStatus: 'COMPLETED',
    queueStatus: 'COMPLETED',
    tokenNumber: 'A-001',
    consultationFee: fee,
    paymentStatus: 'PAID',
    isFollowUp: false,
    followUpOf: null,
    payerType: 'SELF',
    insurerName: '',
    tpaName: '',
    policyNumber: '',
    memberId: '',
    policyHolderName: '',
    policyHolderRelation: '',
    policyValidUntil: '',
    ...payer,
    ...EMPTY_ACUTE,
    depositAmount: 0,
    mlcNumber: null,
    createdAt: iso(daysAgo),
  };
}

function seed(): MockDb {
  const deptNames: [string, string][] = [
    ['GEN', 'General Medicine'],
    ['CARD', 'Cardiology'],
    ['ORTH', 'Orthopedics'],
    ['ENT', 'ENT'],
    ['PED', 'Pediatrics'],
    ['GYN', 'Gynecology'],
    ['DERM', 'Dermatology'],
    ['ER', 'Emergency / Casualty'],
    ['ICU', 'Critical Care (ICU)'],
  ];

  const departments: Tenanted<Department>[] = [];
  [10, 20].forEach((tenantId) =>
    deptNames.forEach(([code, name], i) => departments.push({ tenantId, id: tenantId * 100 + i + 1, code, name })),
  );

  const doctors: Tenanted<Doctor>[] = [
    // Sunrise (tenant 10)
    { tenantId: 10, id: 1001, name: 'Dr. Meera Shah', departmentId: 1001, qualification: 'MBBS, MD', consultationFee: 500 },
    { tenantId: 10, id: 1002, name: 'Dr. Anil Kapoor', departmentId: 1001, qualification: 'MBBS', consultationFee: 400 },
    { tenantId: 10, id: 1003, name: 'Dr. Vikram Iyer', departmentId: 1002, qualification: 'MD, DM Cardiology', consultationFee: 900 },
    { tenantId: 10, id: 1004, name: 'Dr. Sneha Patil', departmentId: 1003, qualification: 'MS Ortho', consultationFee: 700 },
    { tenantId: 10, id: 1005, name: 'Dr. Farhan Ali', departmentId: 1004, qualification: 'MS ENT', consultationFee: 600 },
    { tenantId: 10, id: 1006, name: 'Dr. Kavitha Rao', departmentId: 1005, qualification: 'MD Pediatrics', consultationFee: 600 },
    { tenantId: 10, id: 1007, name: 'Dr. Radha Menon', departmentId: 1006, qualification: 'MS OBG', consultationFee: 700 },
    { tenantId: 10, id: 1008, name: 'Dr. Arjun Desai', departmentId: 1007, qualification: 'MD Dermatology', consultationFee: 650 },
    { tenantId: 10, id: 1009, name: 'Dr. Rahul Nair (Casualty)', departmentId: 1008, qualification: 'MBBS, MEM', consultationFee: 300 },
    { tenantId: 10, id: 1010, name: 'Dr. Anjali Rao (Intensivist)', departmentId: 1009, qualification: 'MD, IDCCM', consultationFee: 1200 },
    { tenantId: 10, id: 1011, name: 'Dr. Kiran Shetty (Intensivist)', departmentId: 1009, qualification: 'DM Critical Care', consultationFee: 1500 },
    // Green Valley (tenant 20)
    { tenantId: 20, id: 2001, name: 'Dr. Suresh Gowda', departmentId: 2001, qualification: 'MBBS, MD', consultationFee: 450 },
    { tenantId: 20, id: 2002, name: 'Dr. Nisha Hegde', departmentId: 2002, qualification: 'DM Cardiology', consultationFee: 1000 },
    { tenantId: 20, id: 2003, name: 'Dr. Prakash Rao', departmentId: 2003, qualification: 'MS Ortho', consultationFee: 750 },
    { tenantId: 20, id: 2004, name: 'Dr. Lavanya S', departmentId: 2005, qualification: 'MD Pediatrics', consultationFee: 550 },
    { tenantId: 20, id: 2005, name: 'Dr. Vinay K (Casualty)', departmentId: 2008, qualification: 'MBBS', consultationFee: 350 },
    { tenantId: 20, id: 2006, name: 'Dr. Meghana P (Intensivist)', departmentId: 2009, qualification: 'IDCCM', consultationFee: 1000 },
  ];

  const patients: Tenanted<Patient>[] = [
    seedPatient(10, 1, 'SUN-000101', {
      firstName: 'Ananya', lastName: 'Rao', gender: 'FEMALE', mobileNumber: '9876543210',
      dateOfBirth: '1992-04-18', bloodGroup: 'B+', addressLine1: 'Plot 12, Jubilee Hills',
      city: 'Hyderabad', state: 'Telangana', postalCode: '500033',
    }, 45),
    seedPatient(10, 2, 'SUN-000102', {
      firstName: 'Suresh', lastName: 'Kumar', gender: 'MALE', mobileNumber: '9848012345',
      dateOfBirth: '1968-11-02', bloodGroup: 'O+', addressLine1: '4-56 Kukatpally',
      city: 'Hyderabad', state: 'Telangana', postalCode: '500072',
      emergencyContactName: 'Ramesh Kumar', emergencyContactPhone: '9848098480',
    }, 4),
    seedPatient(10, 3, 'SUN-000103', {
      firstName: 'Lakshmi', lastName: 'Devi', gender: 'FEMALE', mobileNumber: '9123456780',
      dateOfBirth: '1955-06-25', addressLine1: 'Secunderabad', city: 'Hyderabad', state: 'Telangana',
    }, null),
    seedPatient(20, 4, 'GVH-000201', {
      firstName: 'Arjun', lastName: 'Nair', gender: 'MALE', mobileNumber: '9988776655',
      dateOfBirth: '1988-01-14', addressLine1: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka',
    }, 3),
    seedPatient(20, 5, 'GVH-000202', {
      firstName: 'Kavya', lastName: 'Reddy', gender: 'FEMALE', mobileNumber: '9876543210',
      dateOfBirth: '1999-09-09', addressLine1: 'Whitefield', city: 'Bengaluru', state: 'Karnataka',
    }, 20),
  ];

  return {
    tenants: [
      {
        id: 10, code: 'SUN', name: 'Sunrise Multispeciality Hospital', city: 'Hyderabad',
        followUpFreeDays: 10,
        // Bought every module
        enabledModules: [
          Modules.REGISTRATION, Modules.BILLING, Modules.DOCTOR, Modules.NURSE,
          Modules.PHARMACY, Modules.LAB, Modules.PAYROLL,
        ],
      },
      {
        id: 20, code: 'GVH', name: 'Green Valley Hospital', city: 'Bengaluru',
        followUpFreeDays: 0, // this hospital always charges
        // Bought Front Desk + Doctor only (no Billing, Nursing, Pharmacy, Lab, Payroll)
        enabledModules: [Modules.REGISTRATION, Modules.DOCTOR],
      },
    ],
    users: [
      { id: 101, tenantId: 10, username: 'dev', displayName: 'Devendra N', email: 'dev@sunrise.example', roles: ['Receptionist'], status: 'ACTIVE' },
      { id: 102, tenantId: 10, username: 'sriya', displayName: 'Dr. Sriya', email: 'sriya@sunrise.example', roles: ['Doctor'], status: 'ACTIVE' },
      { id: 103, tenantId: 10, username: 'priya', displayName: 'Priya', email: 'priya@sunrise.example', roles: ['Admin'], status: 'ACTIVE' },
      { id: 201, tenantId: 20, username: 'hari', displayName: 'Hari', email: 'hari@greenvalley.example', roles: ['Receptionist'], status: 'ACTIVE' },
    ],
    rolePermissions: {
      Receptionist: [
        Permissions.PATIENT_VIEW, Permissions.PATIENT_CREATE, Permissions.PATIENT_EDIT,
        Permissions.REGISTRATION_CREATE, Permissions.PAYMENT_COLLECT,
        Permissions.QUEUE_VIEW, Permissions.BILLING_VIEW, Permissions.DISCHARGE_MANAGE,
      ],
      Doctor: [
        Permissions.PATIENT_VIEW, Permissions.QUEUE_VIEW, Permissions.ENCOUNTER_VIEW,
        Permissions.ENCOUNTER_EDIT, Permissions.PRESCRIPTION_CREATE, Permissions.LAB_ORDER_VIEW,
      ],
      Admin: Object.values(Permissions),
    },
    departments,
    doctors,
    patients,
    // Past (closed) visits so the follow-up rule can be tried:
    //  - Suresh Kumar saw Dr. Meera Shah 4 days ago  -> revisit to her today is FREE (Sunrise: 10-day window)
    //  - Ananya Rao saw Dr. Meera Shah 45 days ago    -> normal fee
    //  - Arjun Nair (Green Valley) 3 days ago         -> normal fee (window disabled there)
    registrations: [
      pastVisit(10, 1, 2, 'OP-PAST-0001', 4, 1001, 'General Medicine', 1001, 'Dr. Meera Shah', 500, 'Fever', {
        payerType: 'INSURANCE',
        insurerName: 'Star Health Insurance',
        tpaName: 'Medi Assist',
        policyNumber: 'SH-2026-778812',
        memberId: 'MA-55120',
        policyHolderName: 'Ramesh Kumar',
        policyHolderRelation: 'CHILD',
        policyValidUntil: '2027-03-31',
      }),
      pastVisit(10, 2, 1, 'OP-PAST-0002', 45, 1001, 'General Medicine', 1001, 'Dr. Meera Shah', 500, 'Headache'),
      pastVisit(20, 3, 4, 'OP-PAST-0003', 3, 2001, 'General Medicine', 2001, 'Dr. Suresh Gowda', 450, 'Cough'),
    ],
    receipts: [
      { tenantId: 10, registrationId: 1, receiptNumber: 'RC-PAST-00001', amount: 500, mode: 'CASH', referenceNumber: null, paidAt: iso(4) },
      { tenantId: 10, registrationId: 2, receiptNumber: 'RC-PAST-00002', amount: 500, mode: 'UPI', referenceNumber: 'UPI88812', paidAt: iso(45) },
      { tenantId: 20, registrationId: 3, receiptNumber: 'RC-PAST-00003', amount: 450, mode: 'CASH', referenceNumber: null, paidAt: iso(3) },
    ],
    sessions: {},
    sequences: { 'patient:10': 103, 'patient:20': 202, patientId: 5, registrationId: 3 },
  };
}

let db: MockDb | null = null;

export function getDb(): MockDb {
  if (db) return db;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    db = raw ? (JSON.parse(raw) as MockDb) : seed();
  } catch {
    db = seed();
  }
  return db;
}

/** Re-read storage so several open tabs act like several desks sharing one server. */
export function reloadDb(): void {
  db = null;
}

export function saveDb(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getDb()));
  } catch {
    /* storage unavailable — keep in memory */
  }
}

export function nextSequence(key: string): number {
  const d = getDb();
  d.sequences[key] = (d.sequences[key] ?? 0) + 1;
  return d.sequences[key];
}

/** Handy for demos: wipe mock data from the browser console with `resetMockDb()`. */
export function resetMockDb(): void {
  db = seed();
  saveDb();
}
if (typeof window !== 'undefined') {
  (window as unknown as { resetMockDb: () => void }).resetMockDb = resetMockDb;
}
