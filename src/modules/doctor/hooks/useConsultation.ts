import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/core/api/httpClient';
import { doctorApi } from '../api/doctorApi';
import {
  EMPTY_ENCOUNTER_INPUT,
  type Consultation,
  type Diagnosis,
  type EncounterInput,
  type LabOrder,
  type PrescriptionLine,
  type Vitals,
} from '../types';

/** Vitals and days are typed as text in the form and sent as numbers (or null). */
export type VitalsForm = Record<keyof Vitals, string>;
export type PrescriptionForm = Omit<PrescriptionLine, 'durationDays'> & {
  durationDays: string;
  /** Screen only: added automatically from the doctor's last prescription for this diagnosis (cleared when edited). */
  suggestedFor?: string;
};

/** Note shown above the prescription after lines were added automatically. */
export interface SuggestionNotice {
  diagnosis: string;
  count: number;
  lastUsedAt: string | null;
}

export interface ConsultationForm extends Omit<EncounterInput, 'vitals' | 'prescriptions'> {
  vitals: VitalsForm;
  prescriptions: PrescriptionForm[];
}

/** Server field errors, e.g. { chiefComplaints, 'vitals.pulse', 'prescriptions.0.frequency' }. */
export type FieldErrors = Record<string, string>;

function toForm(input: EncounterInput): ConsultationForm {
  const vitals = {} as VitalsForm;
  (Object.keys(input.vitals) as (keyof Vitals)[]).forEach((k) => {
    vitals[k] = input.vitals[k] === null || input.vitals[k] === undefined ? '' : String(input.vitals[k]);
  });
  return {
    ...input,
    vitals,
    prescriptions: input.prescriptions.map((p) => ({ ...p, durationDays: p.durationDays ? String(p.durationDays) : '' })),
  };
}

function num(value: string): number | null {
  const t = value.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toInput(form: ConsultationForm): EncounterInput {
  const vitals = {} as Vitals;
  (Object.keys(form.vitals) as (keyof Vitals)[]).forEach((k) => {
    vitals[k] = num(form.vitals[k]);
  });
  return {
    ...form,
    vitals,
    prescriptions: form.prescriptions.map(({ suggestedFor: _suggested, ...p }) => ({ ...p, durationDays: num(p.durationDays) })),
  };
}

const sameMedicine = (a: { medicineName: string; strength: string }, b: { medicineName: string; strength: string }) =>
  a.medicineName.trim().toLowerCase() === b.medicineName.trim().toLowerCase() &&
  a.strength.trim().toLowerCase() === b.strength.trim().toLowerCase();

function formFrom(data: Consultation): ConsultationForm {
  const encounter = data.encounter;
  if (!encounter) return toForm(EMPTY_ENCOUNTER_INPUT);
  // Copy only the editable fields (not id / status / times).
  const input = { ...EMPTY_ENCOUNTER_INPUT };
  (Object.keys(EMPTY_ENCOUNTER_INPUT) as (keyof EncounterInput)[]).forEach((k) => {
    (input as Record<string, unknown>)[k] = encounter[k] ?? EMPTY_ENCOUNTER_INPUT[k];
  });
  return toForm(input);
}

function errorsOf(err: unknown): FieldErrors {
  if (err instanceof ApiError) return ((err.details as { errors?: FieldErrors } | undefined)?.errors ?? {}) as FieldErrors;
  return {};
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

/** Loads a visit's consultation and holds the doctor's unsaved edits. */
export function useConsultation(visitId: number) {
  const [data, setData] = useState<Consultation | null>(null);
  const [form, setForm] = useState<ConsultationForm>(() => toForm(EMPTY_ENCOUNTER_INPUT));
  const [baseline, setBaseline] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'start' | 'save' | 'complete' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionNotice | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  const accept = useCallback((next: Consultation) => {
    const f = formFrom(next);
    setData(next);
    setForm(f);
    setBaseline(JSON.stringify(f));
    setErrors({});
    setFormError(null);
    setSuggestion(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      accept(await doctorApi.getConsultation(visitId));
    } catch (err) {
      setLoadError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [visitId, accept]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => baseline !== '' && JSON.stringify(form) !== baseline, [form, baseline]);
  const editable = Boolean(data?.canEdit);

  // Warn before closing the tab with unsaved notes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const start = useCallback(async () => {
    setBusy('start');
    setFormError(null);
    try {
      accept(await doctorApi.start(visitId));
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }, [visitId, accept]);

  const persist = useCallback(
    async (mode: 'save' | 'complete'): Promise<boolean> => {
      if (!data?.encounter) return false;
      setBusy(mode);
      setFormError(null);
      try {
        const input = toInput(form);
        const next =
          mode === 'complete'
            ? await doctorApi.complete(data.encounter.id, input)
            : await doctorApi.save(data.encounter.id, input);
        accept(next);
        setSavedAt(new Date().toISOString());
        return true;
      } catch (err) {
        setErrors(errorsOf(err));
        setFormError(messageOf(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [data, form, accept],
  );

  // ---------------------------------------------------------------- editing helpers

  const update = useCallback(<K extends keyof ConsultationForm>(field: K, value: ConsultationForm[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
  }, []);

  const updateVital = useCallback((field: keyof Vitals, value: string) => {
    setForm((f) => ({ ...f, vitals: { ...f.vitals, [field]: value } }));
  }, []);

  const addDiagnosis = useCallback((d: Omit<Diagnosis, 'isPrimary'>) => {
    setForm((f) => {
      if (f.diagnoses.some((x) => (d.icd10Code && x.icd10Code === d.icd10Code) || x.description === d.description)) return f;
      return { ...f, diagnoses: [...f.diagnoses, { ...d, isPrimary: f.diagnoses.length === 0 }] };
    });
  }, []);

  const removeDiagnosis = useCallback((index: number) => {
    setForm((f) => {
      const next = f.diagnoses.filter((_, i) => i !== index);
      if (next.length && !next.some((d) => d.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return { ...f, diagnoses: next };
    });
  }, []);

  const setPrimaryDiagnosis = useCallback((index: number) => {
    setForm((f) => ({ ...f, diagnoses: f.diagnoses.map((d, i) => ({ ...d, isPrimary: i === index })) }));
  }, []);

  const addPrescription = useCallback((line: PrescriptionForm) => {
    setForm((f) => ({ ...f, prescriptions: [...f.prescriptions, line] }));
  }, []);

  const updatePrescription = useCallback(<K extends keyof PrescriptionForm>(index: number, field: K, value: PrescriptionForm[K]) => {
    setForm((f) => ({
      ...f,
      // Editing a suggested line counts as reviewing it.
      prescriptions: f.prescriptions.map((p, i) => (i === index ? { ...p, [field]: value, suggestedFor: undefined } : p)),
    }));
  }, []);

  /**
   * After a diagnosis is added: pre-fill the medicines this doctor last prescribed for it.
   * Medicines already on the list are not added twice. Nothing is saved until the doctor saves.
   */
  const suggestPrescriptionFor = useCallback(async (dx: { icd10Code: string; description: string }) => {
    try {
      const s = await doctorApi.getPrescriptionSuggestion(dx.icd10Code, dx.description);
      const lines: PrescriptionForm[] = s.prescriptions
        .filter((line) => !formRef.current.prescriptions.some((p) => sameMedicine(p, line)))
        .map((line) => ({
          ...line,
          durationDays: line.durationDays ? String(line.durationDays) : '',
          suggestedFor: dx.description,
        }));
      if (!lines.length) return;
      setForm((f) => ({
        ...f,
        prescriptions: [...f.prescriptions, ...lines.filter((l) => !f.prescriptions.some((p) => sameMedicine(p, l)))],
      }));
      setSuggestion({ diagnosis: dx.description, count: lines.length, lastUsedAt: s.lastUsedAt });
    } catch {
      /* a suggestion is a convenience: never block the doctor */
    }
  }, []);

  /** "Remove them": drop the lines that were added automatically and not edited yet. */
  const removeSuggested = useCallback(() => {
    setForm((f) => ({ ...f, prescriptions: f.prescriptions.filter((p) => !p.suggestedFor) }));
    setSuggestion(null);
  }, []);

  const dismissSuggestion = useCallback(() => setSuggestion(null), []);

  const removePrescription = useCallback((index: number) => {
    setForm((f) => ({ ...f, prescriptions: f.prescriptions.filter((_, i) => i !== index) }));
  }, []);

  const addLabOrder = useCallback((order: LabOrder) => {
    setForm((f) =>
      f.labOrders.some((o) => o.testName.toLowerCase() === order.testName.toLowerCase())
        ? f
        : { ...f, labOrders: [...f.labOrders, order] },
    );
  }, []);

  const updateLabOrder = useCallback((index: number, notes: string) => {
    setForm((f) => ({ ...f, labOrders: f.labOrders.map((o, i) => (i === index ? { ...o, notes } : o)) }));
  }, []);

  const removeLabOrder = useCallback((index: number) => {
    setForm((f) => ({ ...f, labOrders: f.labOrders.filter((_, i) => i !== index) }));
  }, []);

  /** Throw away unsaved edits. */
  const undo = useCallback(() => {
    if (baseline) setForm(JSON.parse(baseline) as ConsultationForm);
    setErrors({});
    setFormError(null);
  }, [baseline]);

  return {
    data,
    form,
    loading,
    loadError,
    busy,
    formError,
    errors,
    savedAt,
    suggestion,
    dirty,
    editable,
    reload: load,
    start,
    save: () => persist('save'),
    complete: () => persist('complete'),
    undo,
    update,
    updateVital,
    addDiagnosis,
    removeDiagnosis,
    setPrimaryDiagnosis,
    addPrescription,
    updatePrescription,
    removePrescription,
    suggestPrescriptionFor,
    removeSuggested,
    dismissSuggestion,
    addLabOrder,
    updateLabOrder,
    removeLabOrder,
    /** The form as the server expects it (also used by the printed prescription). */
    input: toInput(form),
  };
}

export type ConsultationState = ReturnType<typeof useConsultation>;
