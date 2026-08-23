// /supabase/functions/_shared/event-model/types.ts
// SmartStock LiveRetail V2 — Canonical Inventory Event Model
//
// This file defines the canonical event envelope that every inventory-changing
// observation must conform to before entering the SmartStock event ledger.
// All source system adapters (POS, SAP, PWA, WMS) transform their native
// payloads into this structure at the ingestion gateway boundary.

// ---------------------------------------------------------------------------
// EVENT TYPE ENUM
// ---------------------------------------------------------------------------
// Must stay in sync with the inventory_event_type postgres enum in migration 32.

export type InventoryEventType =
  // SAP anchor
  | 'SAP_CHECKPOINT'
  // POS
  | 'SALE'
  | 'SALE_REVERSAL'
  | 'RETURN'
  // Supply chain
  | 'GOODS_RECEIPT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  // Damage and waste
  | 'DAMAGE'
  | 'EXPIRY'
  // Physical counting
  | 'PHYSICAL_COUNT'
  | 'COUNT_ADJUSTMENT'
  // Reservations
  | 'RESERVATION'
  | 'RESERVATION_RELEASE'
  // Override
  | 'MANUAL_ADJUSTMENT';

// ---------------------------------------------------------------------------
// SEQUENCE STATUS
// ---------------------------------------------------------------------------
// Determined by the ingestion gateway when evaluating event ordering.
// GAP_DETECTED generates an integration warning case — it does NOT reject.

export type EventSequenceStatus =
  | 'IN_ORDER'
  | 'LATE'
  | 'GAP_DETECTED'
  | 'DUPLICATE'
  | 'INVALID';

// ---------------------------------------------------------------------------
// SOURCE SYSTEM IDENTIFIERS
// ---------------------------------------------------------------------------

export type SourceSystem =
  | 'POS'           // Point-of-sale register (Lightspeed, Square, etc.)
  | 'SAP'           // SAP S/4HANA OData extraction
  | 'PWA'           // Mobile floor staff Progressive Web App
  | 'WMS'           // Warehouse Management System
  | 'MOCK'          // Test / simulator (Mock SAP server)
  | 'SYSTEM';       // Internal SmartStock generated events

// ---------------------------------------------------------------------------
// CANONICAL INVENTORY EVENT ENVELOPE
// ---------------------------------------------------------------------------
// Every event entering the SmartStock event ledger must conform to this shape.
// This is the single integration contract across all source systems.

export interface InventoryEventEnvelope {
  // --- Idempotency key (required) ---
  // Must be globally unique for this event. Used to prevent double-processing.
  // Recommended format: `{source_system}_{source_event_id}_{tenant_id}`
  idempotency_key: string;

  // --- Classification ---
  event_type: InventoryEventType;

  // --- Tenant + Location + Material scoping ---
  tenant_id: string;
  location_id: string;   // Corresponds to erp_plants.id
  material_id?: string;  // Optional: some events are location-level (e.g. feed health)

  // --- Source traceability ---
  source_system: SourceSystem;
  source_event_id: string;    // Original ID in the source system
  source_sequence?: number;   // Source system's monotonic sequence number (if available)

  // --- Timing ---
  business_timestamp: string; // ISO 8601 — when the event occurred in the real world
  received_timestamp?: string; // Set by gateway if not provided; defaults to NOW()

  // --- Quantity ---
  // Positive = stock increase, Negative = stock decrease.
  // Null for events that only affect sellable/reserved split (RESERVATION).
  quantity_delta?: number;
  unit_of_measure?: string;   // Must match SAP UOM: PC, KG, L, EA, etc.

  // --- Causation tracing ---
  correlation_id?: string;  // Groups related events in one business flow
  causation_id?: string;    // The event that caused this one

  // --- External document reference ---
  reference_type?: string;  // 'PURCHASE_ORDER' | 'MATERIAL_DOCUMENT' | 'STO' | 'CYCLE_COUNT'
  reference_id?: string;    // Document number in source system

  // --- Schema version ---
  schema_version: string;   // Current: '1.0'

  // --- Raw source payload (for debugging and replay) ---
  raw_payload: Record<string, unknown>;

  // --- Extensible metadata ---
  // Weather context, promotion ID, staff ID, device ID, etc.
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// INGESTION GATEWAY RESPONSE
// ---------------------------------------------------------------------------

export type IngestionStatus =
  | 'ACCEPTED'      // Event stored and projection enqueued
  | 'DUPLICATE'     // Idempotent duplicate — no action needed
  | 'INVALID'       // Failed validation — stored for audit but not applied
  | 'REJECTED';     // Authentication failure or malformed envelope

export interface IngestionResult {
  status: IngestionStatus;
  event_id?: string;          // UUID of the stored inventory_events row
  sequence_status?: EventSequenceStatus;
  validation_errors?: string[];
  duplicate_event_id?: string; // ID of the previously stored duplicate
  message?: string;
}

// ---------------------------------------------------------------------------
// PROJECTION EVENT (emitted after event is stored)
// ---------------------------------------------------------------------------
// Enqueued for the async projection worker to process.

export interface ProjectionTask {
  event_id: string;
  tenant_id: string;
  location_id: string;
  material_id?: string;
  event_type: InventoryEventType;
  quantity_delta?: number;
  business_timestamp: string;
  enqueued_at: string;
}

// ---------------------------------------------------------------------------
// QUANTITY DIRECTION HELPERS
// ---------------------------------------------------------------------------
// Determines whether an event type increases or decreases on-hand inventory.

export function quantityDirection(
  eventType: InventoryEventType
): 'INCREASE' | 'DECREASE' | 'SET' | 'SELLABLE_ONLY' | 'NONE' {
  switch (eventType) {
    case 'SALE':
    case 'TRANSFER_OUT':
    case 'DAMAGE':
    case 'EXPIRY':
      return 'DECREASE';

    case 'SALE_REVERSAL':
    case 'RETURN':
    case 'GOODS_RECEIPT':
    case 'TRANSFER_IN':
    case 'COUNT_ADJUSTMENT':
    case 'MANUAL_ADJUSTMENT':
      return 'INCREASE';

    case 'SAP_CHECKPOINT':
    case 'PHYSICAL_COUNT':
      // These set absolute quantity, not delta
      return 'SET';

    case 'RESERVATION':
    case 'RESERVATION_RELEASE':
      // Affects sellable split only — on-hand physical quantity unchanged
      return 'SELLABLE_ONLY';

    default:
      return 'NONE';
  }
}

// ---------------------------------------------------------------------------
// EVENTS REQUIRING MANAGER APPROVAL BEFORE BEING APPLIED
// ---------------------------------------------------------------------------

export const APPROVAL_REQUIRED_EVENTS: InventoryEventType[] = [
  'COUNT_ADJUSTMENT',
  'MANUAL_ADJUSTMENT',
];

// ---------------------------------------------------------------------------
// EVENTS THAT TRIGGER RECONCILIATION CHECK
// ---------------------------------------------------------------------------

export const RECONCILIATION_TRIGGER_EVENTS: InventoryEventType[] = [
  'SAP_CHECKPOINT',
  'PHYSICAL_COUNT',
];
