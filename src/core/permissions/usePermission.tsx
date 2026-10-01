import type { ReactNode } from 'react';
import { useAuth } from '@/core/authentication/AuthContext';
import type { Permission } from './permissions';

/** UX helper only — the backend re-checks every permission. */
export function useHasPermission(...required: Permission[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return required.every((p) => user.permissions.includes(p));
}

interface RequirePermissionProps {
  permissions: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders children only when the user holds all listed permissions. */
export function RequirePermission({ permissions, children, fallback = null }: RequirePermissionProps) {
  const allowed = useHasPermission(...permissions);
  return <>{allowed ? children : fallback}</>;
}
