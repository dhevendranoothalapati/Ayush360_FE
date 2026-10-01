import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

export const payrollModule: ModuleManifest = {
  code: Modules.PAYROLL,
  name: 'Payroll',
  basePath: '/payroll',
  requiredPermissions: [Permissions.PAYROLL_VIEW],
  accent: 'blue',
  navSection: 'Administration',
  nav: [{ label: 'Payroll', path: '/payroll', icon: 'payroll', permissions: [] }],
  load: () => import('./index'),
};
