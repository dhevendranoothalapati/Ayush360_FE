import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

/** Front Desk: patient registration, OP queue and inpatient queue. */
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
    { label: 'OP Queue', path: '/registration/queue', icon: 'queue', permissions: [Permissions.QUEUE_VIEW] },
    {
      label: 'Inpatient Queue',
      path: '/registration/inpatients',
      icon: 'discharge',
      permissions: [Permissions.QUEUE_VIEW],
    },
  ],
  load: () => import('./index'),
};
