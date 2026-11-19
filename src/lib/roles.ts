'use client';

// /src/lib/roles.ts
// SmartStock — Role catalog, module authorization matrix & restriction checks.
// Mirrors DB tables app_roles / role_module_permissions (migration 74).

import { createPersistentStore } from './local-store';
import { useStoreContext } from '@/hooks/useStoreContext';

export type AccessLevel = 'none' | 'view' | 'edit' | 'approve';
export const ACCESS_ORDER: AccessLevel[] = ['none', 'view', 'edit', 'approve'];

export interface RoleDef {
  key: string;
  label: string;
  description: string;
  scope: 'Store' | 'Region' | 'Network' | 'Tenant';
}

export const ROLES: RoleDef[] = [
  { key: 'store_manager', label: 'Store Manager', description: 'Runs one store: approves counts, adjustments, STOs and assigns staff tasks.', scope: 'Store' },
  { key: 'floor_worker', label: 'Floor Staff', description: 'Scans, counts, moves bins, logs damage and completes daily tasks.', scope: 'Store' },
  { key: 'warehouse_staff', label: 'Back-Store / Warehouse Staff', description: 'Receives goods, maintains back-store bins and replenishes the shelf.', scope: 'Store' },
  { key: 'buyer', label: 'Buyer', description: 'Owns merchandise categories; raises and reviews purchase requisitions.', scope: 'Network' },
  { key: 'regional_manager', label: 'Regional Manager', description: 'Oversees several stores; regional approvals and reporting.', scope: 'Region' },
  { key: 'supply_chain', label: 'Supply Chain', description: 'Replenishment, procurement and FEFO across the network.', scope: 'Network' },
  { key: 'auditor', label: 'Auditor (Read-only)', description: 'Read-only access to ledgers, reports and audit logs.', scope: 'Tenant' },
  { key: 'integration_admin', label: 'Integration Admin', description: 'POS / SAP connectors, quarantine, dead-letter and transaction logs.', scope: 'Tenant' },
  { key: 'system_admin', label: 'System Admin', description: 'Users, roles, org structure, master data and all configuration.', scope: 'Tenant' },
];

export interface ModuleDef {
  key: string;
  label: string;
  group: 'Operations' | 'Master Data' | 'Governance' | 'Integration';
}

export const MODULES: ModuleDef[] = [
  { key: 'inventory', label: 'Inventory & Ledger', group: 'Operations' },
  { key: 'backstore', label: 'Back-Store Stock Mapping', group: 'Operations' },
  { key: 'counts', label: 'Cycle Counts', group: 'Operations' },
  { key: 'tasks', label: 'Daily Tasks & Communication', group: 'Operations' },
  { key: 'procurement', label: 'Procurement & Replenishment', group: 'Operations' },
  { key: 'reports', label: 'Reports & Exports', group: 'Operations' },
  { key: 'categories', label: 'Category / MC Grouping', group: 'Master Data' },
  { key: 'org', label: 'Org Structure', group: 'Master Data' },
  { key: 'users', label: 'Users & Roles', group: 'Governance' },
  { key: 'audit', label: 'Audit Logs', group: 'Governance' },
  { key: 'translogs', label: 'Success / Error Logs', group: 'Integration' },
  { key: 'integration', label: 'POS / SAP Integration', group: 'Integration' },
];

type Matrix = Record<string, Record<string, AccessLevel>>;

const row = (levels: AccessLevel[]): Record<string, AccessLevel> =>
  Object.fromEntries(MODULES.map((m, i) => [m.key, levels[i]]));

// Column order = MODULES order:
//                      inv     back    counts  tasks    proc     reports cat     org     users    audit   translog integ
export const DEFAULT_MATRIX: Matrix = {
  store_manager:     row(['approve', 'approve', 'approve', 'approve', 'edit', 'view', 'view', 'view', 'view', 'view', 'view', 'none']),
  floor_worker:      row(['view', 'edit', 'edit', 'edit', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none']),
  warehouse_staff:   row(['view', 'edit', 'edit', 'edit', 'view', 'none', 'none', 'none', 'none', 'none', 'none', 'none']),
  buyer:             row(['view', 'view', 'none', 'view', 'approve', 'view', 'edit', 'view', 'none', 'none', 'none', 'none']),
  regional_manager:  row(['approve', 'view', 'approve', 'view', 'approve', 'edit', 'view', 'view', 'view', 'view', 'view', 'none']),
  supply_chain:      row(['edit', 'view', 'view', 'view', 'approve', 'edit', 'edit', 'view', 'none', 'view', 'view', 'view']),
  auditor:           row(['view', 'view', 'view', 'view', 'view', 'view', 'view', 'view', 'view', 'view', 'view', 'view']),
  integration_admin: row(['view', 'none', 'none', 'none', 'none', 'view', 'view', 'view', 'none', 'view', 'approve', 'approve']),
  system_admin:      row(['approve', 'approve', 'approve', 'approve', 'approve', 'approve', 'approve', 'approve', 'approve', 'approve', 'approve', 'approve']),
};

export const matrixStore = createPersistentStore<Matrix>('ss.role-matrix.v1', () => DEFAULT_MATRIX);

export function roleLabel(key: string): string {
  return ROLES.find((r) => r.key === key)?.label ?? key.replace(/_/g, ' ');
}

export function levelFor(matrix: Matrix, role: string, module: string): AccessLevel {
  return matrix[role]?.[module] ?? 'none';
}

export function meets(level: AccessLevel, required: AccessLevel): boolean {
  return ACCESS_ORDER.indexOf(level) >= ACCESS_ORDER.indexOf(required);
}

/** Hook: current role's access to a module, plus convenience flags. */
export function useAuthorization(module: string) {
  const { role } = useStoreContext();
  const [matrix] = matrixStore.useStore();
  const level = levelFor(matrix, role, module);
  return {
    role,
    level,
    canView: meets(level, 'view'),
    canEdit: meets(level, 'edit'),
    canApprove: meets(level, 'approve'),
  };
}
