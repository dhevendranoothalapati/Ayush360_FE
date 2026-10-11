import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFound } from '@/shared/components/NotFound';
import { PageLoader } from '@/shared/components/PageLoader';

const DoctorQueuePage = lazy(() => import('./pages/DoctorQueuePage'));
const ConsultationPage = lazy(() => import('./pages/ConsultationPage'));

/**
 * Doctor module, mounted at /doctor/*
 *   /doctor                   today's patients (own patients for doctors; all, view only, for admins)
 *   /doctor/visits/:visitId   consultation: notes, vitals, diagnosis, prescription, tests, advice, admission
 * The module itself needs ENCOUNTER_VIEW (manifest); writing needs ENCOUNTER_EDIT / PRESCRIPTION_CREATE (checked by the API).
 */
export default function DoctorModule() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route index element={<DoctorQueuePage />} />
        <Route path="visits/:visitId" element={<ConsultationPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
