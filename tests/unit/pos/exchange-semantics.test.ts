// /tests/unit/pos/exchange-semantics.test.ts
// SmartStock LiveRetail V2 — Exchange Semantics Unit Tests

import { POSTransactionReducer } from '../../../supabase/functions/_shared/pos/transaction-reducer';
import { CanonicalPOSTransaction } from '../../../supabase/functions/_shared/pos/canonical-schema';

describe('Exchange Semantics Decomposition', () => {
  test('Exchange transaction decomposes into RETURN SKU-M (+1) and SALE SKU-L (-1)', () => {
    const exchangeTxn: CanonicalPOSTransaction = {
      schema_version: '1.1',
      transaction_id: 'txn-exch-01',
      source_transaction_id: 'EXCH-8821',
      source_system: 'SQUARE',
      tenant_id: 'default-tenant',
      store_id: '1001',
      transaction_type: 'EXCHANGE',
      status: 'COMPLETED',
      business_timestamp: '2026-08-22T10:00:00Z',
      received_timestamp: '2026-08-22T10:00:01Z',
      currency: 'EUR',
      metadata: {},
      lines: [],
      exchange_legs: {
        return_lines: [
          {
            line_id: 'ret-1',
            sku: 'SHIRT-M',
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
        replacement_lines: [
          {
            line_id: 'rep-1',
            sku: 'SHIRT-L',
            quantity: 1,
            source_quantity: 1,
            source_uom: 'EA',
            base_quantity: 1,
            base_uom: 'PC',
            uom_conversion_factor: 1,
            line_type: 'MERCHANDISE',
          },
        ],
      },
    };

    const res = POSTransactionReducer.reduce(null, exchangeTxn);

    expect(res.newInventoryEffect['SHIRT-M']).toBe(1);
    expect(res.newInventoryEffect['SHIRT-L']).toBe(-1);
    expect(res.deltasToApply.length).toBe(2);

    const shirtM = res.deltasToApply.find((d) => d.sku === 'SHIRT-M');
    const shirtL = res.deltasToApply.find((d) => d.sku === 'SHIRT-L');

    expect(shirtM?.quantity_delta).toBe(1);
    expect(shirtL?.quantity_delta).toBe(-1);
  });
});
