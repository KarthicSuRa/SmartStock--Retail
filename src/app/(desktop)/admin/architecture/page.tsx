'use client';

// /src/app/(desktop)/admin/architecture/page.tsx
// SmartStock — Solution & database architecture reference (layers, data flow, schema domains, design decisions).

import React, { useState } from 'react';
import { ArrowDown, Cloud, Cpu, Database, HardDrive, Monitor, Plug, Server, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { PageHeader } from '@/components/domain/RoleGuard';
import { useI18n } from '@/lib/i18n';

const LAYERS = [
  {
    name: 'Clients',
    icon: Monitor,
    items: [
      { t: 'Desktop web app', d: 'Next.js 15 / React 19 — managers, buyers, admins (Chrome, Edge, Safari, Firefox)' },
      { t: 'Floor Staff PWA', d: 'Installable, offline-first (IndexedDB queue + service worker), camera barcode scanning' },
      { t: 'Handheld scanners', d: 'Android enterprise devices (Zebra/Honeywell) running the PWA in Chrome' },
    ],
  },
  {
    name: 'Application & API',
    icon: Server,
    items: [
      { t: 'Next.js on Netlify', d: 'UI, route handlers (/api/*), role-aware navigation, i18n' },
      { t: 'Supabase Edge Functions (Deno)', d: '40+ functions: POS ingestion, SAP sync, reorder engine, reconciliation, GDPR, exports' },
      { t: 'Supabase Auth', d: 'JWT with custom claims (tenant, role, store scopes) → used by RLS' },
    ],
  },
  {
    name: 'Data',
    icon: Database,
    items: [
      { t: 'PostgreSQL 15 (Supabase)', d: 'System of record: event-sourced inventory ledger + projections, master data, org structure, RBAC, audit & transaction logs, tasks' },
      { t: 'analytics schema', d: 'Star schema (dim_* / fact_*), SCD-2, decision & feature registries for reporting and ML' },
      { t: 'Realtime + Storage', d: 'Live stock pushes to dashboards; file drops (CSV/XML POS exports, report archives)' },
    ],
  },
  {
    name: 'Intelligence',
    icon: Cpu,
    items: [
      { t: 'Python ML services', d: 'forecast-service, anomaly-service, decision-service (FastAPI) + backtesting harness' },
    ],
  },
  {
    name: 'Integration',
    icon: Plug,
    items: [
      { t: 'SAP S/4HANA', d: 'OData / BAPI — material master, PR/PO, GR (MIGO), STO; outbox + idempotency + dead-letter' },
      { t: 'POS connectors', d: 'Shopify, Square, Clover, Lightspeed, generic webhook / file / polling' },
      { t: 'SmartStock Edge agent', d: 'On-prem store agent with SQLite queue for legacy POS databases & file watch' },
    ],
  },
];

interface SchemaDomain { domain: string; purpose: string; tables: string[]; migration: string }

const SCHEMA: SchemaDomain[] = [
  { domain: 'Tenancy & security', purpose: 'Multi-tenant isolation, roles, store scopes', tables: ['tenants', 'tenant_roles', 'user_tenant_memberships', 'user_store_assignments', 'audit_sessions'], migration: '16, 27' },
  { domain: 'Roles & authorizations (new)', purpose: 'Role catalog, module × role access matrix', tables: ['app_roles', 'app_modules', 'role_module_permissions', 'user_role_assignments'], migration: '74' },
  { domain: 'Audit & transaction logs (new)', purpose: 'Who/what/when + success/error per module', tables: ['audit_log', 'transaction_log', 'v_transaction_log_summary'], migration: '74' },
  { domain: 'Org structure (new)', purpose: 'Company code, sales/purchase org, channels, buyers, warehouses', tables: ['company_codes', 'sales_organizations', 'distribution_channels', 'sales_org_channels', 'purchase_organizations', 'buyers', 'warehouses', 'storage_locations', 'store_org_assignments'], migration: '73' },
  { domain: 'Category / MC (new)', purpose: 'Department → Category → MC hierarchy, buyer ownership', tables: ['merchandise_categories', 'v_mc_hierarchy'], migration: '73' },
  { domain: 'Back-store mapping (new)', purpose: 'Bins, SKU ↔ shelf ↔ bin mapping, bin movements', tables: ['storage_bins', 'sku_location_map', 'bin_movements'], migration: '73' },
  { domain: 'Daily tasks & communication (new)', purpose: 'Employee tasks, checklists, announcements, read receipts', tables: ['store_tasks', 'store_task_checklist', 'store_messages', 'store_message_receipts'], migration: '75' },
  { domain: 'Master data', purpose: 'Materials, vendors, sourcing, barcodes', tables: ['material_master', 'vendor_master', 'material_vendor_link', 'barcode_aliases', 'stores', 'erp_configurations'], migration: '15, 16, 18' },
  { domain: 'Inventory ledger', purpose: 'Append-only events → projected positions', tables: ['inventory_events', 'inventory_position', 'inventory_movements', 'inventory_batches', 'projection_queue', 'projection_applied_events', 'physical_counts'], migration: '32–44' },
  { domain: 'POS ingestion', purpose: 'Canonical transactions, identity mapping, quarantine', tables: ['pos_transactions', 'pos_sales_events', 'pos_quarantined_events', 'pos_feed_health', 'pos_product_identity_map', 'pos_connector_cursors'], migration: '19, 55, 56' },
  { domain: 'Procurement & replenishment', purpose: 'Reorder, PR/PO staging, STO, goods receipts', tables: ['reorder_config', 'reorder_alerts', 'staged_prs', 'sto_transfers', 'goods_receipts', 'sales_velocity'], migration: '04–30' },
  { domain: 'Integration reliability', purpose: 'Outbox, retries, dead letters, reconciliation', tables: ['integration_outbox', 'execution_batches', 'retry_queue', 'dead_letter_queue', 'reconciliation_queue', 'sync_audit_log'], migration: '17, 23, 24, 35, 37' },
  { domain: 'Analytics (schema analytics)', purpose: 'Star schema for reports & ML', tables: ['dim_time', 'dim_store', 'dim_product', 'fact_inventory_snapshot', 'fact_inventory_movement', 'fact_physical_count', 'decision_recommendations'], migration: '57–72' },
];

const DECISIONS = [
  ['Database', 'PostgreSQL (managed by Supabase)', 'ACID ledger, rich SQL for reporting, JSONB for raw POS payloads, Row-Level Security for tenant/store isolation, logical replication for realtime.'],
  ['Inventory model', 'Event-sourced ledger + projections', 'Immutable audit trail; positions can be rebuilt/replayed; no lost updates under concurrent POS sales.'],
  ['Multi-tenancy', 'Shared schema + tenant_id + RLS', 'Cheapest to operate; isolation enforced in the database, not only in the UI.'],
  ['Authorization', 'RBAC matrix (role × module × level) + store scope', 'Admins change access without code; the UI hides/locks screens and RLS enforces the same rules server-side.'],
  ['Audit', 'Append-only audit_log & transaction_log (UPDATE/DELETE revoked)', 'Who/what/when evidence for SOC2, GDPR Art. 30 and internal audit.'],
  ['SAP integration', 'Transactional outbox + idempotency keys', 'Exactly-once posting to SAP even with retries and network failures.'],
  ['Offline', 'IndexedDB queue in PWA, SQLite queue at edge', 'Stores keep scanning and counting during connectivity loss.'],
];

export default function ArchitecturePage() {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>('Back-store mapping (new)');

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Architecture')}
        subtitle="How SmartStock is built: client tiers, services, the PostgreSQL database and its schema domains, integrations and key design decisions."
        badge={<Badge status="info" size="sm">PostgreSQL · Supabase · Next.js</Badge>}
        actions={
          <ExportMenu
            title="Database Schema Domains"
            module="reports"
            landscape
            rows={SCHEMA}
            columns={[
              { header: 'Domain', value: (r) => r.domain },
              { header: 'Purpose', value: (r) => r.purpose },
              { header: 'Tables', value: (r) => r.tables.join(', ') },
              { header: 'Migration(s)', value: (r) => r.migration },
            ]}
          />
        }
      />

      {/* Layer diagram */}
      <div className="op-card bg-white p-4 sm:p-5 space-y-2">
        <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider mb-2">Solution layers & data flow</h2>
        {LAYERS.map((layer, i) => {
          const Icon = layer.icon;
          return (
            <React.Fragment key={layer.name}>
              <div className="rounded-xl border border-[#EAECF0] bg-[#F9FAFB] p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#14706B] mb-2"><Icon className="w-4 h-4" /> {layer.name}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {layer.items.map((it) => (
                    <div key={it.t} className="rounded-lg bg-white border border-[#EAECF0] p-2.5">
                      <div className="text-xs font-semibold text-[#101828]">{it.t}</div>
                      <div className="text-[11px] text-[#475467] leading-snug">{it.d}</div>
                    </div>
                  ))}
                </div>
              </div>
              {i < LAYERS.length - 1 && <div className="flex justify-center text-[#98A2B3]"><ArrowDown className="w-4 h-4" /></div>}
            </React.Fragment>
          );
        })}
        <p className="text-[11px] text-[#667085] pt-1">
          Flow: POS sale / floor scan → Edge Function (validate, dedupe) → <span className="font-mono">inventory_events</span> → projection worker → <span className="font-mono">inventory_position</span> → Realtime to UI → reorder engine → <span className="font-mono">integration_outbox</span> → SAP S/4HANA. Every step writes to <span className="font-mono">transaction_log</span>; every user action to <span className="font-mono">audit_log</span>.
        </p>
      </div>

      {/* Schema domains */}
      <div className="op-card bg-white overflow-hidden">
        <div className="p-4 border-b border-[#EAECF0] flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[#14706B]" />
          <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider">Database schema domains ({SCHEMA.length})</h2>
        </div>
        <ul className="divide-y divide-[#EAECF0]">
          {SCHEMA.map((s) => (
            <li key={s.domain}>
              <button onClick={() => setOpen(open === s.domain ? null : s.domain)} className="w-full text-start px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 hover:bg-[#F9FAFB]" aria-expanded={open === s.domain}>
                <span>
                  <span className="text-xs font-semibold text-[#101828]">{s.domain}</span>
                  <span className="block text-[11px] text-[#667085]">{s.purpose}</span>
                </span>
                <span className="text-[10px] font-mono text-[#475467]">{s.tables.length} tables · migration {s.migration}</span>
              </button>
              {open === s.domain && (
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {s.tables.map((tb) => <span key={tb} className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#E8F4F3] text-[#14706B]">{tb}</span>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Decisions */}
      <div className="op-card bg-white overflow-hidden">
        <div className="p-4 border-b border-[#EAECF0] flex items-center gap-2">
          <Cloud className="w-4 h-4 text-[#14706B]" />
          <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider">Key architecture decisions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="bg-[#F9FAFB] text-[#667085] border-b border-[#EAECF0]">
                <th className="py-2 px-4 text-start font-semibold">Topic</th>
                <th className="py-2 px-4 text-start font-semibold">Decision</th>
                <th className="py-2 px-4 text-start font-semibold">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAECF0]">
              {DECISIONS.map(([topic, dec, why]) => (
                <tr key={topic}>
                  <td className="py-2.5 px-4 font-semibold text-[#101828] whitespace-nowrap">{topic}</td>
                  <td className="py-2.5 px-4 text-[#14706B] font-semibold">{dec}</td>
                  <td className="py-2.5 px-4 text-[#475467]">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-[#667085] flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Full write-up: <span className="font-mono">docs/DATABASE_ARCHITECTURE.md</span></p>
    </div>
  );
}
