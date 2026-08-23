// /src/lib/permissions.ts
// SmartStock LiveRetail V2 — Fine-Grained Permission Catalog & Role Mapping (RC1)

export type TenantRole =
  | 'floor_staff'
  | 'store_manager'
  | 'district_manager'
  | 'regional_controller'
  | 'tenant_admin';

export const PERMISSIONS = {
  // Inventory
  'inventory.read': ['floor_staff', 'store_manager', 'district_manager', 'regional_controller', 'tenant_admin'],
  'inventory.replay.request': ['regional_controller', 'tenant_admin'],

  // Physical Counts & Observations
  'count.perform': ['floor_staff', 'store_manager'],
  'count.approve': ['store_manager', 'district_manager', 'regional_controller', 'tenant_admin'],

  // Financial & Variance Adjustments
  'adjustment.approve': ['store_manager', 'district_manager', 'regional_controller', 'tenant_admin'],
  'adjustment.regional_approve': ['regional_controller', 'tenant_admin'],

  // Replenishment & Purchasing
  'sto.approve': ['store_manager', 'district_manager', 'regional_controller', 'tenant_admin'],
  'po.approve': ['regional_controller', 'tenant_admin'],

  // Integrations & Ops
  'integration.retry': ['tenant_admin'],
  'integration.quarantine.release': ['store_manager', 'district_manager', 'tenant_admin'],

  // Admin Policies
  'admin.policy.edit': ['tenant_admin'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(userRole: TenantRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly string[];
  return allowedRoles ? allowedRoles.includes(userRole) : false;
}
