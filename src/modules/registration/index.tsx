import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Permissions } from '@/core/permissions/permissions';
import { RequirePermission } from '@/core/permissions/usePermission';
import { AccessDenied } from '@/shared/components/AccessDenied';
import { ComingSoon } from '@/shared/components/ComingSoon';
import { NotFound } from '@/shared/components/NotFound';
import { PageLoader } from '@/shared/components/PageLoader';

const RegistrationPage = lazy(() => import('./pages/RegistrationPage'));

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
              <ComingSoon
                title="Patient queue"
                description="OPD queue, active inpatients, beds and rooms (next iteration)"
              />
            </RequirePermission>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
