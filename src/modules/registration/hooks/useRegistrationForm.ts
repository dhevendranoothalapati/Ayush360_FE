import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/core/api/httpClient';
import { useCurrentUser } from '@/core/authentication/AuthContext';
import { isBlank, patterns } from '@/shared/utils/validation';
import { registrationApi } from '../api/registrationApi';
import {
  EMPTY_INSURANCE,
  EMPTY_PATIENT,
  EMPTY_VISIT,
  type CreateRegistrationResponse,
  type Department,
  type Doctor,
  type FeeQuote,
  type OpenVisit,
  type Patient,
  type PatientInput,
  type PayerFields,
  type PaymentInput,
  type Registration,
  type TodaySummary,
  type VisitInput,
} from '../types';

export type FieldErrors = Partial<Record<keyof PatientInput | keyof VisitInput, string>>;

/**
 * One screen, three situations:
 *  - NEW         nobody selected: register a new patient and their visit
 *  - EXISTING    patient picked from search, no open visit today: book a new visit (details editable)
 *  - OPEN_VISIT  patient has an open visit today (or one was just registered): edit patient + visit
 */
export type DeskState = 'NEW' | 'EXISTING' | 'OPEN_VISIT';

interface Draft {
  patient: PatientInput;
  selectedPatient: Patient | null;
  visit: VisitInput;
  savedAt: string;
}

const draftKey = (userId: number) => `ayush360.registration.draft.${userId}`;

function readDraft(userId: number): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/** Copy the editable fields of a saved patient into the form. */
function toPatientInput(p: Patient): PatientInput {
  const input = { ...EMPTY_PATIENT };
  (Object.keys(EMPTY_PATIENT) as (keyof PatientInput)[]).forEach((k) => {
    (input as Record<string, unknown>)[k] = p[k] ?? EMPTY_PATIENT[k];
  });
  return input;
}

function payerOf(r: Partial<PayerFields> | null | undefined): PayerFields {
  return {
    payerType: r?.payerType ?? 'SELF',
    insurerName: r?.insurerName ?? '',
    tpaName: r?.tpaName ?? '',
    policyNumber: r?.policyNumber ?? '',
    memberId: r?.memberId ?? '',
    policyHolderName: r?.policyHolderName ?? '',
    policyHolderRelation: r?.policyHolderRelation ?? '',
    policyValidUntil: r?.policyValidUntil ?? '',
  };
}

function toVisitInput(r: Registration): VisitInput {
  return {
    departmentId: r.departmentId,
    doctorId: r.doctorId,
    registrationType: r.registrationType,
    source: r.source,
    reasonForVisit: r.reasonForVisit,
    messageConsent: r.messageConsent,
    ...payerOf(r),
  };
}

/** New visit for a known patient: start empty but keep their last payer (e.g. same insurance). */
function newVisitFor(lastVisit: Registration | null): VisitInput {
  return { ...EMPTY_VISIT, ...payerOf(lastVisit) };
}

/** Drop insurance fields when the patient pays themselves. */
function cleanVisit(v: VisitInput): VisitInput {
  return v.payerType === 'SELF' ? { ...v, ...EMPTY_INSURANCE } : v;
}

function sameValues<T extends object>(a: T, b: T): boolean {
  return (Object.keys(a) as (keyof T)[]).every((k) => String(a[k] ?? '').trim() === String(b[k] ?? '').trim());
}

function cleanPatient(p: PatientInput): PatientInput {
  return { ...p, firstName: p.firstName.trim(), middleName: p.middleName.trim(), lastName: p.lastName.trim() };
}

export function validatePatient(p: PatientInput): FieldErrors {
  const e: FieldErrors = {};
  if (isBlank(p.firstName)) e.firstName = 'First name is required';
  else if (!patterns.name.test(p.firstName.trim())) e.firstName = 'Use letters only';
  if (isBlank(p.lastName)) e.lastName = 'Last name is required';
  else if (!patterns.name.test(p.lastName.trim())) e.lastName = 'Use letters only';
  if (!p.gender) e.gender = 'Select gender';
  if (!p.dateOfBirth) e.dateOfBirth = 'Enter age or date of birth';
  if (!patterns.mobile.test(p.mobileNumber)) e.mobileNumber = 'Enter a valid 10-digit mobile number';
  if (isBlank(p.addressLine1)) e.addressLine1 = 'Address is required';
  if (p.email && !patterns.email.test(p.email)) e.email = 'Enter a valid email address';
  if (p.postalCode && !patterns.postalCode.test(p.postalCode)) e.postalCode = 'Enter a valid 6-digit PIN code';
  if (p.dateOfBirth && new Date(p.dateOfBirth) > new Date()) e.dateOfBirth = 'Date of birth cannot be in the future';
  if (p.emergencyContactPhone && !patterns.mobile.test(p.emergencyContactPhone))
    e.emergencyContactPhone = 'Enter a valid 10-digit mobile number';
  return e;
}

export function validateVisit(v: VisitInput): FieldErrors {
  const e: FieldErrors = {};
  if (v.departmentId === '') e.departmentId = 'Select a department';
  if (v.doctorId === '') e.doctorId = 'Select a doctor';
  if (isBlank(v.reasonForVisit)) e.reasonForVisit = 'Reason for visit is required';
  if (v.payerType === 'INSURANCE') {
    if (isBlank(v.insurerName)) e.insurerName = 'Choose or type the insurer';
    if (isBlank(v.policyNumber)) e.policyNumber = 'Policy number is required';
    if (isBlank(v.policyHolderName)) e.policyHolderName = 'Policy holder name is required';
    if (!v.policyHolderRelation) e.policyHolderRelation = 'Select relationship';
    if (v.policyValidUntil && new Date(v.policyValidUntil) < new Date(new Date().toDateString()))
      e.policyValidUntil = 'This policy has expired';
  }
  return e;
}

function apiFieldErrors(err: unknown): FieldErrors | undefined {
  if (err instanceof ApiError) return (err.details as { errors?: FieldErrors } | undefined)?.errors;
  return undefined;
}

export function useRegistrationForm() {
  const user = useCurrentUser();

  const [patient, setPatient] = useState<PatientInput>(EMPTY_PATIENT);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [lastVisit, setLastVisit] = useState<Registration | null>(null);
  /** The open visit currently loaded in the form (one of openVisits). */
  const [openVisit, setOpenVisit] = useState<OpenVisit | null>(null);
  /** All of today's open visits for this patient (e.g. ENT + General Medicine). */
  const [openVisits, setOpenVisits] = useState<OpenVisit[]>([]);
  const [visitHistory, setVisitHistory] = useState<Registration[]>([]);
  const [visit, setVisit] = useState<VisitInput>(EMPTY_VISIT);
  const [loadingPatient, setLoadingPatient] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [feeQuote, setFeeQuote] = useState<FeeQuote | null>(null);

  /** Set right after a successful registration (drives the success banner). */
  const [result, setResult] = useState<CreateRegistrationResponse | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(() => readDraft(user.id));
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [summary, setSummary] = useState<TodaySummary | null>(null);

  const deskState: DeskState = openVisit ? 'OPEN_VISIT' : selectedPatient ? 'EXISTING' : 'NEW';

  // ---------- master data & counters ----------
  const refreshSummary = useCallback(() => {
    registrationApi
      .getTodaySummary()
      .then(setSummary)
      .catch(() => undefined); // dashboard numbers are non-critical
  }, []);
  // Other desks register patients too: refresh the counters every 30 s (and when the tab regains focus).
  useEffect(() => {
    refreshSummary();
    const id = window.setInterval(refreshSummary, 30_000);
    window.addEventListener('focus', refreshSummary);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', refreshSummary);
    };
  }, [refreshSummary]);

  useEffect(() => {
    registrationApi
      .getDepartments()
      .then(setDepartments)
      .catch((e: unknown) => setFormError(e instanceof ApiError ? e.message : 'Could not load departments'))
      .finally(() => setLoadingMasters(false));
  }, []);

  useEffect(() => {
    if (visit.departmentId === '') {
      setDoctors([]);
      return;
    }
    let cancelled = false;
    registrationApi.getDoctors(visit.departmentId).then((list) => {
      if (!cancelled) setDoctors(list);
    });
    return () => {
      cancelled = true;
    };
  }, [visit.departmentId]);

  // Fee for a NEW visit (server applies the hospital's free follow-up rule).
  const patientId = selectedPatient?.id;
  useEffect(() => {
    if (openVisit || visit.doctorId === '') {
      setFeeQuote(null);
      return;
    }
    let cancelled = false;
    registrationApi
      .getFeeQuote(visit.doctorId, patientId)
      .then((q) => {
        if (!cancelled) setFeeQuote(q);
      })
      .catch(() => {
        if (!cancelled) setFeeQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visit.doctorId, patientId, openVisit]);

  const selectedDepartment = useMemo(
    () => departments.find((d) => d.id === visit.departmentId) ?? null,
    [departments, visit.departmentId],
  );
  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === visit.doctorId) ?? null,
    [doctors, visit.doctorId],
  );

  const patientEdited = useMemo(
    () => selectedPatient !== null && !sameValues(patient, toPatientInput(selectedPatient)),
    [patient, selectedPatient],
  );
  const visitEdited = useMemo(
    () => openVisit !== null && !sameValues(visit, toVisitInput(openVisit.registration)),
    [visit, openVisit],
  );

  // ---------- field updates ----------
  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const updatePatient = useCallback(<K extends keyof PatientInput>(field: K, value: PatientInput[K]) => {
    setPatient((p) => ({ ...p, [field]: value }));
    setNotice(null);
    clearError(field);
  }, []);

  const updateVisit = useCallback(<K extends keyof VisitInput>(field: K, value: VisitInput[K]) => {
    setVisit((v) => {
      const next = { ...v, [field]: value };
      if (field === 'departmentId') next.doctorId = ''; // doctor list changes with department
      return next;
    });
    setNotice(null);
    clearError(field);
  }, []);

  // ---------- patient selection ----------
  /** Load a patient from search: details + today's open visit (if any) into the same form. */
  const selectPatient = useCallback(async (p: Patient) => {
    setLoadingPatient(true);
    setErrors({});
    setFormError(null);
    setNotice(null);
    setResult(null);
    try {
      const ctx = await registrationApi.getPatientContext(p.id);
      setSelectedPatient(ctx.patient);
      setPatient(toPatientInput(ctx.patient));
      setLastVisit(ctx.lastVisit);
      setOpenVisits(ctx.openVisits);
      setVisitHistory(ctx.visits);
      const first = ctx.openVisits[0] ?? null;
      setOpenVisit(first);
      setVisit(first ? toVisitInput(first.registration) : newVisitFor(ctx.lastVisit));
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not load the patient.');
    } finally {
      setLoadingPatient(false);
    }
  }, []);

  /** Clear everything and start a new patient. */
  const reset = useCallback(() => {
    setPatient(EMPTY_PATIENT);
    setSelectedPatient(null);
    setLastVisit(null);
    setOpenVisit(null);
    setOpenVisits([]);
    setVisitHistory([]);
    setVisit(EMPTY_VISIT);
    setErrors({});
    setFormError(null);
    setNotice(null);
    setResult(null);
    setDraftSavedAt(null);
  }, []);

  /** Switch the form to another of today's open visits. */
  const selectOpenVisit = useCallback(
    (registrationId: number) => {
      if (openVisit?.registration.id === registrationId) return;
      if (patientEdited || visitEdited) {
        setFormError('Save or undo your changes before switching to another visit.');
        return;
      }
      const target = openVisits.find((v) => v.registration.id === registrationId);
      if (!target) return;
      setOpenVisit(target);
      setVisit(toVisitInput(target.registration));
      setResult(null);
      setErrors({});
      setFormError(null);
      setNotice(null);
    },
    [openVisit, openVisits, patientEdited, visitEdited],
  );

  /** Same patient, fresh visit (e.g. also see another department today). */
  const startNewVisit = useCallback(() => {
    if (visitEdited) {
      setFormError('Save or undo your changes before starting another visit.');
      return;
    }
    setVisit(newVisitFor(openVisit?.registration ?? lastVisit));
    setOpenVisit(null);
    setResult(null);
    setErrors({});
    setFormError(null);
    setNotice(null);
  }, [openVisit, lastVisit, visitEdited]);

  // ---------- validation ----------
  const validateAll = useCallback((): boolean => {
    const e: FieldErrors = { ...validatePatient(patient), ...validateVisit(visit) };
    setErrors(e);
    const ok = Object.keys(e).length === 0;
    setFormError(ok ? null : 'Please complete the highlighted fields.');
    return ok;
  }, [patient, visit]);

  // ---------- register a new visit ----------
  /** Payment (if any) + registration in one server call. Throws so the payment dialog can show the error. */
  const submit = useCallback(
    async (payment?: PaymentInput) => {
      setSaving(true);
      try {
        const res = await registrationApi.createRegistration({
          ...(selectedPatient
            ? { patientId: selectedPatient.id, ...(patientEdited ? { patient: cleanPatient(patient) } : {}) }
            : { patient: cleanPatient(patient) }),
          visit: cleanVisit(visit),
          payment,
        });
        setResult(res);
        setSelectedPatient(res.patient);
        setPatient(toPatientInput(res.patient));
        const created: OpenVisit = { registration: res.registration, receipt: res.receipt };
        setOpenVisit(created);
        setOpenVisits((list) => [created, ...list]);
        setVisitHistory((list) => [res.registration, ...list]);
        setVisit(toVisitInput(res.registration));
        setFormError(null);
        sessionStorage.removeItem(draftKey(user.id));
        setDraftSavedAt(null);
        refreshSummary();
        return res;
      } catch (err) {
        const fe = apiFieldErrors(err);
        if (fe) setErrors(fe);
        // Without a payment dialog (free follow-up) the error is shown on the page.
        if (!payment) setFormError(err instanceof ApiError ? err.message : 'Could not register the visit.');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [selectedPatient, patientEdited, patient, visit, user.id, refreshSummary],
  );

  // ---------- save edits (no new visit, no charge) ----------
  const saveChanges = useCallback(async () => {
    if (!selectedPatient) return;
    const e: FieldErrors = {
      ...validatePatient(patient),
      ...(openVisit ? validateVisit(visit) : {}),
    };
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError('Please complete the highlighted fields.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      let savedPatient = selectedPatient;
      if (patientEdited) {
        savedPatient = await registrationApi.updatePatient(selectedPatient.id, cleanPatient(patient));
        setSelectedPatient(savedPatient);
        setPatient(toPatientInput(savedPatient));
      }
      if (openVisit && visitEdited) {
        const reg = await registrationApi.updateVisit(openVisit.registration.id, cleanVisit(visit));
        const updated: OpenVisit = { ...openVisit, registration: reg };
        setOpenVisit(updated);
        setOpenVisits((list) => list.map((v) => (v.registration.id === reg.id ? updated : v)));
        setVisitHistory((list) => list.map((v) => (v.id === reg.id ? reg : v)));
        setVisit(toVisitInput(reg));
      }
      setResult((r) => (r ? { ...r, patient: savedPatient } : r));
      setNotice(`Changes saved for ${savedPatient.patientNumber}. No new visit or charge was created.`);
      refreshSummary();
    } catch (err) {
      const fe = apiFieldErrors(err);
      if (fe) setErrors(fe);
      setFormError(err instanceof ApiError ? err.message : 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  }, [selectedPatient, patient, openVisit, visit, patientEdited, visitEdited, refreshSummary]);

  /** Put back what is saved on the server. */
  const discardChanges = useCallback(() => {
    if (selectedPatient) setPatient(toPatientInput(selectedPatient));
    if (openVisit) setVisit(toVisitInput(openVisit.registration));
    setErrors({});
    setFormError(null);
  }, [selectedPatient, openVisit]);

  // ---------- drafts (browser only, never in the queue) ----------
  const saveDraft = useCallback(() => {
    const draft: Draft = { patient, selectedPatient, visit, savedAt: new Date().toISOString() };
    try {
      sessionStorage.setItem(draftKey(user.id), JSON.stringify(draft));
      setDraftSavedAt(draft.savedAt);
    } catch {
      setFormError('Could not save the draft in this browser.');
    }
  }, [patient, selectedPatient, visit, user.id]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setPatient(pendingDraft.patient);
    setSelectedPatient(pendingDraft.selectedPatient);
    setOpenVisit(null);
    setVisit(pendingDraft.visit);
    setPendingDraft(null);
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    sessionStorage.removeItem(draftKey(user.id));
    setPendingDraft(null);
  }, [user.id]);

  return {
    deskState,
    patient,
    selectedPatient,
    lastVisit,
    openVisit,
    openVisits,
    visitHistory,
    selectOpenVisit,
    visit,
    loadingPatient,
    errors,
    formError,
    notice,
    saving,
    departments,
    doctors,
    loadingMasters,
    selectedDepartment,
    selectedDoctor,
    feeQuote,
    result,
    summary,
    pendingDraft,
    draftSavedAt,
    patientEdited,
    visitEdited,
    updatePatient,
    updateVisit,
    selectPatient,
    reset,
    startNewVisit,
    validateAll,
    submit,
    saveChanges,
    discardChanges,
    saveDraft,
    restoreDraft,
    discardDraft,
  };
}

export type RegistrationFormState = ReturnType<typeof useRegistrationForm>;
