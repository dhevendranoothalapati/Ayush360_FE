import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

/** Doctor: own patient queue, consultation, prescription, lab orders, admission request. */
export const doctorModule: ModuleManifest = {
  code: Modules.DOCTOR,
  name: 'Doctor',
  basePath: '/doctor',
  requiredPermissions: [Permissions.ENCOUNTER_VIEW],
  accent: 'teal',
  navSection: 'Clinical',
  nav: [{ label: 'My Patients', path: '/doctor', icon: 'stethoscope', permissions: [] }],
  load: () => import('./index'),
};
