import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

/** Front Desk: patient registration and patient queue. */
export const registrationModule: ModuleManifest = {
  code: Modules.REGISTRATION,
  name: 'Front Desk',
  basePath: '/registration',
  requiredPermissions: [Permissions.PATIENT_VIEW],
  accent: 'teal',
  navSection: 'Front Desk',
  nav: [
    {
      label: 'Registration',
      path: '/registration',
      icon: 'registration',
      permissions: [Permissions.REGISTRATION_CREATE],
    },
    { label: 'Patient Queue', path: '/registration/queue', icon: 'queue', permissions: [Permissions.QUEUE_VIEW] },
  ],
  load: () => import('./index'),
};
