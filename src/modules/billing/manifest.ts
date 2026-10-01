import { Modules, Permissions } from '@/core/permissions/permissions';
import type { ModuleManifest } from '@/core/modules/types';

/** Billing and Discharge: inpatient accounts, deposits, settlement, discharge readiness. */
export const billingModule: ModuleManifest = {
  code: Modules.BILLING,
  name: 'Billing and Discharge',
  basePath: '/billing',
  requiredPermissions: [Permissions.BILLING_VIEW],
  accent: 'amber',
  navSection: 'Billing',
  nav: [
    { label: 'Inpatient Billing', path: '/billing', icon: 'billing', permissions: [] },
    { label: 'Discharge', path: '/billing/discharge', icon: 'discharge', permissions: [Permissions.DISCHARGE_MANAGE] },
  ],
  load: () => import('./index'),
};
