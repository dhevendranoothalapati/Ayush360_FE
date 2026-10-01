import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

export const pharmacyModule: ModuleManifest = {
  code: Modules.PHARMACY,
  name: 'Pharmacy',
  basePath: '/pharmacy',
  requiredPermissions: [Permissions.DISPENSE_CREATE],
  accent: 'violet',
  navSection: 'Pharmacy',
  nav: [{ label: 'Pharmacy', path: '/pharmacy', icon: 'pharmacy', permissions: [] }],
  load: () => import('./index'),
};
