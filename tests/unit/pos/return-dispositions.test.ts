// /tests/unit/pos/return-dispositions.test.ts
// SmartStock LiveRetail V2 — Return Dispositions Unit Tests

import { POSTransactionReducer } from '../../../supabase/functions/_shared/pos/transaction-reducer';
import { CanonicalPOSTransaction } from '../../../supabase/functions/_shared/pos/canonical-schema';

describe('Return Inventory Dispositions', () => {
  const baseReturnTxn: CanonicalPOSTransaction = {
    schema_version: '1.1',
    transaction_id: 'txn-ret-01',
    source_transaction_id: 'RET-101',
    source_system: 'SHOPIFY',
    tenant_id: 'default-tenant',
    store_id: '1001',
    transaction_type: 'RETURN',
    status: 'COMPLETED',
    business_timestamp: '2026-08-22T10:00:00Z',
    received_timestamp: '2026-08-22T10:00:01Z',
    currency: 'EUR',
    metadata: {},
    lines: [
      {
        line_id: 'line-1',
        sku: 'JACKET-01',
        quantity: 1,
        source_quantity: 1,
        source_uom: 'EA',
        base_quantity: 1,
        base_uom: 'PC',
        uom_conversion_factor: 1,
        line_type: 'RETURN',
        inventory_disposition: 'SELLABLE',
      },
    ],
  };

  test('Sellable return adds +1 to sellable inventory effect', () => {
    const res = POSTransactionReducer.reduce(null, baseReturnTxn);
    expect(res.deltasToApply.length).toBe(1);
    expect(res.deltasToApply[0].quantity_delta).toBe(1);
    expect(res.newInventoryEffect['JACKET-01']).toBe(1);
  });

  test('Damaged return does not increase sellable on-hand effect', () => {
    const damagedTxn: CanonicalPOSTransaction = {
      ...baseReturnTxn,
      lines: [
        {
          ...baseReturnTxn.lines[0],
          inventory_disposition: 'DAMAGED',
        },
      ],
    };

    const res = POSTransactionReducer.reduce(null, damagedTxn);
    // Damaged return produces 0 effect on sellable inventory
    expect(res.newInventoryEffect['JACKET-01']).toBeUndefined();
  });

  test('Scrap or No-Stock-Effect disposition produces 0 inventory mutation', () => {
    const scrapTxn: CanonicalPOSTransaction = {
      ...baseReturnTxn,
      lines: [
        {
          ...baseReturnTxn.lines[0],
          inventory_disposition: 'SCRAP',
        },
      ],
    };

    const res = POSTransactionReducer.reduce(null, scrapTxn);
    expect(res.deltasToApply.length).toBe(0);
    expect(res.newInventoryEffect['JACKET-01']).toBeUndefined();
  });
});
