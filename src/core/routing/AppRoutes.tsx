import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/core/authentication/AuthContext';
import LoginPage from '@/core/authentication/LoginPage';
import { AppLayout } from '@/core/layout/AppLayout';
import { REGISTERED_MODULES, defaultPathFor } from '@/core/modules/registry';
import { PageLoader } from '@/shared/components/PageLoader';
import { AccessDenied } from '@/shared/components/AccessDenied';
import { NotFound } from '@/shared/components/NotFound';
import { ModuleGuard, RequireAuth } from './ProtectedRoute';

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? defaultPathFor(user) : '/login'} replace />;
}

/** Routes are generated from the module registry — no per-module code here. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />

        {REGISTERED_MODULES.map((m) => (
          <Route
            key={m.code}
            path={`${m.basePath.replace(/^\//, '')}/*`}
            element={
              <ModuleGuard module={m}>
                <Suspense fallback={<PageLoader />}>
                  <m.Component />
                </Suspense>
              </ModuleGuard>
            }
          />
        ))}

        <Route path="no-access" element={<AccessDenied />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
