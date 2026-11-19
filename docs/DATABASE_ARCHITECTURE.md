# SmartStock — Database Architecture

**Database:** PostgreSQL 15, managed by Supabase (Auth, Realtime, Storage, Edge Functions).
**Model:** shared schema, multi-tenant; every business table has a `tenant_id`, and Row-Level Security (RLS) enforces tenant isolation using `current_setting('app.current_tenant')`.
**Schemas:** `public` holds operational data. `analytics` holds the star schema for reporting and ML.

## Why PostgreSQL

| Need | How PostgreSQL / Supabase covers it |
|---|---|
| Correct stock under concurrent POS sales | ACID transactions, append-only event ledger with projections |
| Security per tenant / store / role | RLS policies + `has_module_access()` function |
| Reporting & exports | SQL views (`v_*`), `analytics` star schema |
| Raw POS / SAP payloads | `JSONB` columns |
| Live dashboards | Supabase Realtime (logical replication) |
| Audit evidence | Append-only tables (`UPDATE`/`DELETE` revoked) |

## Schema domains

| Domain | Key tables | Migration |
|---|---|---|
| Tenancy & security | `tenants`, `tenant_roles`, `user_tenant_memberships`, `user_store_assignments`, `audit_sessions` | 16, 27 |
| **Org structure** | `company_codes` (BUKRS), `sales_organizations` (VKORG), `distribution_channels` (VTWEG), `sales_org_channels`, `purchase_organizations` (EKORG), `buyers` (EKGRP), `warehouses` (LGNUM + differentiator), `storage_locations` (LGORT), `store_org_assignments` | 73 |
| **Category / MC** | `merchandise_categories` (Department → Category → MC), view `v_mc_hierarchy` | 73 |
| **Back-store mapping** | `storage_bins`, `sku_location_map` (SKU ↔ shelf ↔ bin), `bin_movements` (append-only), view `v_shelf_replenishment_due` | 73 |
| **Roles & authorizations** | `app_roles`, `app_modules`, `role_module_permissions` (none / view / edit / approve), `user_role_assignments`, fn `has_module_access()` | 74 |
| **Audit & transaction logs** | `audit_log` (who / what / when / before / after), `transaction_log` (success / warning / error per module), view `v_transaction_log_summary` | 74 |
| **Daily tasks & communication** | `store_tasks`, `store_task_checklist`, `store_messages`, `store_message_receipts`, view `v_task_completion_daily` | 75 |
| Master data | `material_master`, `vendor_master`, `material_vendor_link`, `barcode_aliases`, `stores` | 15, 16, 18 |
| Inventory ledger | `inventory_events` → `inventory_position`, `inventory_movements`, `inventory_batches`, `physical_counts` | 32–44 |
| POS ingestion | `pos_transactions`, `pos_sales_events`, `pos_quarantined_events`, `pos_feed_health` | 19, 55, 56 |
| Procurement | `reorder_config`, `staged_prs`, `sto_transfers`, `goods_receipts` | 04–30 |
| Integration reliability | `integration_outbox`, `execution_batches`, `retry_queue`, `dead_letter_queue` | 17, 23, 24, 35 |
| Analytics | `analytics.dim_*`, `analytics.fact_*`, decision & feature registries | 57–72 |

## Org structure relationships

```
Company Code (BUKRS)
 ├── Sales Organization (VKORG) ──< Distribution Channel (VTWEG)
 ├── Purchase Organization (EKORG) ──< Buyer / Purchasing Group (EKGRP) ──< Merchandise Category
 └── Store / Plant (WERKS)
       ├── Storage Location (LGORT) 0001 floor · 0002 back-store · 0003 quarantine
       └── Warehouse (differentiator: EWM | Lean WM | IM) ──< Storage Bin ──< SKU location map
```

## Write paths & logging

1. Every user action writes one row to `audit_log`: actor, role, module, action, entity, outcome, and before/after state.
2. Every system or user transaction (POS batch, SAP posting, bin movement, task completion) writes one row to `transaction_log`: module, reference, outcome, error code/message, duration, and retries.
3. Both tables are append-only and indexed by `(tenant_id, module_key, occurred_at DESC)`.

## Front-end state (current demo build)

The new modules (`/backstore`, `/tasks`, `/reports`, `/admin/org-structure`, `/admin/categories`, `/admin/roles`, `/admin/audit`, `/admin/transaction-logs`) currently keep their state in the browser (`src/lib/local-store.ts`), seeded with demo data. The stores mirror the tables above one-to-one, so replacing them with Supabase queries is a mechanical change.
