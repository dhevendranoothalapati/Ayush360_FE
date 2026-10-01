import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { CurrentUser } from '@/core/authentication/types';
import type { Permission } from '@/core/permissions/permissions';
import { NAV_SECTIONS, type Accent, type ModuleManifest, type ModuleNavItem, type NavSection } from './types';

import { registrationModule } from '@/modules/registration/manifest';
import { billingModule } from '@/modules/billing/manifest';
import { doctorModule } from '@/modules/doctor/manifest';
import { nurseModule } from '@/modules/nurse/manifest';
import { pharmacyModule } from '@/modules/pharmacy/manifest';
import { labModule } from '@/modules/lab/manifest';
import { payrollModule } from '@/modules/payroll/manifest';

/**
 * ALL product modules known to this build.
 * To add a module: create src/modules/<name>/ with a manifest.ts, then add it here.
 * Whether a hospital can use it is decided at runtime by its licence (enabledModules).
 */
export const MODULES: ModuleManifest[] = [
  registrationModule,
  billingModule,
  doctorModule,
  nurseModule,
  pharmacyModule,
  labModule,
  payrollModule,
];

export interface RegisteredModule extends ModuleManifest {
  Component: LazyExoticComponent<ComponentType>;
}

/** Lazy components are created once, so each module is a stable code-split chunk. */
export const REGISTERED_MODULES: RegisteredModule[] = MODULES.map((m) => ({ ...m, Component: lazy(m.load) }));

const hasAll = (user: CurrentUser, perms: Permission[]) => perms.every((p) => user.permissions.includes(p));

export function isLicensed(user: CurrentUser, module: ModuleManifest): boolean {
  return user.tenant.enabledModules.includes(module.code);
}

/** Licensed for the hospital AND permitted for the user. */
export function canOpenModule(user: CurrentUser, module: ModuleManifest): boolean {
  return isLicensed(user, module) && hasAll(user, module.requiredPermissions);
}

export function visibleNavItems(user: CurrentUser, module: ModuleManifest): ModuleNavItem[] {
  if (!canOpenModule(user, module)) return [];
  return module.nav.filter((item) => hasAll(user, item.permissions));
}

export interface NavEntry extends ModuleNavItem {
  accent: Accent;
}

export interface NavGroup {
  title: NavSection;
  items: NavEntry[];
}

export function visibleNavigation(user: CurrentUser): NavGroup[] {
  return NAV_SECTIONS.map((title) => ({
    title,
    items: MODULES.filter((m) => m.navSection === title).flatMap((m) =>
      visibleNavItems(user, m).map((item) => ({ ...item, accent: m.accent })),
    ),
  })).filter((g) => g.items.length > 0);
}

/** Can this user open this URL? Used to decide where to land after login. */
export function canOpenPath(user: CurrentUser, path: string): boolean {
  const clean = path.split('?')[0].replace(/\/$/, '') || '/';
  if (clean === '/') return true;
  const module = MODULES.find((m) => clean === m.basePath || clean.startsWith(`${m.basePath}/`));
  if (!module) return true;
  if (!canOpenModule(user, module)) return false;
  const item = module.nav.find((n) => n.path === clean);
  return item ? hasAll(user, item.permissions) : true;
}

/** Landing page after login: first screen the user can open. */
export function defaultPathFor(user: CurrentUser): string {
  return visibleNavigation(user)[0]?.items[0]?.path ?? '/no-access';
}

// Dev-time sanity checks for manifest mistakes.
if (import.meta.env.DEV) {
  const codes = new Set<string>();
  const paths = new Set<string>();
  for (const m of MODULES) {
    if (codes.has(m.code)) console.error(`[modules] duplicate module code ${m.code}`);
    if (paths.has(m.basePath)) console.error(`[modules] duplicate basePath ${m.basePath}`);
    codes.add(m.code);
    paths.add(m.basePath);
    m.nav.forEach((n) => {
      if (!n.path.startsWith(m.basePath))
        console.error(`[modules] ${m.code}: nav path ${n.path} is outside basePath ${m.basePath}`);
    });
  }
}
