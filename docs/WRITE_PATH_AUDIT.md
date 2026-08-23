# SmartStock V2 — Write Path & Mutability Audit

## 1. Single Authoritative Mutation Pathway
The sole authorized write pipeline for inventory data in SmartStock V2 is:

```
[ External Source (POS, SAP, PWA, WMS) ]
                 ↓
    [ Ingestion Gateway ] (Authenticate, Validate, Deduplicate, Sequence Evaluation)
                 ↓ (Transactional atomic insert)
      [ inventory_events ] (Append-only immutable event ledger)
                 ↓
      [ projection_queue ] (Worker claiming)
                 ↓
     [ Projection Worker ] (Idempotent replay & state calculation)
                 ↓
     [ inventory_position ] (Derived operational read model / Digital Twin)
```

## 2. Table-by-Table Responsibility Matrix

| Table Name | Authoritative Writer | Prohibited Writers | Purpose / Notes |
| :--- | :--- | :--- | :--- |
| `inventory_events` | `ingestion-gateway` | Edge functions, UI, POS webhook | Canonical append-only event source. |
| `inventory_position` | `projection-worker` | `ingestion-gateway`, `pos-webhook`, `reorder-engine` | Derived operational twin. Rebuilt via event replay. |
| `projection_queue` | `insert_inventory_event_with_projection` (RPC) | Arbitrary functions | Transactionally paired with event insertion. |
| `projection_applied_events`| `projection-worker` | Any other process | Prevents double-application on worker retries. |
| `integration_outbox` | `reorder-engine`, `case-engine`, workflows | Ad-hoc external HTTP calls | Outbound durable messaging to SAP/ERP. |
| `operational_cases` | `case-engine`, `reconciliation-engine`, `ingestion-gateway` | Ad-hoc user mutations | Action items for Exception Inbox. |
| `workflow_tasks` | `case-engine`, `count-approval-handler` | Floor staff direct creation | Concrete tasks assigned to staff. |
| `live_inventory_ledger` | **DEPRECATED (V1)** | All V2 pipelines | Scheduled for removal in Stage 2. |
| `inventory_movements` | **DEPRECATED (V1)** | All V2 pipelines | Scheduled for removal in Stage 2. |

## 3. Discovered & Mitigated Dual-Write Points

1. **`pos-webhook/index.ts`**:
   - *Issue*: Ingested sales transactions directly inserted rows into `inventory_movements` while simultaneously emitting `SALE` events to `ingestion-gateway`.
   - *Resolution*: Deprecate direct insertion into `inventory_movements`. Keep `pos_transactions` for audit receipt storage, but channel all inventory deduction through canonical `SALE` events via the ingestion gateway.

2. **`reorder-engine/index.ts`**:
   - *Issue*: Read legacy `live_inventory_ledger` instead of `inventory_position`.
   - *Resolution*: Switch query sources to `inventory_position` (reading `estimated_on_hand`, `sellable_qty`, `in_transit_qty`).

3. **`sap-batch-sync/index.ts`**:
   - *Issue*: Mutated baseline quantities directly.
   - *Resolution*: Emits canonical `SAP_CHECKPOINT` events with watermark timestamps.
