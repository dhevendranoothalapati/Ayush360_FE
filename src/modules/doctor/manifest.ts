import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

export const doctorModule: ModuleManifest = {
  code: Modules.DOCTOR,
  name: 'Doctor',
  basePath: '/doctor',
  requiredPermissions: [Permissions.ENCOUNTER_VIEW],
  accent: 'blue',
  navSection: 'Clinical',
  nav: [{ label: 'Doctor Workspace', path: '/doctor', icon: 'doctor', permissions: [] }],
  load: () => import('./index'),
};
