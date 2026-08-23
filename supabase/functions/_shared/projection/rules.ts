// /supabase/functions/_shared/projection/rules.ts
// SmartStock LiveRetail V2 — Projection Rule Engine
//
// Converts event history into operational inventory state.
// Applies canonical projection rules deterministically according to event_type.

import { InventoryEventType } from '../event-model/types.ts';

export interface PositionState {
  erp_checkpoint_qty: number;
  estimated_on_hand: number;
  sellable_qty: number;
  reserved_qty: number;
  in_transit_qty: number;
  last_physical_count_qty?: number | null;
  last_physical_count_at?: string | null;
  confidence_score: number;
  reconciliation_status: string;
  projection_version: number;
  checkpoint_watermark?: string | null;
  checkpoint_source_watermarks?: Record<string, number> | null;
}

export interface ProjectionEventInput {
  event_id: string;
  event_type: InventoryEventType;
  quantity_delta?: number | null;
  business_timestamp: string;
  source_system?: string;
  source_sequence?: number | null;
  location_id?: string;
  checkpoint_source_watermarks?: Record<string, number> | null;
  metadata?: Record<string, unknown>;
}

export class ProjectionRules {
  /**
   * Evaluates whether an incoming event is provably already incorporated into the SAP baseline snapshot.
   * Uses exact per-source sequence numbers rather than naive timestamp checks.
   */
  static isEventIncludedInCheckpoint(
    event: ProjectionEventInput,
    sourceWatermarks?: Record<string, number> | null
  ): boolean {
    if (!sourceWatermarks || Object.keys(sourceWatermarks).length === 0) {
      return false; // If SAP didn't provide sequence boundaries, do NOT discard late events blindly
    }

    const sourceSystem = event.source_system || (event.metadata?.source_system as string);
    const storeOrLocation = event.location_id || (event.metadata?.location_id as string) || (event.metadata?.store_id as string) || 'default';
    const sourceKey = `${sourceSystem}__${storeOrLocation}`;

    const lastIncorporatedSeq = sourceWatermarks[sourceKey] ?? sourceWatermarks[sourceSystem || ''];
    if (lastIncorporatedSeq == null) {
      return false; // Source not tracked in checkpoint watermarks -> apply event
    }

    const eventSeq = event.source_sequence ?? (event.metadata?.source_sequence as number);
    if (eventSeq == null) {
      return false; // Event lacks sequence -> apply safely
    }

    // Only skip if the event sequence is less than or equal to what SAP actually processed
    return eventSeq <= lastIncorporatedSeq;
  }

  /**
   * Applies a single canonical event to an existing inventory position state.
   * Returns the mutated state deterministically.
   */
  static applyEvent(current: PositionState, event: ProjectionEventInput): PositionState {
    const updated: PositionState = {
      ...current,
      projection_version: current.projection_version + 1,
    };

    const delta = event.quantity_delta ?? 0;

    // Sequence-Aware Watermark Guard:
    // Only skip an additive event if SAP's checkpoint explicitly incorporated this event's source sequence.
    if (
      event.event_type !== 'SAP_CHECKPOINT' &&
      ProjectionRules.isEventIncludedInCheckpoint(event, current.checkpoint_source_watermarks)
    ) {
      return updated; // Skip: event already reflected in SAP baseline
    }

    switch (event.event_type) {
      case 'SAP_CHECKPOINT':
        // Sets absolute authoritative ERP checkpoint quantity and updates sequence watermarks
        updated.erp_checkpoint_qty = delta;
        updated.estimated_on_hand = delta;
        updated.sellable_qty = Math.max(0, delta - updated.reserved_qty);
        updated.checkpoint_watermark = event.business_timestamp;
        updated.checkpoint_source_watermarks =
          event.checkpoint_source_watermarks ||
          (event.metadata?.checkpoint_source_watermarks as Record<string, number>) ||
          null;
        updated.reconciliation_status = 'PENDING_RECONCILIATION';
        break;

      case 'SALE':
        // POS Sale decreases physical on-hand and sellable stock
        updated.estimated_on_hand = Math.max(0, updated.estimated_on_hand - Math.abs(delta));
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      case 'SALE_REVERSAL':
      case 'RETURN':
        // Reversal or customer return increases physical on-hand and sellable stock
        updated.estimated_on_hand += Math.abs(delta);
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      case 'GOODS_RECEIPT':
        // Inbound PO delivery fulfilled: increases on-hand, decrements in-transit
        updated.estimated_on_hand += Math.abs(delta);
        updated.in_transit_qty = Math.max(0, updated.in_transit_qty - Math.abs(delta));
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      case 'TRANSFER_IN':
        // STO inbound transfer increases on-hand
        updated.estimated_on_hand += Math.abs(delta);
        updated.in_transit_qty = Math.max(0, updated.in_transit_qty - Math.abs(delta));
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      case 'TRANSFER_OUT':
        // STO outbound transfer reduces on-hand
        updated.estimated_on_hand = Math.max(0, updated.estimated_on_hand - Math.abs(delta));
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      case 'DAMAGE':
      case 'EXPIRY':
        // Floor scrap / expiration removes stock from on-hand
        updated.estimated_on_hand = Math.max(0, updated.estimated_on_hand - Math.abs(delta));
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      case 'PHYSICAL_COUNT':
        // Store physical count records verified physical quantity
        updated.last_physical_count_qty = delta;
        updated.last_physical_count_at = event.business_timestamp;
        // Physical count does not directly overwrite on-hand without a COUNT_ADJUSTMENT approval
        break;

      case 'COUNT_ADJUSTMENT':
      case 'MANUAL_ADJUSTMENT':
        // Approved discrepancy adjustment directly applies signed delta to on-hand
        updated.estimated_on_hand = Math.max(0, updated.estimated_on_hand + delta);
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      case 'RESERVATION':
        // Reservation increases reserved_qty, decreasing sellable without touching physical on-hand
        updated.reserved_qty += Math.abs(delta);
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      case 'RESERVATION_RELEASE':
        // Reservation cancelled/picked: decreases reserved_qty, freeing sellable
        updated.reserved_qty = Math.max(0, updated.reserved_qty - Math.abs(delta));
        updated.sellable_qty = Math.max(0, updated.estimated_on_hand - updated.reserved_qty);
        break;

      default:
        break;
    }

    return updated;
  }
}
