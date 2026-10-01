import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

export const nurseModule: ModuleManifest = {
  code: Modules.NURSE,
  name: 'Nursing',
  basePath: '/nurse',
  requiredPermissions: [Permissions.VITALS_EDIT],
  accent: 'rose',
  navSection: 'Clinical',
  nav: [{ label: 'Nursing Station', path: '/nurse', icon: 'nurse', permissions: [] }],
  load: () => import('./index'),
};
