import { http } from '@/core/api/httpClient';
import type { AwayReason, DoctorAvailability } from '@/shared/utils/doctorAvailability';
import type {
  Consultation,
  DoctorQueue,
  EncounterInput,
  Icd10Entry,
  LabTestEntry,
  Medicine,
  PrescriptionSuggestion,
} from '../types';

/** Doctor module API client. Tenant and "own patients only" are enforced by the server. */
export const doctorApi = {
  /** Patients for a day (default today). Doctors get only their own. */
  getQueue: (date?: string) => http.get<DoctorQueue>('/doctor/queue', { date }),

  /** Patient + visit + consultation (if started) + earlier consultations. */
  getConsultation: (visitId: number) => http.get<Consultation>(`/doctor/visits/${visitId}`),

  /** Start consultation: patient moves to "In consultation" (locked at the front desk). */
  start: (visitId: number) => http.post<Consultation>(`/doctor/visits/${visitId}/start`),

  /** Save (draft). The whole consultation is sent each time. */
  save: (encounterId: number, input: EncounterInput) => http.put<Consultation>(`/doctor/encounters/${encounterId}`, input),

  /** Save and complete: closes the visit; read-only afterwards. */
  complete: (encounterId: number, input: EncounterInput) =>
    http.post<Consultation>(`/doctor/encounters/${encounterId}/complete`, input),

  /** What the signed-in doctor last prescribed for this diagnosis (ICD-10 code, or free-text description). */
  getPrescriptionSuggestion: (icd10Code: string, description: string) =>
    http.get<PrescriptionSuggestion>('/doctor/prescription-suggestions', { icd10Code, description }),

  /** Own status: available, or paused with a reason. */
  getAvailability: () => http.get<DoctorAvailability>('/doctor/availability'),

  /** Pause seeing patients. expectedBackMinutes null = not sure. */
  goAway: (req: { reason: AwayReason | ''; note: string; expectedBackMinutes: number | null }) =>
    http.post<DoctorAvailability>('/doctor/availability/away', req),

  /** "I'm back" (starting a consultation does this too). */
  back: () => http.post<DoctorAvailability>('/doctor/availability/back'),

  searchIcd10: (search: string, signal?: AbortSignal) => http.get<Icd10Entry[]>('/doctor/icd10', { search }, signal),

  searchMedicines: (search: string, signal?: AbortSignal) => http.get<Medicine[]>('/doctor/medicines', { search }, signal),

  searchLabTests: (search: string, signal?: AbortSignal) => http.get<LabTestEntry[]>('/doctor/lab-tests', { search }, signal),
};
