import type { ComponentType } from 'react';
import type { ModuleCode, Permission } from '@/core/permissions/permissions';
import type { IconName } from '@/shared/components/Icons';

/** Sidebar sections, in display order. */
export const NAV_SECTIONS = ['Front Desk', 'Billing', 'Clinical', 'Diagnostics', 'Pharmacy', 'Administration'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

/** Colour family used for the module's icons (see .accent-* classes in index.css). */
export type Accent = 'teal' | 'blue' | 'violet' | 'amber' | 'rose' | 'green';

export interface ModuleNavItem {
  label: string;
  /** Absolute path, must start with the module's basePath. */
  path: string;
  icon: IconName;
  /** Permissions needed to see this menu item (on top of the module's own). */
  permissions: Permission[];
}

/**
 * Self-description of a sellable product module.
 *
 * Each module folder exports one manifest from `manifest.ts`. The shell (core)
 * builds routes and the sidebar from these, so adding a module never requires
 * editing core routing or navigation.
 *
 * Keep manifests lightweight: only `load` may reference the module's screens,
 * and it must use a dynamic import so the module stays a separate lazy chunk.
 */
export interface ModuleManifest {
  /** Licensing code. Must match core.tenant_modules / user.tenant.enabledModules. */
  code: ModuleCode;
  /** Display name, e.g. "Front Desk". */
  name: string;
  /** URL prefix owned by this module, e.g. "/registration". */
  basePath: string;
  /** Minimum permission(s) to open the module at all. */
  requiredPermissions: Permission[];
  /** Brand colour for this module's icons in the sidebar and pages. */
  accent: Accent;
  /** Sidebar section this module's items appear under. */
  navSection: NavSection;
  /** Menu entries. The first one the user can access is the module's landing page. */
  nav: ModuleNavItem[];
  /** Lazy entry point. The default export renders the module's own <Routes>. */
  load: () => Promise<{ default: ComponentType }>;
}
