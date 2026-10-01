import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/core/authentication/AuthContext';
import { canOpenModule, isLicensed, visibleNavItems } from '@/core/modules/registry';
import type { ModuleManifest } from '@/core/modules/types';
import { PageLoader } from '@/shared/components/PageLoader';
import { AccessDenied } from '@/shared/components/AccessDenied';

/** Requires a signed-in user; otherwise redirects to /login and remembers the target. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoader label="Restoring your session…" />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/**
 * Blocks a module when the hospital has not bought it or the user lacks permission.
 * (UX only — the API must enforce the same licence and permission checks.)
 */
export function ModuleGuard({ module, children }: { module: ModuleManifest; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return null;
  if (!isLicensed(user, module)) {
    return (
      <AccessDenied
        title={`${module.name} is not enabled`}
        message="Your hospital's subscription does not include this module. Contact your administrator."
      />
    );
  }
  if (!canOpenModule(user, module)) return <AccessDenied />;

  // Module home the user can't use (e.g. a doctor on /registration): open their first allowed screen instead.
  const items = visibleNavItems(user, module);
  const atRoot = location.pathname.replace(/\/$/, '') === module.basePath;
  if (atRoot && items.length > 0 && items[0].path !== module.basePath) {
    return <Navigate to={items[0].path} replace />;
  }
  return <>{children}</>;
}
