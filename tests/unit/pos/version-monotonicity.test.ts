// /tests/unit/pos/version-monotonicity.test.ts
// SmartStock LiveRetail V2 — Transaction Version Monotonicity Unit Tests

import { POSTransactionReducer, TransactionPersistedState } from '../../../supabase/functions/_shared/pos/transaction-reducer';
import { CanonicalPOSTransaction } from '../../../supabase/functions/_shared/pos/canonical-schema';

describe('Transaction Version Monotonicity Guard', () => {
  const baseTxn: CanonicalPOSTransaction = {
    schema_version: '1.1',
    transaction_id: 'txn-ver-01',
    source_transaction_id: 'ORDER-771',
    source_system: 'SHOPIFY',
    source_version: 'v2',
    tenant_id: 'default-tenant',
    store_id: '1001',
    transaction_type: 'SALE',
    status: 'COMPLETED',
    business_timestamp: '2026-08-22T10:05:00Z',
    received_timestamp: '2026-08-22T10:05:01Z',
    currency: 'EUR',
    metadata: {},
    lines: [
      {
        line_id: 'l-1',
        sku: 'SKU-A',
        quantity: 1,
        source_quantity: 1,
        source_uom: 'EA',
        base_quantity: 1,
        base_uom: 'PC',
        uom_conversion_factor: 1,
        line_type: 'MERCHANDISE',
      },
    ],
  };

  test('Out-of-order stale payload (older timestamp or version) is rejected as STALE_VERSION with 0 deltas', () => {
    const priorState: TransactionPersistedState = {
      source_transaction_id: 'ORDER-771',
      source_version: 'v3',
      latest_source_timestamp: '2026-08-22T10:10:00Z', // 5 minutes newer
      status: 'COMPLETED',
      current_inventory_effect: { 'SKU-A': -2 },
    };

    const staleIncomingTxn: CanonicalPOSTransaction = {
      ...baseTxn,
      source_version: 'v2', // Older version
      business_timestamp: '2026-08-22T10:00:00Z', // Older timestamp
    };

    const res = POSTransactionReducer.reduce(priorState, staleIncomingTxn);

    expect(res.version_resolution).toBe('STALE_VERSION');
    expect(res.deltasToApply.length).toBe(0);
    // Preserves existing state without regression
    expect(res.newInventoryEffect['SKU-A']).toBe(-2);
  });

  test('Identical payload with same version is recognized as DUPLICATE with 0 deltas', () => {
    const priorState: TransactionPersistedState = {
      source_transaction_id: 'ORDER-771',
      source_version: 'v2',
      latest_source_timestamp: '2026-08-22T10:05:00Z',
      latest_payload_hash: 'hash-abc-123',
      status: 'COMPLETED',
      current_inventory_effect: { 'SKU-A': -1 },
    };

    const duplicateTxn: CanonicalPOSTransaction = {
      ...baseTxn,
      source_version: 'v2',
      payload_hash: 'hash-abc-123',
    };

    const res = POSTransactionReducer.reduce(priorState, duplicateTxn);

    expect(res.version_resolution).toBe('DUPLICATE');
    expect(res.deltasToApply.length).toBe(0);
  });
});
