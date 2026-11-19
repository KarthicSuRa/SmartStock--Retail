'use client';

// /src/lib/activity-log.ts
// SmartStock — Unified audit trail + transaction success/error log.
// Every user action and system transaction is recorded with who / what / when / outcome.
// Mirrors DB tables audit_log & transaction_log (migration 74).

import { createPersistentStore, newId } from './local-store';

export type LogStatus = 'success' | 'error' | 'warning';
export type LogSource = 'user' | 'system';

export interface ActivityEntry {
  id: string;
  ts: string; // ISO UTC
  actor: string;
  role: string;
  source: LogSource;
  module: string; // matches MODULES keys in roles.ts (+ 'pos', 'sap', 'auth')
  action: string;
  entity: string;
  status: LogStatus;
  message?: string;
  ref?: string; // transaction / document reference
  durationMs?: number;
}

export const LOG_MODULES: { key: string; label: string }[] = [
  { key: 'inventory', label: 'Inventory & Ledger' },
  { key: 'backstore', label: 'Back-Store Mapping' },
  { key: 'counts', label: 'Cycle Counts' },
  { key: 'tasks', label: 'Daily Tasks' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'pos', label: 'POS Ingestion' },
  { key: 'sap', label: 'SAP S/4HANA Sync' },
  { key: 'categories', label: 'Category / MC' },
  { key: 'org', label: 'Org Structure' },
  { key: 'users', label: 'Users & Roles' },
  { key: 'reports', label: 'Reports' },
  { key: 'auth', label: 'Login / Session' },
];

export function moduleLabel(key: string): string {
  return LOG_MODULES.find((m) => m.key === key)?.label ?? key;
}

const SEED: ActivityEntry[] = [
  { id: 'seed-01', ts: '2026-11-19T08:02:11Z', actor: 'Sarah Jenkins', role: 'store_manager', source: 'user', module: 'auth', action: 'Login', entity: 'Session', status: 'success', message: 'MFA verified · Chrome 131 / Windows 11' },
  { id: 'seed-02', ts: '2026-11-19T08:05:40Z', actor: 'POS Ingestion Worker', role: 'system', source: 'system', module: 'pos', action: 'Sales batch ingested', entity: 'Store 1001', status: 'success', ref: 'POS-B-4102', durationMs: 412, message: '318 lines applied to ledger' },
  { id: 'seed-03', ts: '2026-11-19T08:11:02Z', actor: 'Lars Van Dijk', role: 'floor_worker', source: 'user', module: 'backstore', action: 'Bin movement', entity: 'MAT-20349 · BS-A-01-02 → SF-03-B', status: 'success', ref: 'BM-7781', message: '24 EA moved to shelf' },
  { id: 'seed-04', ts: '2026-11-19T08:14:55Z', actor: 'SAP Sync Worker', role: 'system', source: 'system', module: 'sap', action: 'Goods receipt post (MIGO 101)', entity: 'PO 4500018823', status: 'error', ref: 'GR-2291', durationMs: 3021, message: 'SAP: M7 021 — Deficit of PO quantity 12 EA. Routed to dead-letter queue.' },
  { id: 'seed-05', ts: '2026-11-19T08:20:30Z', actor: 'Priya Raman', role: 'warehouse_staff', source: 'user', module: 'counts', action: 'Cycle count submitted', entity: 'Bin BS-C-02-01', status: 'warning', ref: 'CC-1120', message: 'Variance −3 EA (−6.2%) awaiting manager approval' },
  { id: 'seed-06', ts: '2026-11-19T08:31:12Z', actor: 'Sarah Jenkins', role: 'store_manager', source: 'user', module: 'counts', action: 'Count variance approved', entity: 'CC-1120', status: 'success', ref: 'CC-1120' },
  { id: 'seed-07', ts: '2026-11-19T08:45:00Z', actor: 'POS Ingestion Worker', role: 'system', source: 'system', module: 'pos', action: 'Sales batch ingested', entity: 'Store 1002', status: 'error', ref: 'POS-B-4103', durationMs: 98, message: 'Schema violation: missing field line_items[7].sku — 1 event quarantined' },
  { id: 'seed-08', ts: '2026-11-19T09:02:44Z', actor: 'Elena Rostova', role: 'supply_chain', source: 'user', module: 'procurement', action: 'PR approved', entity: 'PR 10004471 · €8,420', status: 'success', ref: 'PR-10004471' },
  { id: 'seed-09', ts: '2026-11-19T09:03:10Z', actor: 'SAP Sync Worker', role: 'system', source: 'system', module: 'sap', action: 'PR → PO conversion (BAPI_PO_CREATE1)', entity: 'PR 10004471', status: 'success', ref: 'PO-4500018901', durationMs: 1840 },
  { id: 'seed-10', ts: '2026-11-19T09:15:21Z', actor: 'Karthic B', role: 'system_admin', source: 'user', module: 'users', action: 'Role changed', entity: 'Priya Raman: Floor Staff → Back-Store / Warehouse Staff', status: 'success' },
  { id: 'seed-11', ts: '2026-11-19T09:22:05Z', actor: 'Marco Bianchi', role: 'buyer', source: 'user', module: 'categories', action: 'MC reassigned', entity: 'MC 101020 Yoghurt → Buyer group B02', status: 'success' },
  { id: 'seed-12', ts: '2026-11-19T09:40:19Z', actor: 'Unknown', role: 'floor_worker', source: 'user', module: 'auth', action: 'Login', entity: 'Session', status: 'error', message: '3 failed password attempts — account locked 15 min' },
  { id: 'seed-13', ts: '2026-11-19T10:01:00Z', actor: 'Sarah Jenkins', role: 'store_manager', source: 'user', module: 'tasks', action: 'Task assigned', entity: 'Chiller aisle cleaning → Lars Van Dijk', status: 'success', ref: 'TSK-301' },
  { id: 'seed-14', ts: '2026-11-19T10:12:33Z', actor: 'SAP Sync Worker', role: 'system', source: 'system', module: 'sap', action: 'Material master delta sync', entity: '1,284 materials', status: 'success', ref: 'MD-SYNC-77', durationMs: 9120 },
  { id: 'seed-15', ts: '2026-11-19T10:30:48Z', actor: 'Lars Van Dijk', role: 'floor_worker', source: 'user', module: 'inventory', action: 'Damage registered', entity: 'MAT-30112 · 2 EA', status: 'success', ref: 'DMG-551' },
  { id: 'seed-16', ts: '2026-11-19T10:44:02Z', actor: 'SAP Sync Worker', role: 'system', source: 'system', module: 'sap', action: 'Stock transfer order post', entity: 'STO 1001 → 1004', status: 'warning', ref: 'STO-88213', durationMs: 5230, message: 'Posted after 2 retries (HTTP 503 from OData gateway)' },
];

export const activityStore = createPersistentStore<ActivityEntry[]>('ss.activity-log.v1', () => SEED);

let currentActor = { name: 'Karthic B', role: 'store_manager' };

/** Called by the app shell so every log entry carries the signed-in user & active role. */
export function setActivityActor(name: string, role: string) {
  currentActor = { name, role };
}

export function logActivity(
  entry: Omit<ActivityEntry, 'id' | 'ts' | 'actor' | 'role' | 'source'> & Partial<Pick<ActivityEntry, 'actor' | 'role' | 'source'>>
) {
  const full: ActivityEntry = {
    id: newId('log'),
    ts: new Date().toISOString(),
    actor: entry.actor ?? currentActor.name,
    role: entry.role ?? currentActor.role,
    source: entry.source ?? 'user',
    ...entry,
  } as ActivityEntry;
  activityStore.set((prev) => [...prev, full].slice(-1000));
  return full;
}
