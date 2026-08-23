// /supabase/functions/_shared/pos/transaction-reducer.ts
// SmartStock LiveRetail V2 — POS Transaction Lifecycle State Reducer (V1.1)

import { CanonicalPOSTransaction, CanonicalPOSLine } from './canonical-schema.ts';
import { InventoryEventType } from '../event-model/types.ts';

export type VersionResolution =
  | 'NEW'
  | 'UPDATE'
  | 'DUPLICATE'
  | 'STALE_VERSION'
  | 'CONFLICT';

export interface TransactionPersistedState {
  source_transaction_id: string;
  source_version?: string;
  latest_source_timestamp?: string;
  latest_payload_hash?: string;
  status: string;
  current_inventory_effect: Record<string, number>; // Maps SKU -> net quantity deducted from physical inventory
}

export interface InventoryDeltaToApply {
  sku: string;
  event_type: InventoryEventType;
  quantity_delta: number; // Signed delta: negative reduces physical stock, positive restores
  unit_of_measure: string;
  target_bin?: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE';
  reason: string;
}

export interface ReductionResult {
  version_resolution: VersionResolution;
  deltasToApply: InventoryDeltaToApply[];
  newInventoryEffect: Record<string, number>;
  status: string;
  version?: string;
  payload_hash?: string;
  conflict_detected?: boolean;
}

export class POSTransactionReducer {
  /**
   * Evaluates version monotonicity between existing state and incoming transaction.
   */
  static evaluateVersion(
    priorState: TransactionPersistedState | null,
    incomingTxn: CanonicalPOSTransaction
  ): VersionResolution {
    if (!priorState) {
      return 'NEW';
    }

    // 1. Same version & same payload hash -> DUPLICATE
    if (
      priorState.source_version &&
      incomingTxn.source_version &&
      priorState.source_version === incomingTxn.source_version
    ) {
      if (
        priorState.latest_payload_hash &&
        incomingTxn.payload_hash &&
        priorState.latest_payload_hash === incomingTxn.payload_hash
      ) {
        return 'DUPLICATE';
      }
      if (priorState.status === incomingTxn.status) {
        return 'DUPLICATE';
      }
    }

    // 2. Monotonic timestamp check: if incoming is older than latest recorded timestamp by > 1 minute
    if (priorState.latest_source_timestamp && incomingTxn.business_timestamp) {
      const priorTime = new Date(priorState.latest_source_timestamp).getTime();
      const incomingTime = new Date(incomingTxn.business_timestamp).getTime();
      if (incomingTime < priorTime - 60000) {
        return 'STALE_VERSION';
      }
    }

    // 3. Integer/Sequence version check if numeric versions used
    if (priorState.source_version && incomingTxn.source_version) {
      const priorVerNum = parseInt(priorState.source_version.replace(/\D/g, ''), 10);
      const incomingVerNum = parseInt(incomingTxn.source_version.replace(/\D/g, ''), 10);

      if (!isNaN(priorVerNum) && !isNaN(incomingVerNum)) {
        if (incomingVerNum < priorVerNum) {
          return 'STALE_VERSION';
        }
      }
    }

    return 'UPDATE';
  }

  /**
   * Computes the target physical inventory effect vector for a given transaction.
   * merchandise sales produce negative numbers (reducing physical on-hand),
   * returns with SELLABLE disposition produce positive numbers.
   */
  static computeTargetEffect(txn: CanonicalPOSTransaction): Record<string, number> {
    if (txn.status === 'VOIDED' || txn.status === 'CANCELLED') {
      return {};
    }

    const effect: Record<string, number> = {};

    const processLine = (line: CanonicalPOSLine) => {
      if (line.inventory_behavior === 'NON_STOCK' || line.line_type === 'NON_STOCK' || line.line_type === 'FEE' || line.line_type === 'DISCOUNT') {
        return;
      }
      if (line.inventory_disposition === 'NO_STOCK_EFFECT' || line.inventory_disposition === 'SCRAP' || line.inventory_disposition === 'RETURN_TO_VENDOR') {
        return;
      }

      const sku = line.sku || line.source_sku || 'UNKNOWN_SKU';
      const baseQty = line.base_quantity || (line.quantity * (line.uom_conversion_factor || 1));

      if (!effect[sku]) {
        effect[sku] = 0;
      }

      if (line.line_type === 'RETURN') {
        // Return disposition routing: DAMAGED and QUARANTINE do not increase sellable on-hand
        if (!line.inventory_disposition || line.inventory_disposition === 'SELLABLE') {
          effect[sku] += Math.abs(baseQty);
        }
      } else if (line.line_type === 'MERCHANDISE') {
        effect[sku] -= Math.abs(baseQty);
      }
    };

    // 1. Process regular lines
    for (const line of txn.lines) {
      processLine(line);
    }

    // 2. Process exchange legs if present
    if (txn.exchange_legs) {
      for (const retLine of txn.exchange_legs.return_lines) {
        processLine({ ...retLine, line_type: 'RETURN' });
      }
      for (const repLine of txn.exchange_legs.replacement_lines) {
        processLine({ ...repLine, line_type: 'MERCHANDISE' });
      }
    }

    return effect;
  }

  /**
   * Reduces an incoming transaction against prior state with version guard & disposition routing.
   */
  static reduce(
    priorState: TransactionPersistedState | null,
    incomingTxn: CanonicalPOSTransaction
  ): ReductionResult {
    const versionResolution = this.evaluateVersion(priorState, incomingTxn);

    // If STALE_VERSION or DUPLICATE, emit zero deltas to protect monotonicity
    if (versionResolution === 'STALE_VERSION' || versionResolution === 'DUPLICATE') {
      return {
        version_resolution: versionResolution,
        deltasToApply: [],
        newInventoryEffect: priorState?.current_inventory_effect || {},
        status: incomingTxn.status,
        version: incomingTxn.source_version,
      };
    }

    const priorEffect = priorState?.current_inventory_effect || {};
    const targetEffect = this.computeTargetEffect(incomingTxn);

    const deltas: InventoryDeltaToApply[] = [];
    const allSkus = new Set([...Object.keys(priorEffect), ...Object.keys(targetEffect)]);

    for (const sku of allSkus) {
      const prevApplied = priorEffect[sku] || 0;
      const targetDesired = targetEffect[sku] || 0;
      const difference = targetDesired - prevApplied;

      if (difference !== 0) {
        const matchingLine = incomingTxn.lines.find((l) => (l.sku || l.source_sku) === sku);
        const uom = matchingLine?.base_uom || 'PC';
        const disposition = matchingLine?.inventory_disposition || 'SELLABLE';

        if (difference < 0) {
          deltas.push({
            sku,
            event_type: 'SALE',
            quantity_delta: -Math.abs(difference),
            unit_of_measure: uom,
            target_bin: 'SELLABLE',
            reason: `${incomingTxn.source_system}_${incomingTxn.transaction_type}`,
          });
        } else {
          deltas.push({
            sku,
            event_type: incomingTxn.transaction_type === 'RETURN' ? 'RETURN' : 'SALE_REVERSAL',
            quantity_delta: Math.abs(difference),
            unit_of_measure: uom,
            target_bin: disposition === 'DAMAGED' ? 'DAMAGED' : disposition === 'QUARANTINE' ? 'QUARANTINE' : 'SELLABLE',
            reason: `${incomingTxn.source_system}_CORRECTION_${incomingTxn.status}`,
          });
        }
      }
    }

    return {
      version_resolution: versionResolution,
      deltasToApply: deltas,
      newInventoryEffect: targetEffect,
      status: incomingTxn.status,
      version: incomingTxn.source_version,
      payload_hash: incomingTxn.payload_hash,
    };
  }
}
