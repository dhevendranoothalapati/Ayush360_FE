/**
 * Mock backend that behaves like the planned ASP.NET Core API:
 *   Request -> Authenticate -> Identify user -> Determine tenant (server side)
 *           -> Check permission -> Check record belongs to tenant -> Allow/Deny
 * Any tenantId sent by the client is ignored.
 */
import type { Permission } from '@/core/permissions/permissions';
import { Permissions } from '@/core/permissions/permissions';
import type { CurrentUser } from '@/core/authentication/types';
import type {
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  FeeQuote,
  OpenVisit,
  Patient,
  PatientContext,
  PatientInput,
  PayerFields,
  Receipt,
  Registration,
  VisitInput,
} from '@/modules/registration/types';
import { patterns, isBlank } from '@/shared/utils/validation';
import { getDb, nextSequence, reloadDb, saveDb, type DbUser, type Tenanted } from './mockDb';

export interface MockRequest {
  method: string;
  path: string;
  body?: unknown;
  headers: Record<string, string>;
}
export interface MockResponse {
  status: number;
  body?: unknown;
}

interface Ctx {
  user: DbUser;
  tenantId: number;
  permissions: Permission[];
}

class HttpError extends Error {
  readonly status: number;
  readonly errors?: Record<string, string>;

  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayKey = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const pad = (n: number, len: number) => String(n).padStart(len, '0');

function strip<T extends { tenantId: number }>(row: T): Omit<T, 'tenantId'> {
  const { tenantId, ...rest } = row;
  return rest;
}

// ---------------- auth ----------------

function permissionsFor(user: DbUser): Permission[] {
  const db = getDb();
  return Array.from(new Set(user.roles.flatMap((r) => db.rolePermissions[r] ?? [])));
}

function toCurrentUser(user: DbUser): CurrentUser {
  const tenant = getDb().tenants.find((t) => t.id === user.tenantId)!;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    roles: user.roles,
    permissions: permissionsFor(user),
    tenant: { ...tenant },
  };
}

function authenticate(headers: Record<string, string>): Ctx {
  const token = headers.Authorization?.replace(/^Bearer\s+/i, '');
  const userId = token ? getDb().sessions[token] : undefined;
  const user = getDb().users.find((u) => u.id === userId && u.status === 'ACTIVE');
  if (!user) throw new HttpError(401, 'Unauthenticated');
  // Tenant comes from the user record — never from the request.
  return { user, tenantId: user.tenantId, permissions: permissionsFor(user) };
}

function authorize(ctx: Ctx, ...required: Permission[]) {
  if (!required.every((p) => ctx.permissions.includes(p))) throw new HttpError(403, 'Forbidden');
}

// ---------------- registration helpers ----------------

function validatePatient(p: PatientInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (isBlank(p.firstName)) e.firstName = 'First name is required';
  if (isBlank(p.lastName)) e.lastName = 'Last name is required';
  if (!p.gender) e.gender = 'Gender is required';
  if (!p.dateOfBirth) e.dateOfBirth = 'Age or date of birth is required';
  if (!patterns.mobile.test(p.mobileNumber)) e.mobileNumber = 'Enter a valid 10-digit mobile number';
  if (isBlank(p.addressLine1)) e.addressLine1 = 'Address is required';
  if (p.email && !patterns.email.test(p.email)) e.email = 'Enter a valid email';
  if (p.postalCode && !patterns.postalCode.test(p.postalCode)) e.postalCode = 'Enter a valid 6-digit PIN code';
  return e;
}

function validatePayer(v: VisitInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.payerType === 'INSURANCE') {
    if (isBlank(v.insurerName)) e.insurerName = 'Insurer is required';
    if (isBlank(v.policyNumber)) e.policyNumber = 'Policy number is required';
    if (isBlank(v.policyHolderName)) e.policyHolderName = 'Policy holder name is required';
    if (!v.policyHolderRelation) e.policyHolderRelation = 'Relationship is required';
    if (v.policyValidUntil && new Date(v.policyValidUntil) < new Date(new Date().toDateString()))
      e.policyValidUntil = 'This policy has expired';
  }
  return e;
}

/** Payer columns stored on the visit (insurance fields blank for self-pay). */
function payerColumns(v: VisitInput): PayerFields {
  const insured = v.payerType === 'INSURANCE';
  return {
    payerType: insured ? 'INSURANCE' : 'SELF',
    insurerName: insured ? v.insurerName.trim() : '',
    tpaName: insured ? v.tpaName.trim() : '',
    policyNumber: insured ? v.policyNumber.trim() : '',
    memberId: insured ? v.memberId.trim() : '',
    policyHolderName: insured ? v.policyHolderName.trim() : '',
    policyHolderRelation: insured ? v.policyHolderRelation : '',
    policyValidUntil: insured ? v.policyValidUntil : '',
  };
}

function findPatient(ctx: Ctx, id: number): Tenanted<Patient> {
  // Record must belong to the caller's tenant; otherwise behave as "not found".
  const p = getDb().patients.find((x) => x.id === id && x.tenantId === ctx.tenantId);
  if (!p) throw new HttpError(404, 'Patient not found');
  return p;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Today's visit that has not been closed yet. */
function isOpenVisit(r: Registration): boolean {
  return (
    new Date(r.registrationDate).toDateString() === new Date().toDateString() &&
    r.visitStatus === 'REGISTERED' &&
    (r.queueStatus === 'WAITING' || r.queueStatus === 'IN_CONSULTATION')
  );
}

function receiptOf(ctx: Ctx, registrationId: number): Receipt | null {
  const rc = getDb().receipts.find((x) => x.tenantId === ctx.tenantId && x.registrationId === registrationId);
  if (!rc) return null;
  const { tenantId, registrationId: _r, collectedByUserId, ...rest } = rc;
  return rest;
}

/**
 * Follow-up rule (hospital setting followUpFreeDays):
 * a visit to the SAME doctor within N days of the last PAID consultation is free.
 * Free follow-ups do not restart the window.
 */
function quoteFee(ctx: Ctx, doctorId: number, patientId?: number): FeeQuote {
  const db = getDb();
  const doctor = db.doctors.find((d) => d.id === doctorId && d.tenantId === ctx.tenantId);
  if (!doctor) throw new HttpError(404, 'Doctor not found');
  const tenant = db.tenants.find((t) => t.id === ctx.tenantId)!;
  const days = tenant.followUpFreeDays ?? 0;
  const base: FeeQuote = {
    doctorId,
    fee: doctor.consultationFee,
    standardFee: doctor.consultationFee,
    isFollowUp: false,
    followUpOf: null,
    followUpOfDate: null,
    freeUntil: null,
    followUpFreeDays: days,
  };
  if (!patientId || days <= 0) return base;

  const lastPaid = db.registrations
    .filter(
      (r) =>
        r.tenantId === ctx.tenantId &&
        r.patientId === patientId &&
        r.doctorId === doctorId &&
        r.visitStatus !== 'CANCELLED' &&
        !r.isFollowUp &&
        r.consultationFee > 0,
    )
    .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate))[0];
  if (!lastPaid) return base;

  const paidDay = startOfDay(new Date(lastPaid.registrationDate));
  const freeUntil = new Date(paidDay.getTime() + days * DAY_MS);
  const today = startOfDay(new Date());
  if (today.getTime() === paidDay.getTime() || today > freeUntil) return base; // same day = not a follow-up
  return {
    ...base,
    fee: 0,
    isFollowUp: true,
    followUpOf: lastPaid.registrationNumber,
    followUpOfDate: lastPaid.registrationDate,
    freeUntil: freeUntil.toISOString(),
  };
}

function patientContext(ctx: Ctx, patientId: number): PatientContext {
  const db = getDb();
  const patient = findPatient(ctx, patientId);
  const visits = db.registrations
    .filter((r) => r.tenantId === ctx.tenantId && r.patientId === patientId)
    .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate));
  const open = visits.filter(isOpenVisit);
  const openVisits: OpenVisit[] = open.map((r) => ({
    registration: strip(r) as Registration,
    receipt: receiptOf(ctx, r.id),
  }));
  const last = visits.find((v) => !open.includes(v));
  return {
    patient: strip(patient) as Patient,
    openVisits,
    visits: visits.slice(0, 20).map((v) => strip(v) as Registration),
    lastVisit: last ? (strip(last) as Registration) : null,
  };
}

function updateVisit(ctx: Ctx, registrationId: number, visit: VisitInput): Registration {
  authorize(ctx, Permissions.REGISTRATION_CREATE);
  const db = getDb();
  const reg = db.registrations.find((r) => r.id === registrationId && r.tenantId === ctx.tenantId);
  if (!reg) throw new HttpError(404, 'Visit not found');
  if (!isOpenVisit(reg)) throw new HttpError(409, 'This visit is closed and can no longer be changed.');

  const dept = db.departments.find((d) => d.id === visit.departmentId && d.tenantId === ctx.tenantId);
  const doctor = db.doctors.find(
    (d) => d.id === visit.doctorId && d.tenantId === ctx.tenantId && d.departmentId === dept?.id,
  );
  const errors: Record<string, string> = {};
  if (!dept) errors.departmentId = 'Select a department';
  if (!doctor) errors.doctorId = 'Select a doctor';
  if (isBlank(visit.reasonForVisit)) errors.reasonForVisit = 'Reason for visit is required';
  Object.assign(errors, validatePayer(visit));
  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);

  if (doctor!.id !== reg.doctorId) {
    // Changing doctor must not change what was charged; otherwise billing needs an adjustment.
    const newFee = reg.isFollowUp ? 0 : doctor!.consultationFee;
    if (newFee !== reg.consultationFee) {
      throw new HttpError(
        409,
        `The fee for ${doctor!.name} (₹${newFee}) differs from what was charged (₹${reg.consultationFee}). ` +
          'Cancel this visit and register again, or adjust it in Billing.',
        { doctorId: 'Fee differs from the amount already charged' },
      );
    }
  }
  Object.assign(reg, {
    departmentId: dept!.id,
    departmentName: dept!.name,
    doctorId: doctor!.id,
    doctorName: doctor!.name,
    registrationType: visit.registrationType,
    source: visit.source,
    reasonForVisit: visit.reasonForVisit.trim(),
    messageConsent: visit.messageConsent,
    ...payerColumns(visit),
  });
  saveDb();
  return strip(reg) as Registration;
}

function createRegistration(ctx: Ctx, req: CreateRegistrationRequest): CreateRegistrationResponse {
  authorize(ctx, Permissions.REGISTRATION_CREATE, Permissions.PAYMENT_COLLECT);
  const db = getDb();
  const now = new Date().toISOString();

  // --- visit validation
  const { visit, payment } = req;
  const dept = db.departments.find((d) => d.id === visit.departmentId && d.tenantId === ctx.tenantId);
  const doctor = db.doctors.find(
    (d) => d.id === visit.doctorId && d.tenantId === ctx.tenantId && d.departmentId === dept?.id,
  );
  const errors: Record<string, string> = {};
  if (!dept) errors.departmentId = 'Select a department';
  if (!doctor) errors.doctorId = 'Select a doctor';
  if (isBlank(visit.reasonForVisit)) errors.reasonForVisit = 'Reason for visit is required';
  Object.assign(errors, validatePayer(visit));

  // --- patient (returning or new)
  let patient: Tenanted<Patient> | undefined;
  let isNewPatient = false;
  if (req.patientId) {
    patient = findPatient(ctx, req.patientId);
    if (req.patient) {
      // Returning patient whose details were corrected at the desk.
      authorize(ctx, Permissions.PATIENT_EDIT);
      Object.assign(errors, validatePatient(req.patient));
    }
  } else if (req.patient) {
    authorize(ctx, Permissions.PATIENT_CREATE);
    Object.assign(errors, validatePatient(req.patient));
    isNewPatient = true;
  } else {
    throw new HttpError(400, 'Patient details are required');
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);

  // --- one open visit per doctor per day
  if (patient) {
    const dup = db.registrations.find(
      (r) => r.tenantId === ctx.tenantId && r.patientId === patient!.id && r.doctorId === doctor!.id && isOpenVisit(r),
    );
    if (dup) {
      throw new HttpError(409, `This patient already has an open visit today with ${dup.doctorName} (token ${dup.tokenNumber}).`);
    }
  }

  // --- fee (server decides; follow-up rule applied) and payment BEFORE anything is created
  const quote = quoteFee(ctx, doctor!.id, patient?.id);
  let paymentMode: Receipt['mode'] = 'FOLLOW_UP';
  let reference: string | null = null;
  if (quote.fee > 0) {
    if (!payment || payment.amount !== quote.fee) {
      throw new HttpError(400, 'Payment amount does not match the consultation fee');
    }
    if (payment.mode !== 'CASH' && isBlank(payment.referenceNumber)) {
      throw new HttpError(400, 'Transaction reference is required for UPI / card payments');
    }
    if (payment.referenceNumber?.trim() === '0000') {
      // Demo hook to exercise the failure path.
      throw new HttpError(402, 'Payment was declined. No registration was created.');
    }
    paymentMode = payment.mode;
    reference = payment.referenceNumber?.trim() || null;
  }

  // --- persist (single "transaction")
  const tenant = db.tenants.find((t) => t.id === ctx.tenantId)!;
  if (isNewPatient && req.patient) {
    const seq = nextSequence(`patient:${ctx.tenantId}`);
    patient = {
      ...req.patient,
      tenantId: ctx.tenantId,
      id: nextSequence('patientId'),
      patientNumber: `${tenant.code}-${pad(seq, 6)}`,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      lastVisitDate: null,
    };
    db.patients.push(patient);
  }
  if (!isNewPatient && req.patient && patient) {
    Object.assign(patient, req.patient, { updatedAt: now });
  }
  const p = patient!;
  const day = todayKey();
  const tokenSeq = nextSequence(`token:${ctx.tenantId}:${day}`);
  const regSeq = nextSequence(`reg:${ctx.tenantId}:${day}`);

  const registration: Tenanted<Registration> = {
    tenantId: ctx.tenantId,
    id: nextSequence('registrationId'),
    registrationNumber: `OP-${day}-${pad(regSeq, 4)}`,
    registrationDate: now,
    registrationType: visit.registrationType,
    patientId: p.id,
    departmentId: dept!.id,
    departmentName: dept!.name,
    doctorId: doctor!.id,
    doctorName: doctor!.name,
    source: visit.source,
    reasonForVisit: visit.reasonForVisit.trim(),
    messageConsent: visit.messageConsent,
    visitStatus: 'REGISTERED',
    queueStatus: 'WAITING',
    tokenNumber: `A-${pad(tokenSeq, 3)}`,
    consultationFee: quote.fee,
    paymentStatus: 'PAID',
    isFollowUp: quote.isFollowUp,
    followUpOf: quote.followUpOf,
    ...payerColumns(visit),
    createdAt: now,
  };
  db.registrations.push(registration);

  const receipt = {
    tenantId: ctx.tenantId,
    registrationId: registration.id,
    receiptNumber: `RC-${day}-${pad(registration.id, 5)}`,
    amount: quote.fee,
    mode: paymentMode,
    referenceNumber: reference,
    paidAt: now,
    collectedByUserId: ctx.user.id, // whose cash drawer this belongs to
  };
  db.receipts.push(receipt);

  p.lastVisitDate = now;
  p.updatedAt = now;
  saveDb();

  const { registrationId, collectedByUserId, ...receiptOut } = strip(receipt);
  return { isNewPatient, patient: strip(p) as Patient, registration: strip(registration) as Registration, receipt: receiptOut };
}

// ---------------- router ----------------

async function route(req: MockRequest): Promise<unknown> {
  const url = new URL(req.path, 'http://mock');
  const path = url.pathname;
  const q = url.searchParams;
  const db = getDb();
  const m = req.method;

  if (m === 'POST' && path === '/auth/login') {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    const name = (username ?? '').trim().toLowerCase();
    const user = db.users.find((u) => u.username.toLowerCase() === name && u.status === 'ACTIVE');
    if (!user || password !== 'demo123') throw new HttpError(400, 'Invalid username or password');
    const token = `mock.${user.id}.${Math.random().toString(36).slice(2)}`;
    db.sessions[token] = user.id;
    saveDb();
    return { accessToken: token, user: toCurrentUser(user) };
  }

  const ctx = authenticate(req.headers);

  if (m === 'GET' && path === '/auth/me') return toCurrentUser(ctx.user);
  if (m === 'POST' && path === '/auth/logout') {
    const token = req.headers.Authorization?.replace(/^Bearer\s+/i, '');
    if (token) delete db.sessions[token];
    saveDb();
    return undefined;
  }

  if (m === 'GET' && path === '/core/departments') {
    return db.departments.filter((d) => d.tenantId === ctx.tenantId).map(strip);
  }
  if (m === 'GET' && path === '/core/doctors') {
    const deptId = Number(q.get('departmentId'));
    return db.doctors.filter((d) => d.tenantId === ctx.tenantId && (!deptId || d.departmentId === deptId)).map(strip);
  }

  if (m === 'GET' && path === '/registration/patients') {
    authorize(ctx, Permissions.PATIENT_VIEW);
    const term = (q.get('search') ?? '').trim().toLowerCase();
    if (term.length < 2) return [];
    const digits = term.replace(/\D/g, '');
    return db.patients
      .filter((p) => p.tenantId === ctx.tenantId)
      .filter(
        (p) =>
          p.patientNumber.toLowerCase().includes(term) ||
          (digits.length >= 3 && p.mobileNumber.includes(digits)) ||
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(term),
      )
      .slice(0, 10)
      .map(strip);
  }
  const patientMatch = path.match(/^\/registration\/patients\/(\d+)$/);
  if (m === 'GET' && patientMatch) {
    authorize(ctx, Permissions.PATIENT_VIEW);
    return strip(findPatient(ctx, Number(patientMatch[1])));
  }
  const contextMatch = path.match(/^\/registration\/patients\/(\d+)\/context$/);
  if (m === 'GET' && contextMatch) {
    authorize(ctx, Permissions.PATIENT_VIEW);
    return patientContext(ctx, Number(contextMatch[1]));
  }
  if (m === 'GET' && path === '/registration/fee-quote') {
    const patientId = q.get('patientId');
    if (patientId) findPatient(ctx, Number(patientId)); // tenant check
    return quoteFee(ctx, Number(q.get('doctorId')), patientId ? Number(patientId) : undefined);
  }
  const regMatch = path.match(/^\/registration\/registrations\/(\d+)$/);
  if (m === 'PUT' && regMatch) {
    return updateVisit(ctx, Number(regMatch[1]), req.body as VisitInput);
  }

  if (m === 'PUT' && patientMatch) {
    authorize(ctx, Permissions.PATIENT_EDIT);
    const patient = findPatient(ctx, Number(patientMatch[1]));
    const input = req.body as PatientInput;
    const errors = validatePatient(input);
    if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);
    Object.assign(patient, input, { updatedAt: new Date().toISOString() });
    saveDb();
    return strip(patient);
  }

  if (m === 'GET' && path === '/registration/registrations/summary') {
    authorize(ctx, Permissions.PATIENT_VIEW);
    const today = new Date().toDateString();
    const regs = db.registrations.filter(
      (r) => r.tenantId === ctx.tenantId && new Date(r.registrationDate).toDateString() === today,
    );
    const ids = new Set(regs.map((r) => r.id));
    const firstVisits = regs.filter((r) => {
      const p = db.patients.find((x) => x.id === r.patientId);
      return p && new Date(p.createdAt).toDateString() === today;
    });
    const todaysReceipts = db.receipts.filter((rc) => rc.tenantId === ctx.tenantId && ids.has(rc.registrationId));
    const canSeeAll = ctx.permissions.includes(Permissions.COLLECTION_VIEW_ALL);
    return {
      registeredToday: regs.length,
      waiting: regs.filter((r) => r.queueStatus === 'WAITING').length,
      newPatients: new Set(firstVisits.map((r) => r.patientId)).size,
      myCollectedToday: todaysReceipts
        .filter((rc) => rc.collectedByUserId === ctx.user.id)
        .reduce((sum, rc) => sum + rc.amount, 0),
      // Only admins / accounts get the hospital total; everyone else gets null.
      totalCollectedToday: canSeeAll ? todaysReceipts.reduce((sum, rc) => sum + rc.amount, 0) : null,
    };
  }

  if (m === 'POST' && path === '/registration/registrations') {
    return createRegistration(ctx, req.body as CreateRegistrationRequest);
  }

  throw new HttpError(404, `No mock route for ${m} ${path}`);
}

export async function handleMockRequest(req: MockRequest): Promise<MockResponse> {
  await delay(250 + Math.random() * 250);
  reloadDb(); // pick up registrations made in other tabs ("other desks")
  try {
    const body = await route(req);
    return { status: 200, body };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { message: err.message, errors: err.errors } };
    console.error('[mock-api] unexpected error', err);
    return { status: 500, body: { message: 'Unexpected server error' } };
  }
}
