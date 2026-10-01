import type { ModuleCode, Permission } from '@/core/permissions/permissions';

/** Hospital the signed-in user belongs to. Always resolved by the server. */
export interface Tenant {
  id: number;
  code: string;
  name: string;
  city: string;
  enabledModules: ModuleCode[];
}

/** User = identity. Roles/permissions = what they can do. Tenant = which hospital. */
export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  permissions: Permission[];
  tenant: Tenant;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: CurrentUser;
}
