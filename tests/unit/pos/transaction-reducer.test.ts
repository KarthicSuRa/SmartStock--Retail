// /tests/unit/pos/transaction-reducer.test.ts
// SmartStock LiveRetail V2 — POS Transaction State Reducer Unit Tests

import { POSTransactionReducer, TransactionPersistedState } from '../../../supabase/functions/_shared/pos/transaction-reducer';
import { CanonicalPOSTransaction } from '../../../supabase/functions/_shared/pos/canonical-schema';

describe('POS Transaction Lifecycle State Reducer', () => {
  const baseTxn: CanonicalPOSTransaction = {
    schema_version: '1.0',
    transaction_id: 'txn-test-01',
    source_transaction_id: 'SHPFY-99881',
    source_system: 'SHOPIFY',
    tenant_id: 'default-tenant',
    store_id: '1001',
    transaction_type: 'SALE',
    status: 'COMPLETED',
    business_timestamp: '2026-08-22T10:00:00Z',
    received_timestamp: '2026-08-22T10:00:01Z',
    currency: 'EUR',
    metadata: {},
    lines: [
      {
        line_id: 'line-1',
        sku: 'MAT-33104',
        source_sku: 'variant-lavazza',
        quantity: 2,
        source_quantity: 2,
        source_uom: 'EA',
        base_quantity: 2,
        base_uom: 'PC',
        uom_conversion_factor: 1,
        line_type: 'MERCHANDISE',
      },
    ],
  };

  test('Initial order creation emits SALE -2', () => {
    const res = POSTransactionReducer.reduce(null, baseTxn);

    expect(res.deltasToApply.length).toBe(1);
    expect(res.deltasToApply[0].sku).toBe('MAT-33104');
    expect(res.deltasToApply[0].event_type).toBe('SALE');
    expect(res.deltasToApply[0].quantity_delta).toBe(-2);
    expect(res.newInventoryEffect['MAT-33104']).toBe(-2);
  });

  test('Order update reducing quantity from 2 to 1 emits SALE_REVERSAL +1 (not an additional sale)', () => {
    const priorState: TransactionPersistedState = {
      source_transaction_id: 'SHPFY-99881',
      status: 'COMPLETED',
      current_inventory_effect: { 'MAT-33104': -2 },
    };

    const updatedTxn: CanonicalPOSTransaction = {
      ...baseTxn,
      source_version: 'v2',
      lines: [
        {
          ...baseTxn.lines[0],
          quantity: 1,
          base_quantity: 1,
          source_quantity: 1,
        },
      ],
    };

    const res = POSTransactionReducer.reduce(priorState, updatedTxn);

    expect(res.deltasToApply.length).toBe(1);
    expect(res.deltasToApply[0].event_type).toBe('SALE_REVERSAL');
    expect(res.deltasToApply[0].quantity_delta).toBe(1);
    expect(res.newInventoryEffect['MAT-33104']).toBe(-1);
  });

  test('Full order cancellation reverses remaining applied inventory effect', () => {
    const priorState: TransactionPersistedState = {
      source_transaction_id: 'SHPFY-99881',
      status: 'COMPLETED',
      current_inventory_effect: { 'MAT-33104': -1 },
    };

    const cancelledTxn: CanonicalPOSTransaction = {
      ...baseTxn,
      status: 'CANCELLED',
      transaction_type: 'CANCEL',
    };

    const res = POSTransactionReducer.reduce(priorState, cancelledTxn);

    expect(res.deltasToApply.length).toBe(1);
    expect(res.deltasToApply[0].event_type).toBe('SALE_REVERSAL');
    expect(res.deltasToApply[0].quantity_delta).toBe(1);
    expect(res.newInventoryEffect['MAT-33104']).toBeUndefined();
  });
});
