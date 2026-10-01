import { useAuth } from '@/core/authentication/AuthContext';
import type { ModuleCode } from '@/core/permissions/permissions';
import type { Tenant } from '@/core/authentication/types';

/**
 * The current hospital (tenant).
 *
 * It is ALWAYS taken from the authenticated session returned by the server.
 * There is intentionally no setter: the React client cannot switch tenants by
 * changing an id. Use it for display (hospital name) and module licensing only —
 * never pass tenant.id to the API.
 */
export function useTenant(): Tenant | null {
  return useAuth().user?.tenant ?? null;
}

export function useIsModuleEnabled(module: ModuleCode): boolean {
  return useTenant()?.enabledModules.includes(module) ?? false;
}
