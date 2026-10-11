import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Permissions } from '@/core/permissions/permissions';
import { RequirePermission } from '@/core/permissions/usePermission';
import { AccessDenied } from '@/shared/components/AccessDenied';
import { NotFound } from '@/shared/components/NotFound';
import { PageLoader } from '@/shared/components/PageLoader';

const RegistrationPage = lazy(() => import('./pages/RegistrationPage'));
const FrontDeskQueuePage = lazy(() => import('./pages/FrontDeskQueuePage'));

/** Front Desk module (registration + patient queue), mounted at /registration/* */
export default function RegistrationModule() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          index
          element={
            <RequirePermission
              permissions={[Permissions.REGISTRATION_CREATE]}
              fallback={<AccessDenied />}
            >
              <RegistrationPage />
            </RequirePermission>
          }
        />
        <Route
          path="queue"
          element={
            <RequirePermission permissions={[Permissions.QUEUE_VIEW]} fallback={<AccessDenied />}>
              <FrontDeskQueuePage />
            </RequirePermission>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
