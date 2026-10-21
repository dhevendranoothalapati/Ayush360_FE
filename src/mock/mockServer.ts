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
  FrontDeskQueue,
  FrontDeskQueueItem,
  InpatientItem,
  InpatientList,
  OpenVisit,
  Patient,
  PatientContext,
  PatientInput,
  PaymentInput,
  PayerFields,
  AcuteFields,
  Receipt,
  Registration,
  VisitInput,
} from '@/modules/registration/types';
import { EMPTY_ACUTE } from '@/modules/registration/types';
import type {
  Consultation,
  DoctorQueue,
  EncounterInput,
  Icd10Entry,
  LabTestEntry,
  Medicine,
  PastVisit,
  PrescriptionSuggestion,
  QueueItem,
} from '@/modules/doctor/types';
import { labStatusOf } from '@/modules/doctor/types';
import { patterns, isBlank } from '@/shared/utils/validation';
import { AVAILABLE, type AwayReason, type DoctorAvailability } from '@/shared/utils/doctorAvailability';
import type { FrontDeskDoctor } from '@/modules/registration/types';
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

/**
 * VITE_USE_REAL_AUTH=true: the user signed in through the real Identity API, so the token is a JWT.
 * The mock trusts its claims (hospital, user, permissions) without checking the signature: development only.
 */
function contextFromJwt(token: string): Ctx | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const binary = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json) as Record<string, unknown>;
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
    const tenantId = Number(claims.tenant_id);
    const user: DbUser = {
      id: Number(claims.sub),
      tenantId,
      username: String(claims.preferred_username ?? ''),
      displayName: String(claims.name ?? ''),
      email: '',
      roles: list(claims.role),
      status: 'ACTIVE',
    };
    return { user, tenantId, permissions: list(claims.perm) as Permission[] };
  } catch {
    return null;
  }
}

function authenticate(headers: Record<string, string>): Ctx {
  const token = headers.Authorization?.replace(/^Bearer\s+/i, '');
  if (token && !getDb().sessions[token]) {
    const fromJwt = contextFromJwt(token);
    if (fromJwt) return fromJwt;
  }
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

function validatePatient(p: PatientInput, emergency = false): Record<string, string> {
  const e: Record<string, string> = {};
  if (isBlank(p.firstName)) e.firstName = 'First name is required';
  if (isBlank(p.lastName)) e.lastName = 'Last name is required';
  if (!p.gender) e.gender = 'Gender is required';
  if (!p.dateOfBirth) e.dateOfBirth = 'Age or date of birth is required';
  // Emergency: patient may arrive unconscious / unaccompanied — contact details can follow later.
  if (!(emergency && !p.mobileNumber) && !patterns.mobile.test(p.mobileNumber))
    e.mobileNumber = 'Enter a valid 10-digit mobile number';
  if (!emergency && isBlank(p.addressLine1)) e.addressLine1 = 'Address is required';
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

const isAcute = (v: { source: string }) => v.source === 'EMERGENCY' || v.source === 'ICU';

function validateAcute(v: VisitInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!isAcute(v)) return e;
  const icu = v.source === 'ICU';
  if (!v.arrivalTime) e.arrivalTime = icu ? 'Admission time is required' : 'Arrival time is required';
  if (v.attendantPhone && !patterns.mobile.test(v.attendantPhone)) e.attendantPhone = 'Enter a valid 10-digit mobile number';
  if (v.isMlc && isBlank(v.policeStation)) e.policeStation = 'Police station is required for an MLC';
  if (v.depositAmount && !/^\d+$/.test(v.depositAmount)) e.depositAmount = 'Enter amount in rupees';
  if (icu) {
    if (!v.icuUnit) e.icuUnit = 'ICU unit is required';
    if (!v.admissionSource) e.admissionSource = 'Admission source is required';
    if (isBlank(v.attendantName)) e.attendantName = 'Attendant is required for ICU';
    if (!v.attendantPhone) e.attendantPhone = 'Attendant phone is required for ICU';
  } else {
    if (!v.broughtBy) e.broughtBy = 'Brought by is required';
    if (!v.triageLevel) e.triageLevel = 'Triage colour is required';
  }
  return e;
}

/** Emergency / ICU columns stored on the visit (blank for OPD). */
function acuteColumns(v: VisitInput): AcuteFields {
  if (!isAcute(v)) return { ...EMPTY_ACUTE };
  const icu = v.source === 'ICU';
  return {
    arrivalTime: v.arrivalTime,
    broughtBy: icu ? '' : v.broughtBy,
    attendantName: v.attendantName.trim(),
    attendantPhone: v.attendantPhone,
    triageLevel: icu ? '' : v.triageLevel,
    isMlc: v.isMlc,
    policeStation: v.isMlc ? v.policeStation.trim() : '',
    firNumber: v.isMlc ? v.firNumber.trim() : '',
    icuUnit: icu ? v.icuUnit : '',
    bedNumber: icu ? v.bedNumber.trim() : '',
    admissionSource: icu ? v.admissionSource : '',
    referredFrom: icu ? v.referredFrom.trim() : '',
  };
}

function nextMlcNumber(ctx: Ctx): string {
  const year = new Date().getFullYear();
  return `MLC-${year}-${pad(nextSequence(`mlc:${ctx.tenantId}:${year}`), 4)}`;
}

/** Like the real server: keep only "XXXX XXXX 1234", never the full Aadhaar (the mock DB lives in the browser). */
function keepMaskedAadhaar(p: Patient) {
  const digits = (p.aadhaarNumber ?? '').replace(/\D/g, '');
  if (digits.length === 12) p.aadhaarMasked = `XXXX XXXX ${digits.slice(-4)}`;
  p.aadhaarMasked = p.aadhaarMasked ?? '';
  p.aadhaarNumber = '';
}

function findPatient(ctx: Ctx, id: number): Tenanted<Patient> {
  // Record must belong to the caller's tenant; otherwise behave as "not found".
  const p = getDb().patients.find((x) => x.id === id && x.tenantId === ctx.tenantId);
  if (!p) throw new HttpError(404, 'Patient not found');
  return p;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Today's visit the front desk may still change: patient is WAITING (not yet with / seen by the doctor). */
function isOpenVisit(r: Registration): boolean {
  return (
    new Date(r.registrationDate).toDateString() === new Date().toDateString() &&
    r.visitStatus === 'REGISTERED' &&
    r.queueStatus === 'WAITING'
  );
}

/** Visit (or appointment) still open on that day: no second one with the same doctor. day = yyyy-mm-dd. */
function isActiveOn(r: Registration, day: string): boolean {
  return (
    localDate(r.registrationDate) === day &&
    r.visitStatus === 'REGISTERED' &&
    (r.queueStatus === 'WAITING' || r.queueStatus === 'IN_CONSULTATION' || r.queueStatus === 'BOOKED')
  );
}

/** Appointments: up to this many days ahead (same as the server). */
const BOOKING_MAX_DAYS = 30;
const dayPlus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDate(d.toISOString());
};

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
function quoteFee(ctx: Ctx, doctorId: number, patientId?: number, onDay?: string): FeeQuote {
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
        r.queueStatus !== 'BOOKED' && // appointment not paid yet
        r.consultationFee > 0,
    )
    .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate))[0];
  if (!lastPaid) return base;

  const paidDay = startOfDay(new Date(lastPaid.registrationDate));
  const freeUntil = new Date(paidDay.getTime() + days * DAY_MS);
  const today = onDay ? new Date(`${onDay}T00:00:00`) : startOfDay(new Date());
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
  const last = visits.find((v) => !open.includes(v) && v.queueStatus !== 'BOOKED');
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
  Object.assign(errors, validatePayer(visit), validateAcute(visit));
  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);

  const kindOf = (src: string) => (src === 'EMERGENCY' || src === 'ICU' ? src : 'OP');
  if (kindOf(visit.source) !== kindOf(reg.source)) {
    throw new HttpError(409, 'OPD, Emergency and ICU entries cannot be converted into each other. Register a new visit instead.');
  }
  if (isAcute(reg)) {
    // No consultation fee on Emergency / ICU entries — nothing to re-check. Deposit cannot change here.
    if (visit.isMlc && !reg.mlcNumber) reg.mlcNumber = nextMlcNumber(ctx);
    Object.assign(reg, acuteColumns(visit));
  } else if (doctor!.id !== reg.doctorId) {
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
  authorize(ctx, Permissions.REGISTRATION_CREATE);
  const db = getDb();
  const now = new Date().toISOString();

  // --- visit validation
  const { visit, payment } = req;
  // Emergency / ICU ("acute"): no consultation fee, optional advance deposit, relaxed patient contact.
  const emergency = isAcute(visit);
  const icu = visit.source === 'ICU';
  const deposit = emergency ? Number(visit.depositAmount || 0) : 0;
  const dept = db.departments.find((d) => d.id === visit.departmentId && d.tenantId === ctx.tenantId);
  const doctor = db.doctors.find(
    (d) => d.id === visit.doctorId && d.tenantId === ctx.tenantId && d.departmentId === dept?.id,
  );
  const errors: Record<string, string> = {};
  if (!dept) errors.departmentId = 'Select a department';
  if (!doctor) errors.doctorId = 'Select a doctor';
  if (isBlank(visit.reasonForVisit)) errors.reasonForVisit = 'Reason for visit is required';
  Object.assign(errors, validatePayer(visit), validateAcute(visit));
  // Future date = appointment (OPD only): token given now, pay on arrival (check-in).
  const today = dayPlus(0);
  let visitDay = today;
  if (visit.visitDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visit.visitDate)) errors.visitDate = 'Choose a date';
    else if (visit.visitDate < today) errors.visitDate = 'Choose today or a later date';
    else if (visit.visitDate > dayPlus(BOOKING_MAX_DAYS))
      errors.visitDate = `Appointments can be booked up to ${BOOKING_MAX_DAYS} days ahead`;
    else if (visit.visitDate > today && emergency) errors.visitDate = 'Emergency / ICU is registered for today only';
    else visitDay = visit.visitDate;
  }
  // Phone appointment: patient not here yet, so nothing is collected even for today.
  const booking = visitDay > today || (!emergency && visit.source === 'PHONE');

  // --- patient (returning or new)
  let patient: Tenanted<Patient> | undefined;
  let isNewPatient = false;
  if (req.patientId) {
    patient = findPatient(ctx, req.patientId);
    if (req.patient) {
      // Returning patient whose details were corrected at the desk.
      authorize(ctx, Permissions.PATIENT_EDIT);
      Object.assign(errors, validatePatient(req.patient, emergency));
    }
  } else if (req.patient) {
    authorize(ctx, Permissions.PATIENT_CREATE);
    Object.assign(errors, validatePatient(req.patient, emergency));
    isNewPatient = true;
  } else {
    throw new HttpError(400, 'Patient details are required');
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);

  // --- one open visit per doctor per day
  if (patient) {
    const dup = db.registrations.find(
      (r) => r.tenantId === ctx.tenantId && r.patientId === patient!.id && r.doctorId === doctor!.id && isActiveOn(r, visitDay),
    );
    if (dup) {
      const when = visitDay === today ? 'today' : `on ${visitDay}`;
      throw new HttpError(
        409,
        dup.queueStatus === 'BOOKED'
          ? `This patient already has an appointment ${when} with ${dup.doctorName} (${dup.tokenNumber}).`
          : `This patient already has an open visit ${when} with ${dup.doctorName} (token ${dup.tokenNumber}).`,
      );
    }
  }

  // --- fee (server decides; follow-up rule applied) and payment BEFORE anything is created.
  // Emergency: treat first — no payment now; the casualty fee is billed later.
  const quote = emergency
    ? { ...quoteFee(ctx, doctor!.id), fee: 0, isFollowUp: false, followUpOf: null }
    : quoteFee(ctx, doctor!.id, patient?.id, visitDay);
  let paymentMode: Receipt['mode'] = 'FOLLOW_UP';
  let reference: string | null = null;
  // Amount to take now: consultation fee for OPD, the advance/deposit (if any) for Emergency / ICU.
  const dueNow = booking ? 0 : emergency ? deposit : quote.fee;
  if (dueNow > 0) {
    authorize(ctx, Permissions.PAYMENT_COLLECT);
    if (!payment || payment.amount !== dueNow) {
      throw new HttpError(400, emergency ? 'Payment amount does not match the deposit' : 'Payment amount does not match the consultation fee');
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
      aadhaarMasked: '',
    };
    keepMaskedAadhaar(patient);
    db.patients.push(patient);
  }
  if (!isNewPatient && req.patient && patient) {
    Object.assign(patient, req.patient, { updatedAt: now });
    keepMaskedAadhaar(patient);
  }
  const p = patient!;
  const day = visitDay.replace(/-/g, '');
  // Emergency cases get their own token series (E-001…) so casualty is never mixed into the OPD queue.
  // Appointments get their A-token now (keeps their place in the line); the fee is collected at check-in.
  const series = icu ? 'I' : emergency ? 'E' : 'A';
  const tokenSeq = nextSequence(`token:${ctx.tenantId}:${day}:${series}`);
  const regSeq = nextSequence(`reg:${ctx.tenantId}:${day}`);

  const registration: Tenanted<Registration> = {
    tenantId: ctx.tenantId,
    id: nextSequence('registrationId'),
    registrationNumber: `${icu ? 'ICU' : emergency ? 'ER' : 'OP'}-${day}-${pad(regSeq, 4)}`,
    registrationDate: booking ? new Date(`${visitDay}T09:00:00`).toISOString() : now,
    visitDate: visitDay,
    registrationType: icu ? 'ICU' : emergency ? 'EMERGENCY' : 'OP',
    patientId: p.id,
    departmentId: dept!.id,
    departmentName: dept!.name,
    doctorId: doctor!.id,
    doctorName: doctor!.name,
    source: visit.source,
    reasonForVisit: visit.reasonForVisit.trim(),
    messageConsent: visit.messageConsent,
    visitStatus: 'REGISTERED',
    queueStatus: booking ? 'BOOKED' : 'WAITING',
    tokenNumber: `${series}-${pad(tokenSeq, 3)}`,
    consultationFee: emergency ? 0 : quote.fee,
    // Emergency / ICU: charges (and any balance after the deposit) are billed later. Appointment: pay on arrival.
    paymentStatus: emergency || booking ? 'UNPAID' : 'PAID',
    depositAmount: deposit,
    mlcNumber: emergency && visit.isMlc ? nextMlcNumber(ctx) : null,
    ...acuteColumns(visit),
    isFollowUp: !booking && quote.isFollowUp,
    followUpOf: booking ? null : quote.followUpOf,
    ...payerColumns(visit),
    createdAt: now,
  };
  db.registrations.push(registration);

  // Emergency / ICU without deposit: nothing collected, so no receipt (billed later in Billing).
  const receipt =
    booking || (dueNow === 0 && emergency)
      ? null
      : {
        tenantId: ctx.tenantId,
        registrationId: registration.id,
        receiptNumber: `RC-${day}-${pad(registration.id, 5)}`,
        amount: dueNow,
        mode: paymentMode,
        referenceNumber: reference,
        paidAt: now,
        collectedByUserId: ctx.user.id, // whose cash drawer this belongs to
      };
  if (receipt) db.receipts.push(receipt);

  if (!booking) p.lastVisitDate = now;
  p.updatedAt = now;
  saveDb();

  let receiptOut: Receipt | null = null;
  if (receipt) {
    const { registrationId, collectedByUserId, ...rest } = strip(receipt);
    receiptOut = rest;
  }
  return { isNewPatient, patient: strip(p) as Patient, registration: strip(registration) as Registration, receipt: receiptOut };
}

// ---------------- doctor module (same rules as Consultations/ConsultationService.cs) ----------------

const MOCK_ICD10: Icd10Entry[] = [
  { code: 'A09', description: 'Diarrhoea and gastroenteritis of presumed infectious origin' },
  { code: 'A90', description: 'Dengue fever [classical dengue]' },
  { code: 'B34.9', description: 'Viral infection, unspecified' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  { code: 'G43.9', description: 'Migraine, unspecified' },
  { code: 'I10', description: 'Essential (primary) hypertension' },
  { code: 'J02.9', description: 'Acute pharyngitis, unspecified' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
  { code: 'J18.9', description: 'Pneumonia, unspecified' },
  { code: 'J45.9', description: 'Asthma, unspecified' },
  { code: 'K29.7', description: 'Gastritis, unspecified' },
  { code: 'M54.5', description: 'Low back pain' },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified' },
  { code: 'R50.9', description: 'Fever, unspecified' },
  { code: 'R51', description: 'Headache' },
];

const MOCK_LAB_TESTS: LabTestEntry[] = [
  { code: 'CBC', name: 'Complete blood count (CBC)', category: 'Haematology' },
  { code: 'ESR', name: 'Erythrocyte sedimentation rate (ESR)', category: 'Haematology' },
  { code: 'FBS', name: 'Blood sugar - fasting (FBS)', category: 'Biochemistry' },
  { code: 'PPBS', name: 'Blood sugar - post prandial (PPBS)', category: 'Biochemistry' },
  { code: 'HBA1C', name: 'HbA1c (glycated haemoglobin)', category: 'Biochemistry' },
  { code: 'LFT', name: 'Liver function test (LFT)', category: 'Biochemistry' },
  { code: 'RFT', name: 'Renal function test (RFT / KFT)', category: 'Biochemistry' },
  { code: 'TFT', name: 'Thyroid profile (T3, T4, TSH)', category: 'Biochemistry' },
  { code: 'NS1', name: 'Dengue NS1 antigen', category: 'Serology' },
  { code: 'URINE', name: 'Urine routine and microscopy', category: 'Clinical pathology' },
  { code: 'ECG', name: 'ECG (12 lead)', category: 'Cardiology' },
  { code: 'XRCHEST', name: 'X-ray chest PA view', category: 'Radiology' },
];

const MOCK_MEDICINES: Medicine[] = [
  { id: 1, name: 'Paracetamol', genericName: 'Paracetamol', strength: '500 mg', form: 'Tablet', defaultDose: '1 tablet', defaultFrequency: '1-1-1' },
  { id: 2, name: 'Paracetamol', genericName: 'Paracetamol', strength: '650 mg', form: 'Tablet', defaultDose: '1 tablet', defaultFrequency: '1-1-1' },
  { id: 3, name: 'Cetirizine', genericName: 'Cetirizine', strength: '10 mg', form: 'Tablet', defaultDose: '1 tablet', defaultFrequency: '0-0-1' },
  { id: 4, name: 'Amoxicillin', genericName: 'Amoxicillin', strength: '500 mg', form: 'Capsule', defaultDose: '1 capsule', defaultFrequency: '1-1-1' },
  { id: 5, name: 'Azithromycin', genericName: 'Azithromycin', strength: '500 mg', form: 'Tablet', defaultDose: '1 tablet', defaultFrequency: '1-0-0' },
  { id: 6, name: 'Pantoprazole', genericName: 'Pantoprazole', strength: '40 mg', form: 'Tablet', defaultDose: '1 tablet', defaultFrequency: '1-0-0' },
  { id: 7, name: 'Ondansetron', genericName: 'Ondansetron', strength: '4 mg', form: 'Tablet', defaultDose: '1 tablet', defaultFrequency: 'SOS' },
  { id: 8, name: 'Metformin', genericName: 'Metformin', strength: '500 mg', form: 'Tablet', defaultDose: '1 tablet', defaultFrequency: '1-0-1' },
  { id: 9, name: 'Amlodipine', genericName: 'Amlodipine', strength: '5 mg', form: 'Tablet', defaultDose: '1 tablet', defaultFrequency: '1-0-0' },
  { id: 10, name: 'ORS', genericName: 'Oral rehydration salts', strength: '21 g', form: 'Sachet', defaultDose: '1 sachet in 1 litre water', defaultFrequency: 'SOS' },
  { id: 11, name: 'Ambroxol', genericName: 'Ambroxol', strength: '30 mg/5 ml', form: 'Syrup', defaultDose: '5 ml', defaultFrequency: '1-1-1' },
  { id: 12, name: 'Vitamin D3', genericName: 'Cholecalciferol', strength: '60000 IU', form: 'Capsule', defaultDose: '1 capsule', defaultFrequency: 'Once a week' },
];

function searchList<T>(list: T[], term: string, code: (t: T) => string, text: (t: T) => string): T[] {
  const t = term.trim().toLowerCase();
  if (!t) return list.slice(0, 20);
  const words = t.split(/\s+/);
  const out = list.filter(
    (i) => code(i).toLowerCase().startsWith(t) || words.every((w) => text(i).toLowerCase().includes(w)),
  );
  return out.slice(0, 20);
}

const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
};

function ageYears(dob: string, on = new Date()): number | null {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  let age = on.getFullYear() - b.getFullYear();
  if (on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate())) age--;
  return age;
}

/** The signed-in user's doctor profile (null for admins / reception). */
function myDoctor(ctx: Ctx) {
  return getDb().doctors.find((d) => d.tenantId === ctx.tenantId && d.userId === ctx.user.id) ?? null;
}

function findVisit(ctx: Ctx, visitId: number): Tenanted<Registration> {
  const r = getDb().registrations.find((x) => x.id === visitId && x.tenantId === ctx.tenantId);
  if (!r) throw new HttpError(404, 'Visit not found.');
  return r;
}

/** Primary diagnosis as shown in the queue: "Description (CODE)". */
function dxText(enc: { diagnoses: { icd10Code: string; description: string; isPrimary: boolean }[] } | undefined, withCode = true): string {
  const d = enc?.diagnoses.find((x) => x.isPrimary) ?? enc?.diagnoses[0];
  if (!d) return '';
  return withCode && d.icd10Code ? `${d.description} (${d.icd10Code})` : d.description;
}

function doctorQueue(ctx: Ctx, date: string | null): DoctorQueue {
  authorize(ctx, Permissions.ENCOUNTER_VIEW);
  const db = getDb();
  const day = date || localDate(new Date().toISOString());
  const me = myDoctor(ctx);
  const regs = db.registrations
    .filter((r) => r.tenantId === ctx.tenantId && localDate(r.registrationDate) === day && r.visitStatus !== 'CANCELLED')
    .filter((r) => r.queueStatus !== 'BOOKED') // appointments reach the doctor once checked in
    .filter((r) => !me || r.doctorId === me.id)
    .sort((a, b) => a.registrationDate.localeCompare(b.registrationDate));
  const items: QueueItem[] = regs.map((r) => {
    const p = db.patients.find((x) => x.id === r.patientId)!;
    const enc = db.encounters.find((e) => e.visitId === r.id);
    const last = db.registrations
      .filter((o) => o.tenantId === ctx.tenantId && o.patientId === r.patientId && o.registrationDate < r.registrationDate && o.visitStatus !== 'CANCELLED')
      .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate))[0];
    return {
      visitId: r.id,
      tokenNumber: r.tokenNumber,
      visitNumber: r.registrationNumber,
      registrationType: r.registrationType,
      patientId: p.id,
      patientNumber: p.patientNumber,
      patientName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
      gender: p.gender,
      ageYears: ageYears(p.dateOfBirth),
      reasonForVisit: r.reasonForVisit,
      registeredAt: r.registrationDate,
      queueStatus: r.queueStatus,
      isFollowUp: r.isFollowUp,
      isReturning: db.registrations.some((o) => o.patientId === r.patientId && o.registrationDate < r.registrationDate),
      triageLevel: r.triageLevel,
      doctorName: r.doctorName,
      encounterId: enc?.id ?? null,
      startedAt: enc?.startedAt ?? null,
      completedAt: enc?.completedAt ?? null,
      labStatus: labStatusOf(r.queueStatus, enc?.labOrders ?? []),
      primaryDiagnosis: dxText(enc),
      medicineCount: enc?.prescriptions.length ?? 0,
      testCount: enc?.labOrders.length ?? 0,
      followUpDate: enc?.followUpDate ?? '',
      lastVisitAt: last?.registrationDate ?? null,
      lastVisitSummary: last ? dxText(db.encounters.find((e) => e.visitId === last.id), false) || last.reasonForVisit : '',
    };
  });
  const count = (s: string) => regs.filter((r) => r.queueStatus === s).length;
  return {
    date: day,
    doctorName: me?.name ?? null,
    isDoctor: Boolean(me),
    counts: {
      total: regs.length,
      waiting: count('WAITING'),
      inConsultation: count('IN_CONSULTATION'),
      completed: count('COMPLETED'),
      admissionRequested: count('ADMISSION_REQUESTED'),
      awaitingLabResults: items.filter((i) => i.labStatus === 'AWAITING_RESULTS').length,
    },
    items,
  };
}

// ---------------- doctor availability (doctor.doctor_breaks) ----------------

const AWAY_CODES: AwayReason[] = ['OPERATION_THEATRE', 'EMERGENCY_CALL', 'WARD_ROUNDS', 'LUNCH_BREAK', 'MEETING', 'OTHER'];
const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

function breaks() {
  const db = getDb();
  db.doctorBreaks ??= [];
  return db.doctorBreaks;
}

/** Open pause started today, as the API returns it. */
function availabilityOf(tenantId: number, doctorId: number): DoctorAvailability {
  const open = breaks()
    .filter((b) => b.tenantId === tenantId && b.doctorId === doctorId && !b.endedAt && b.startedAt >= todayStart())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  return open
    ? { isAway: true, reason: open.reason, note: open.note, since: open.startedAt, expectedBackAt: open.expectedBackAt }
    : AVAILABLE;
}

function endBreaks(tenantId: number, doctorId: number, at = new Date().toISOString()) {
  breaks()
    .filter((b) => b.tenantId === tenantId && b.doctorId === doctorId && !b.endedAt)
    .forEach((b) => (b.endedAt = at));
}

function requireDoctor(ctx: Ctx) {
  authorize(ctx, Permissions.ENCOUNTER_EDIT);
  const me = myDoctor(ctx);
  if (!me) throw new HttpError(403, 'Only doctors can set their availability.');
  return me;
}

function goAway(ctx: Ctx, body: { reason?: string; note?: string; expectedBackMinutes?: number | null }): DoctorAvailability {
  const me = requireDoctor(ctx);
  const reason = AWAY_CODES.find((c) => c === body.reason);
  const note = (body.note ?? '').trim();
  const errors: Record<string, string> = {};
  if (!reason) errors.reason = 'Choose a reason';
  if (reason === 'OTHER' && !note) errors.note = 'Say where you are';
  if (note.length > 200) errors.note = 'Maximum 200 characters';
  const mins = body.expectedBackMinutes;
  if (mins != null && (mins < 5 || mins > 480)) errors.expectedBackMinutes = 'Choose between 5 minutes and 8 hours';
  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);
  const now = new Date();
  endBreaks(ctx.tenantId, me.id, now.toISOString());
  breaks().push({
    tenantId: ctx.tenantId,
    doctorId: me.id,
    reason: reason!,
    note,
    startedAt: now.toISOString(),
    expectedBackAt: mins != null ? new Date(now.getTime() + mins * 60000).toISOString() : null,
    endedAt: null,
  });
  saveDb();
  return availabilityOf(ctx.tenantId, me.id);
}

/** Status + pace of each doctor in the day's list (same rules as DoctorAvailabilityService.BoardAsync). */
function doctorBoard(ctx: Ctx, doctors: { id: number; name: string }[], day: string): FrontDeskDoctor[] {
  const db = getDb();
  const isToday = day === localDate(new Date().toISOString());
  const dayEnd = new Date(`${day}T00:00:00`);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const recentStart = new Date(dayEnd.getTime() - 31 * 86_400_000).toISOString();
  return doctors.map((d) => {
    const mine = db.encounters.filter(
      (e) => e.tenantId === ctx.tenantId && e.doctorId === d.id && e.startedAt >= recentStart && e.startedAt < dayEnd.toISOString(),
    );
    const todays = mine.filter((e) => localDate(e.startedAt) === day);
    const mins = (list: typeof mine) =>
      list
        .filter((e) => e.completedAt)
        .map((e) => (new Date(e.completedAt!).getTime() - new Date(e.startedAt).getTime()) / 60000)
        .filter((m) => m >= 1 && m <= 90);
    const t = mins(todays);
    const r = mins(mine);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const [value, basis] =
      t.length >= 3 ? [avg(t), 'TODAY' as const] : r.length >= 3 ? [avg(r), 'RECENT' as const] : [10, 'DEFAULT' as const];
    const done = todays.filter((e) => e.completedAt).map((e) => e.completedAt!).sort();
    return {
      doctorId: d.id,
      name: d.name,
      availability: isToday ? availabilityOf(ctx.tenantId, d.id) : AVAILABLE,
      avgConsultMinutes: Math.max(1, Math.round(value)),
      avgBasis: basis,
      seenToday: done.length,
      firstStartedAt: todays.map((e) => e.startedAt).sort()[0] ?? null,
      lastCompletedAt: done.at(-1) ?? null,
    };
  });
}

/** Front desk patient queue: all doctors, latest status, no clinical details (same as the HMS API). */
function frontDeskQueue(ctx: Ctx, date: string | null): FrontDeskQueue {
  authorize(ctx, Permissions.QUEUE_VIEW);
  const db = getDb();
  const day = date || localDate(new Date().toISOString());
  const isToday = day === localDate(new Date().toISOString());
  const notAdmitted = (r: Registration) => r.registrationType !== 'IP' && r.registrationType !== 'ICU';
  const regs = db.registrations
    .filter((r) => r.tenantId === ctx.tenantId && localDate(r.registrationDate) === day && r.visitStatus !== 'CANCELLED')
    .filter(notAdmitted) // OP queue = OPD + Emergency; admitted patients are on the Inpatient queue
    .sort((a, b) => a.registrationDate.localeCompare(b.registrationDate));
  // Today only: every earlier OPD visit the doctor never saw, however old (nothing drops off silently).
  const pendingRegs = isToday
    ? db.registrations
        .filter(
          (r) =>
            r.tenantId === ctx.tenantId &&
            r.registrationType === 'OP' &&
            r.visitStatus === 'REGISTERED' &&
            (r.queueStatus === 'WAITING' || r.queueStatus === 'BOOKED') &&
            localDate(r.registrationDate) < day,
        )
        .sort((a, b) => a.registrationDate.localeCompare(b.registrationDate))
    : [];
  const toItem = (r: Tenanted<Registration>): FrontDeskQueueItem => {
    const p = db.patients.find((x) => x.id === r.patientId)!;
    const enc = db.encounters.find((e) => e.visitId === r.id);
    return {
      visitId: r.id,
      tokenNumber: r.tokenNumber,
      visitNumber: r.registrationNumber,
      registrationType: r.registrationType,
      patientId: p.id,
      patientNumber: p.patientNumber,
      patientName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
      gender: p.gender,
      ageYears: ageYears(p.dateOfBirth),
      mobileNumber: p.mobileNumber,
      doctorId: r.doctorId,
      doctorName: r.doctorName,
      departmentName: r.departmentName,
      reasonForVisit: r.reasonForVisit,
      // Appointment: when it was booked; otherwise when the patient joined the queue.
      registeredAt: r.queueStatus === 'BOOKED' ? r.createdAt : r.registrationDate,
      queueStatus: r.queueStatus,
      triageLevel: r.triageLevel,
      isFollowUp: r.isFollowUp,
      isReturning: db.registrations.some(
        (o) => o.patientId === r.patientId && o.registrationDate < r.registrationDate && o.visitStatus !== 'CANCELLED',
      ),
      paymentStatus: r.paymentStatus,
      consultationFee: r.consultationFee,
      payerType: r.payerType,
      startedAt: enc?.startedAt ?? null,
      completedAt: enc?.completedAt ?? null,
      labStatus: labStatusOf(r.queueStatus, enc?.labOrders ?? []),
      followUpDate: enc?.followUpDate ?? '',
      admissionType: enc?.admissionRequested ? enc.admissionType : '',
      visitDate: localDate(r.registrationDate),
      rescheduledFrom: r.rescheduledFrom ?? '',
      source: r.source,
    };
  };
  const items = regs.map(toItem);
  const count = (s: string) => regs.filter((r) => r.queueStatus === s).length;
  return {
    date: day,
    counts: {
      total: regs.length - count('BOOKED'),
      waiting: count('WAITING'),
      inConsultation: count('IN_CONSULTATION'),
      completed: count('COMPLETED'),
      admissionRequested: count('ADMISSION_REQUESTED'),
      awaitingLabResults: items.filter((i) => i.labStatus === 'AWAITING_RESULTS').length,
      emergency: regs.filter((r) => r.registrationType === 'EMERGENCY' || r.registrationType === 'ICU').length,
      booked: count('BOOKED'),
    },
    items,
    pending: pendingRegs.map(toItem),
    doctors: doctorBoard(
      ctx,
      [...new Map(items.map((i) => [i.doctorId, { id: i.doctorId, name: i.doctorName }])).values()],
      day,
    ),
  };
}

/** Admitted patients (IP / ICU in the last 30 days, until discharge exists) + admission requests of the last 3 days. */
function inpatientList(ctx: Ctx): InpatientList {
  authorize(ctx, Permissions.QUEUE_VIEW);
  const db = getDb();
  const daysAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000;
  const items: InpatientItem[] = db.registrations
    .filter(
      (r) =>
        r.tenantId === ctx.tenantId &&
        r.visitStatus !== 'CANCELLED' &&
        (((r.registrationType === 'IP' || r.registrationType === 'ICU') && daysAgo(r.registrationDate) <= 30) ||
          r.queueStatus === 'ADMISSION_REQUESTED'), // until admitted: no time limit
    )
    .map((r) => {
      const p = db.patients.find((x) => x.id === r.patientId)!;
      const enc = db.encounters.find((e) => e.visitId === r.id);
      const admitted = r.registrationType === 'IP' || r.registrationType === 'ICU';
      return {
        visitId: r.id,
        visitNumber: r.registrationNumber,
        tokenNumber: r.tokenNumber,
        status: admitted ? 'ADMITTED' : 'AWAITING_ADMISSION',
        registrationType: r.registrationType,
        patientId: p.id,
        patientNumber: p.patientNumber,
        patientName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
        gender: p.gender,
        ageYears: ageYears(p.dateOfBirth),
        mobileNumber: p.mobileNumber,
        doctorName: r.doctorName,
        departmentName: r.departmentName,
        since: admitted ? r.arrivalTime || r.registrationDate : enc?.completedAt ?? r.registrationDate,
        unit: admitted ? r.icuUnit : enc?.admissionType ?? '',
        bedNumber: r.bedNumber,
        payerType: r.payerType,
        insurerName: r.insurerName,
        isMlc: r.isMlc,
        advancePaid: db.receipts
          .filter((rc) => rc.tenantId === ctx.tenantId && rc.registrationId === r.id && admitted)
          .reduce((sum, rc) => sum + rc.amount, 0),
        amountPending: null,
      } satisfies InpatientItem;
    })
    .sort((a, b) => Number(a.status === 'ADMITTED') - Number(b.status === 'ADMITTED') || b.since.localeCompare(a.since));
  const admitted = items.filter((i) => i.status === 'ADMITTED');
  return {
    counts: {
      admitted: admitted.length,
      icu: admitted.filter((i) => i.registrationType === 'ICU').length,
      ward: admitted.filter((i) => i.registrationType === 'IP').length,
      awaitingAdmission: items.length - admitted.length,
    },
    items,
  };
}

/** Cancel a visit the doctor hasn't started (any day); refund = refund receipt dated today. */
function cancelVisit(ctx: Ctx, id: number, body: { reason?: string; refund?: boolean }): Registration {
  authorize(ctx, Permissions.REGISTRATION_CREATE);
  const db = getDb();
  const r = findVisit(ctx, id);
  if (r.visitStatus !== 'REGISTERED' || (r.queueStatus !== 'WAITING' && r.queueStatus !== 'BOOKED'))
    throw new HttpError(409, "Only visits the doctor hasn't started can be cancelled.");
  const reason = (body.reason ?? '').trim();
  if (!reason) throw new HttpError(400, 'Enter why the visit is cancelled', { reason: 'Enter why the visit is cancelled' });
  if (reason.length > 200) throw new HttpError(400, 'Maximum 200 characters', { reason: 'Maximum 200 characters' });
  if (body.refund) {
    authorize(ctx, Permissions.PAYMENT_COLLECT);
    const own = db.receipts.filter((rc) => rc.tenantId === ctx.tenantId && rc.registrationId === r.id);
    const due =
      own.filter((rc) => rc.kind !== 'REFUND').reduce((s, rc) => s + rc.amount, 0) -
      own.filter((rc) => rc.kind === 'REFUND').reduce((s, rc) => s + rc.amount, 0);
    if (due > 0) {
      const last = own.filter((rc) => rc.kind !== 'REFUND').at(-1);
      db.receipts.push({
        tenantId: ctx.tenantId,
        registrationId: r.id,
        receiptNumber: `RF-${todayKey()}-${pad(nextSequence(`receipt:${ctx.tenantId}:${todayKey()}`), 5)}`,
        amount: due,
        mode: last?.mode ?? 'CASH',
        referenceNumber: null,
        paidAt: new Date().toISOString(),
        collectedByUserId: ctx.user.id,
        kind: 'REFUND',
      });
    }
  }
  r.visitStatus = 'CANCELLED';
  r.cancelReason = reason;
  saveDb();
  return strip(r);
}

/** Move an OPD visit the doctor hasn't started to today or a later day (new token for that day). */
function rescheduleVisit(ctx: Ctx, id: number, body: { date?: string }): Registration {
  authorize(ctx, Permissions.REGISTRATION_CREATE);
  const db = getDb();
  const r = findVisit(ctx, id);
  if (r.visitStatus !== 'REGISTERED' || (r.queueStatus !== 'WAITING' && r.queueStatus !== 'BOOKED'))
    throw new HttpError(409, "Only visits the doctor hasn't started can be moved.");
  if (r.registrationType !== 'OP') throw new HttpError(409, 'Only OPD visits can be moved to another day.');
  const target = body.date ?? '';
  const today = localDate(new Date().toISOString());
  const max = new Date();
  max.setDate(max.getDate() + 30);
  const fail = (msg: string) => new HttpError(400, msg, { date: msg });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) throw fail('Choose a date');
  if (target < today) throw fail('Choose today or a later date');
  if (target > localDate(max.toISOString())) throw fail('Choose a date within 30 days');
  const current = localDate(r.registrationDate);
  if (target === current) throw fail('The visit is already on this date');
  const clash = db.registrations.find(
    (o) =>
      o.id !== r.id &&
      o.tenantId === ctx.tenantId &&
      o.patientId === r.patientId &&
      o.doctorId === r.doctorId &&
      isActiveOn(o, target),
  );
  if (clash) throw new HttpError(409, `The patient already has a visit with this doctor on that day (token ${clash.tokenNumber}).`);
  const key = target.replace(/-/g, '');
  r.rescheduledFrom = r.rescheduledFrom ?? current;
  // The visit now belongs to the new day; waiting time counts from now when moved to today.
  r.registrationDate = target === today ? new Date().toISOString() : new Date(`${target}T09:00:00`).toISOString();
  // New token for that day; an appointment stays an appointment (pay on arrival).
  const series = 'A';
  r.visitDate = target;
  r.tokenNumber = `${series}-${pad(nextSequence(`token:${ctx.tenantId}:${key}:${series}`), 3)}`;
  saveDb();
  return strip(r);
}

/** Patient with today's appointment arrived: fee (follow-up rule applied for today) + today's A-token. */
function checkIn(ctx: Ctx, id: number, body: { payment?: PaymentInput | null }): CreateRegistrationResponse {
  authorize(ctx, Permissions.REGISTRATION_CREATE);
  const db = getDb();
  const r = findVisit(ctx, id);
  if (r.visitStatus !== 'REGISTERED' || r.queueStatus !== 'BOOKED')
    throw new HttpError(409, 'This visit is not a booked appointment (already checked in or cancelled).');
  const today = dayPlus(0);
  const day = localDate(r.registrationDate);
  if (day !== today)
    throw new HttpError(
      409,
      day > today
        ? 'The appointment is for a later day. Change the date to today first.'
        : 'The appointment date has passed. Change the date to today first.',
    );
  const dup = db.registrations.find(
    (o) => o.id !== r.id && o.tenantId === ctx.tenantId && o.patientId === r.patientId && o.doctorId === r.doctorId && isActiveOn(o, today),
  );
  if (dup) throw new HttpError(409, `This patient already has an open visit today with ${dup.doctorName} (token ${dup.tokenNumber}).`);

  const quote = quoteFee(ctx, r.doctorId, r.patientId, today);
  const payment = body.payment ?? undefined;
  let mode: Receipt['mode'] = 'FOLLOW_UP';
  let reference: string | null = null;
  if (quote.fee > 0) {
    authorize(ctx, Permissions.PAYMENT_COLLECT);
    if (!payment || payment.amount !== quote.fee) throw new HttpError(400, 'Payment amount does not match the consultation fee');
    if (payment.mode !== 'CASH' && isBlank(payment.referenceNumber))
      throw new HttpError(400, 'Transaction reference is required for UPI / card payments');
    if (payment.referenceNumber?.trim() === '0000') throw new HttpError(402, 'Payment was declined. The patient was not checked in.');
    mode = payment.mode;
    reference = payment.referenceNumber?.trim() || null;
  }
  const now = new Date().toISOString();
  const key = todayKey();
  Object.assign(r, {
    queueStatus: 'WAITING',
    paymentStatus: 'PAID',
    consultationFee: quote.fee,
    isFollowUp: quote.isFollowUp,
    followUpOf: quote.followUpOf,
    registrationDate: now, // waiting time counts from arrival
    // token stays the one given at booking
  });
  const receipt = {
    tenantId: ctx.tenantId,
    registrationId: r.id,
    receiptNumber: `RC-${key}-${pad(r.id, 5)}`,
    amount: quote.fee,
    mode,
    referenceNumber: reference,
    paidAt: now,
    collectedByUserId: ctx.user.id,
  };
  db.receipts.push(receipt);
  const p = db.patients.find((x) => x.id === r.patientId)!;
  p.lastVisitDate = now;
  saveDb();
  const { registrationId, collectedByUserId, ...rest } = strip(receipt);
  return { isNewPatient: false, patient: strip(p) as Patient, registration: strip(r) as Registration, receipt: rest };
}

function consultationOf(ctx: Ctx, visitId: number): Consultation {
  const db = getDb();
  const r = findVisit(ctx, visitId);
  const p = db.patients.find((x) => x.id === r.patientId)!;
  const doc = db.doctors.find((d) => d.id === r.doctorId);
  const enc = db.encounters.find((e) => e.visitId === r.id);
  const me = myDoctor(ctx);
  const own = Boolean(me && me.id === r.doctorId && ctx.permissions.includes(Permissions.ENCOUNTER_EDIT));
  const today = localDate(r.registrationDate) === localDate(new Date().toISOString());
  const history: PastVisit[] = db.registrations
    .filter((x) => x.tenantId === ctx.tenantId && x.patientId === r.patientId && x.id !== r.id && x.visitStatus !== 'CANCELLED')
    .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate))
    .slice(0, 20)
    .map((x) => {
      const e = db.encounters.find((en) => en.visitId === x.id);
      return {
        visitId: x.id,
        visitNumber: x.registrationNumber,
        date: x.registrationDate,
        registrationType: x.registrationType,
        doctorName: x.doctorName,
        departmentName: x.departmentName,
        reasonForVisit: x.reasonForVisit,
        consultationStatus: e?.status ?? '',
        diagnoses: e ? e.diagnoses.map((d) => d.description).join(', ') : '',
        medicineCount: e?.prescriptions.length ?? 0,
        testCount: e?.labOrders.length ?? 0,
      };
    });
  const encounterOut = enc ? (({ tenantId: _t, visitId: _v, patientId: _p, doctorId: _d, ...rest }) => rest)(enc) : null;
  return {
    patient: {
      id: p.id,
      patientNumber: p.patientNumber,
      name: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
      gender: p.gender,
      ageYears: ageYears(p.dateOfBirth),
      dateOfBirth: p.dateOfBirth,
      dobEstimated: p.dobEstimated,
      bloodGroup: p.bloodGroup,
      mobileNumber: p.mobileNumber,
    },
    visit: {
      id: r.id,
      visitNumber: r.registrationNumber,
      tokenNumber: r.tokenNumber,
      visitDate: localDate(r.registrationDate),
      registeredAt: r.registrationDate,
      registrationType: r.registrationType,
      departmentName: r.departmentName,
      reasonForVisit: r.reasonForVisit,
      queueStatus: r.queueStatus,
      visitStatus: r.visitStatus,
      isFollowUp: r.isFollowUp,
      payerType: r.payerType,
      insurerName: r.insurerName,
      triageLevel: r.triageLevel,
    },
    doctor: {
      id: r.doctorId,
      name: doc?.name ?? r.doctorName,
      qualification: doc?.qualification ?? '',
      specialization: '',
      registrationNumber: '',
      medicalCouncil: '',
      departmentName: r.departmentName,
    },
    encounter: encounterOut,
    canStart: own && !enc && today && r.visitStatus === 'REGISTERED' && (r.queueStatus === 'WAITING' || r.queueStatus === 'IN_CONSULTATION'),
    // Until midnight of the visit day the doctor can still correct a completed consultation.
    canEdit: own && Boolean(enc) && (enc?.status === 'IN_PROGRESS' || today),
    history,
  };
}

function requireOwn(ctx: Ctx, r: Registration) {
  const me = myDoctor(ctx);
  if (!me) throw new HttpError(403, 'Only doctors can write consultations.');
  if (me.id !== r.doctorId) throw new HttpError(403, `This patient is booked with ${r.doctorName}.`);
  return me;
}

function startConsultation(ctx: Ctx, visitId: number): Consultation {
  authorize(ctx, Permissions.ENCOUNTER_EDIT);
  const db = getDb();
  const r = findVisit(ctx, visitId);
  const me = requireOwn(ctx, r);
  if (!db.encounters.some((e) => e.visitId === r.id)) {
    if (localDate(r.registrationDate) !== localDate(new Date().toISOString()))
      throw new HttpError(409, "Only today's patients can be seen. This visit is from an earlier day.");
    if (r.visitStatus !== 'REGISTERED' || !(r.queueStatus === 'WAITING' || r.queueStatus === 'IN_CONSULTATION'))
      throw new HttpError(409, "This visit is closed and can't be started.");
    const allergies =
      db.encounters
        .filter((e) => e.patientId === r.patientId && e.allergies)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.allergies ?? '';
    endBreaks(ctx.tenantId, me.id); // seeing a patient means the doctor is back
    db.encounters.push({
      tenantId: ctx.tenantId,
      id: nextSequence('encounterId'),
      visitId: r.id,
      patientId: r.patientId,
      doctorId: me.id,
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
      completedAt: null,
      chiefComplaints: r.reasonForVisit,
      history: '',
      pastHistory: '',
      allergies,
      examination: '',
      advice: '',
      followUpDate: '',
      vitals: { temperatureF: null, pulse: null, systolicBp: null, diastolicBp: null, respiratoryRate: null, spo2: null, weightKg: null, heightCm: null },
      diagnoses: [],
      prescriptions: [],
      labOrders: [],
      admissionRequested: false,
      admissionType: '',
      admissionReason: '',
      lastEditedAt: null,
      lastEditedBy: '',
    });
    r.queueStatus = 'IN_CONSULTATION';
    saveDb();
  }
  return consultationOf(ctx, visitId);
}

function validateEncounter(input: EncounterInput, complete: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (complete && isBlank(input.chiefComplaints)) e.chiefComplaints = 'Chief complaints are required to complete the consultation';
  if (complete && !input.diagnoses.some((d) => !isBlank(d.description)))
    e.diagnoses = 'Add at least one diagnosis to complete the consultation';
  const v = input.vitals;
  const range = (key: keyof typeof v, min: number, max: number, msg: string) => {
    const n = v[key];
    if (n !== null && (n < min || n > max)) e[`vitals.${key}`] = msg;
  };
  range('temperatureF', 90, 110, 'Temperature must be between 90 and 110 °F');
  range('pulse', 20, 250, 'Pulse must be between 20 and 250');
  range('systolicBp', 50, 260, 'Systolic BP must be between 50 and 260');
  range('diastolicBp', 20, 160, 'Diastolic BP must be between 20 and 160');
  range('respiratoryRate', 5, 80, 'Respiratory rate must be between 5 and 80');
  range('spo2', 30, 100, 'SpO2 must be between 30 and 100');
  range('weightKg', 0.3, 400, 'Weight must be between 0.3 and 400 kg');
  range('heightCm', 20, 250, 'Height must be between 20 and 250 cm');
  input.prescriptions.forEach((p, i) => {
    if (isBlank(p.medicineName)) e[`prescriptions.${i}.medicineName`] = 'Enter the medicine';
    if (isBlank(p.frequency)) e[`prescriptions.${i}.frequency`] = 'Choose how often';
    const asNeeded = ['SOS', 'STAT'].includes(p.frequency.trim().toUpperCase());
    if (p.durationDays !== null && (p.durationDays < 1 || p.durationDays > 365)) e[`prescriptions.${i}.durationDays`] = '1 to 365 days';
    else if (p.durationDays === null && !asNeeded) e[`prescriptions.${i}.durationDays`] = 'Enter number of days';
  });
  if (input.followUpDate && input.followUpDate <= localDate(new Date().toISOString()))
    e.followUpDate = 'Follow-up date must be after today';
  if (input.admissionRequested) {
    if (!input.admissionType) e.admissionType = 'Choose where to admit';
    if (isBlank(input.admissionReason)) e.admissionReason = 'Enter the reason for admission';
  }
  return e;
}

function saveConsultation(ctx: Ctx, encounterId: number, input: EncounterInput, complete: boolean): Consultation {
  authorize(ctx, Permissions.ENCOUNTER_EDIT);
  const db = getDb();
  const enc = db.encounters.find((e) => e.id === encounterId && e.tenantId === ctx.tenantId);
  if (!enc) throw new HttpError(404, 'Consultation not found.');
  const r = findVisit(ctx, enc.visitId);
  const me = requireOwn(ctx, r);
  const correcting = enc.status === 'COMPLETED';
  if (correcting && localDate(r.registrationDate) !== localDate(new Date().toISOString()))
    throw new HttpError(409, 'Consultations can be corrected only on the day of the visit (until midnight).');
  if (input.prescriptions.length) authorize(ctx, Permissions.PRESCRIPTION_CREATE);
  const errors = validateEncounter(input, complete || correcting);
  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields.', errors);

  const diagnoses = input.diagnoses.filter((d) => !isBlank(d.description));
  const primary = Math.max(0, diagnoses.findIndex((d) => d.isPrimary));
  Object.assign(enc, {
    ...input,
    diagnoses: diagnoses.map((d, i) => ({ ...d, isPrimary: i === primary })),
    labOrders: input.labOrders.map((o) => ({ ...o, status: 'ORDERED' })),
    admissionType: input.admissionRequested ? input.admissionType : '',
    admissionReason: input.admissionRequested ? input.admissionReason : '',
  });
  if (correcting) {
    enc.lastEditedAt = new Date().toISOString();
    enc.lastEditedBy = me.name;
    if (r.queueStatus === 'COMPLETED' || r.queueStatus === 'ADMISSION_REQUESTED')
      r.queueStatus = enc.admissionRequested ? 'ADMISSION_REQUESTED' : 'COMPLETED';
  } else if (complete) {
    enc.status = 'COMPLETED';
    enc.completedAt = new Date().toISOString();
    r.visitStatus = 'COMPLETED';
    r.queueStatus = enc.admissionRequested ? 'ADMISSION_REQUESTED' : 'COMPLETED';
  }
  saveDb();
  return consultationOf(ctx, r.id);
}

/** What this doctor last prescribed for the same diagnosis (ICD-10 code, else exact text). */
function prescriptionSuggestion(ctx: Ctx, icd10Code: string, description: string): PrescriptionSuggestion {
  authorize(ctx, Permissions.ENCOUNTER_VIEW);
  const me = myDoctor(ctx);
  const none: PrescriptionSuggestion = { lastUsedAt: null, visitNumber: '', prescriptions: [] };
  if (!me || (!icd10Code && !description)) return none;
  const text = description.trim().toLowerCase();
  const last = getDb()
    .encounters.filter(
      (e) =>
        e.tenantId === ctx.tenantId &&
        e.doctorId === me.id &&
        e.status === 'COMPLETED' &&
        e.prescriptions.length > 0 &&
        e.diagnoses.some((d) => (icd10Code ? d.icd10Code === icd10Code.toUpperCase() : d.description.trim().toLowerCase() === text)),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!last) return none;
  return {
    lastUsedAt: last.startedAt,
    visitNumber: getDb().registrations.find((r) => r.id === last.visitId)?.registrationNumber ?? '',
    prescriptions: last.prescriptions,
  };
}

function routeDoctor(ctx: Ctx, m: string, path: string, q: URLSearchParams, body: unknown): { handled: boolean; result?: unknown } {
  if (!path.startsWith('/doctor/')) return { handled: false };
  if (m === 'GET' && path === '/doctor/availability') {
    return { handled: true, result: availabilityOf(ctx.tenantId, requireDoctor(ctx).id) };
  }
  if (m === 'POST' && path === '/doctor/availability/away') {
    return { handled: true, result: goAway(ctx, (body ?? {}) as { reason?: string; note?: string; expectedBackMinutes?: number | null }) };
  }
  if (m === 'POST' && path === '/doctor/availability/back') {
    const me = requireDoctor(ctx);
    endBreaks(ctx.tenantId, me.id);
    saveDb();
    return { handled: true, result: AVAILABLE };
  }
  if (m === 'GET' && path === '/doctor/queue') return { handled: true, result: doctorQueue(ctx, q.get('date')) };
  if (m === 'GET' && path === '/doctor/prescription-suggestions') {
    return { handled: true, result: prescriptionSuggestion(ctx, q.get('icd10Code') ?? '', q.get('description') ?? '') };
  }
  if (m === 'GET' && path === '/doctor/icd10') {
    authorize(ctx, Permissions.ENCOUNTER_VIEW);
    return { handled: true, result: searchList(MOCK_ICD10, q.get('search') ?? '', (i) => i.code, (i) => i.description) };
  }
  if (m === 'GET' && path === '/doctor/lab-tests') {
    authorize(ctx, Permissions.ENCOUNTER_VIEW);
    return { handled: true, result: searchList(MOCK_LAB_TESTS, q.get('search') ?? '', (i) => i.code, (i) => i.name) };
  }
  if (m === 'GET' && path === '/doctor/medicines') {
    authorize(ctx, Permissions.ENCOUNTER_VIEW);
    return { handled: true, result: searchList(MOCK_MEDICINES, q.get('search') ?? '', () => '', (i) => `${i.name} ${i.genericName}`) };
  }
  const visit = path.match(/^\/doctor\/visits\/(\d+)(\/start)?$/);
  if (visit && m === 'GET' && !visit[2]) {
    authorize(ctx, Permissions.ENCOUNTER_VIEW);
    return { handled: true, result: consultationOf(ctx, Number(visit[1])) };
  }
  if (visit && m === 'POST' && visit[2]) return { handled: true, result: startConsultation(ctx, Number(visit[1])) };
  const enc = path.match(/^\/doctor\/encounters\/(\d+)(\/complete)?$/);
  if (enc && m === 'PUT' && !enc[2]) return { handled: true, result: saveConsultation(ctx, Number(enc[1]), body as EncounterInput, false) };
  if (enc && m === 'POST' && enc[2]) return { handled: true, result: saveConsultation(ctx, Number(enc[1]), body as EncounterInput, true) };
  return { handled: false };
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
    const onDay = q.get('date');
    return quoteFee(
      ctx,
      Number(q.get('doctorId')),
      patientId ? Number(patientId) : undefined,
      onDay && onDay > dayPlus(0) ? onDay : undefined,
    );
  }
  const regAction = path.match(/^\/registration\/registrations\/(\d+)\/(cancel|reschedule|check-in)$/);
  if (m === 'POST' && regAction) {
    if (regAction[2] === 'check-in')
      return checkIn(ctx, Number(regAction[1]), (req.body ?? {}) as { payment?: PaymentInput | null });
    return regAction[2] === 'cancel'
      ? cancelVisit(ctx, Number(regAction[1]), (req.body ?? {}) as { reason?: string; refund?: boolean })
      : rescheduleVisit(ctx, Number(regAction[1]), (req.body ?? {}) as { date?: string });
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
    keepMaskedAadhaar(patient);
    saveDb();
    return strip(patient);
  }

  if (m === 'GET' && path === '/registration/queue') return frontDeskQueue(ctx, q.get('date'));
  if (m === 'GET' && path === '/registration/inpatients') return inpatientList(ctx);

  if (m === 'GET' && path === '/registration/registrations/summary') {
    authorize(ctx, Permissions.PATIENT_VIEW);
    const today = new Date().toDateString();
    const regs = db.registrations.filter(
      (r) =>
        r.tenantId === ctx.tenantId &&
        new Date(r.registrationDate).toDateString() === today &&
        r.visitStatus !== 'CANCELLED' &&
        r.queueStatus !== 'BOOKED', // appointments count once checked in
    );
    const ids = new Set(regs.map((r) => r.id));
    const firstVisits = regs.filter((r) => {
      const p = db.patients.find((x) => x.id === r.patientId);
      return p && new Date(p.createdAt).toDateString() === today;
    });
    // Payments for today's visits, minus refunds paid out today (cancelled visits of any day).
    const todaysReceipts = db.receipts.filter(
      (rc) =>
        rc.tenantId === ctx.tenantId &&
        (rc.kind === 'REFUND' ? new Date(rc.paidAt).toDateString() === today : ids.has(rc.registrationId)),
    );
    const signed = (rc: { amount: number; kind?: string }) => (rc.kind === 'REFUND' ? -rc.amount : rc.amount);
    const canSeeAll = ctx.permissions.includes(Permissions.COLLECTION_VIEW_ALL);
    return {
      registeredToday: regs.length,
      waiting: regs.filter((r) => r.queueStatus === 'WAITING').length,
      newPatients: new Set(firstVisits.map((r) => r.patientId)).size,
      myCollectedToday: todaysReceipts
        .filter((rc) => rc.collectedByUserId === ctx.user.id)
        .reduce((sum, rc) => sum + signed(rc), 0),
      // Only admins / accounts get the hospital total; everyone else gets null.
      totalCollectedToday: canSeeAll ? todaysReceipts.reduce((sum, rc) => sum + signed(rc), 0) : null,
    };
  }

  if (m === 'POST' && path === '/registration/registrations') {
    return createRegistration(ctx, req.body as CreateRegistrationRequest);
  }

  const doctor = routeDoctor(ctx, m, path, q, req.body);
  if (doctor.handled) return doctor.result;

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
