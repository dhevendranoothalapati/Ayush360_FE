import { http } from '@/core/api/httpClient';
import type {
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  Department,
  Doctor,
  FeeQuote,
  CancelVisitRequest,
  FrontDeskQueue,
  InpatientList,
  Patient,
  PatientContext,
  PatientInput,
  PaymentInput,
  Registration,
  TodaySummary,
  VisitInput,
} from '../types';

/**
 * Registration module API client.
 * Endpoints are tenant-scoped on the server; the client never sends tenantId.
 */
export const registrationApi = {
  getDepartments: () => http.get<Department[]>('/core/departments'),

  getDoctors: (departmentId: number) => http.get<Doctor[]>('/core/doctors', { departmentId }),

  /** Search by patient number, mobile number or name. */
  searchPatients: (search: string, signal?: AbortSignal) =>
    http.get<Patient[]>('/registration/patients', { search }, signal),

  getPatient: (id: number) => http.get<Patient>(`/registration/patients/${id}`),

  /** Patient + today's open visit (if any) + last visit. */
  getPatientContext: (id: number) => http.get<PatientContext>(`/registration/patients/${id}/context`),

  /** Correct a patient's master details. Creates no visit, token or charge. */
  updatePatient: (id: number, patient: PatientInput) =>
    http.put<Patient>(`/registration/patients/${id}`, patient),

  /** Fee to collect for this doctor; applies the hospital's free follow-up rule. */
  getFeeQuote: (doctorId: number, patientId?: number, date?: string) =>
    http.get<FeeQuote>('/registration/fee-quote', { doctorId, patientId, date: date || undefined }),

  /** Patient with today's appointment arrived: collect the fee (if any), issue today's token, join the queue. */
  checkIn: (registrationId: number, payment?: PaymentInput) =>
    http.post<CreateRegistrationResponse>(`/registration/registrations/${registrationId}/check-in`, { payment: payment ?? null }),

  /**
   * Collects the consultation fee (if any) and creates the visit in one server call.
   * Registration, receipt and queue token exist only if payment succeeds.
   */
  createRegistration: (req: CreateRegistrationRequest) =>
    http.post<CreateRegistrationResponse>('/registration/registrations', req),

  /** Edit an open visit (department, doctor, visit type, reason, consent). No new charge. */
  updateVisit: (registrationId: number, visit: VisitInput) =>
    http.put<Registration>(`/registration/registrations/${registrationId}`, visit),

  /** Everyone registered for a day (all doctors) with their latest status. date = yyyy-mm-dd, default today. */
  getQueue: (date?: string) => http.get<FrontDeskQueue>('/registration/queue', { date }),

  /** Cancel a visit the doctor hasn't started (optionally refunding the fee). */
  cancelVisit: (registrationId: number, req: CancelVisitRequest) =>
    http.post<Registration>(`/registration/registrations/${registrationId}/cancel`, req),

  /** Move an OPD visit the doctor hasn't started to another day (yyyy-mm-dd); it gets that day's token. */
  rescheduleVisit: (registrationId: number, date: string) =>
    http.post<Registration>(`/registration/registrations/${registrationId}/reschedule`, { date }),

  /** Everyone currently admitted (any admission date) + patients the doctor asked to admit. */
  getInpatients: () => http.get<InpatientList>('/registration/inpatients'),

  /** Today's counters for the front desk header. */
  getTodaySummary: () => http.get<TodaySummary>('/registration/registrations/summary'),
};
