import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

export const labModule: ModuleManifest = {
  code: Modules.LAB,
  name: 'Laboratory',
  basePath: '/lab',
  requiredPermissions: [Permissions.LAB_ORDER_VIEW],
  accent: 'green',
  navSection: 'Diagnostics',
  nav: [{ label: 'Laboratory', path: '/lab', icon: 'lab', permissions: [] }],
  load: () => import('./index'),
};
