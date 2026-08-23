// /tests/unit/pos/bundle-decomposition.test.ts
// SmartStock LiveRetail V2 — Bundle Decomposition Unit Tests

import { POSBOMDecomposer } from '../../../supabase/functions/_shared/pos/bom-decomposer';
import { POSTransactionReducer } from '../../../supabase/functions/_shared/pos/transaction-reducer';
import { CanonicalPOSTransaction, CanonicalPOSLine } from '../../../supabase/functions/_shared/pos/canonical-schema';

describe('Bundle & Composite SKU Decomposition', () => {
  test('Composite bundle decomposes into its distinct component lines', async () => {
    const rawLines: CanonicalPOSLine[] = [
      {
        line_id: 'bundle-line-1',
        sku: 'GIFT-SET-A',
        quantity: 2,
        source_quantity: 2,
        source_uom: 'EA',
        base_quantity: 2,
        base_uom: 'PC',
        uom_conversion_factor: 1,
        line_type: 'MERCHANDISE',
        inventory_behavior: 'COMPOSITE',
      },
    ];

    // Mock mockSupabase with BOM definition: 1 GIFT-SET-A = 1 SHAMPOO + 1 CONDITIONER
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  { bundle_sku: 'GIFT-SET-A', component_sku: 'SHAMPOO-01', component_quantity: 1, component_uom: 'PC' },
                  { bundle_sku: 'GIFT-SET-A', component_sku: 'CONDITIONER-01', component_quantity: 1, component_uom: 'PC' },
                ],
              }),
          }),
        }),
      }),
    };

    const decomposed = await POSBOMDecomposer.decomposeLines(mockSupabase, 'default-tenant', rawLines);

    expect(decomposed.length).toBe(2);
    expect(decomposed[0].sku).toBe('SHAMPOO-01');
    expect(decomposed[0].quantity).toBe(2);
    expect(decomposed[1].sku).toBe('CONDITIONER-01');
    expect(decomposed[1].quantity).toBe(2);

    // Verify reducer applies correct inventory deduction to components
    const txn: CanonicalPOSTransaction = {
      schema_version: '1.1',
      transaction_id: 'txn-bundle-01',
      source_transaction_id: 'BNDL-01',
      source_system: 'GENERIC',
      tenant_id: 'default-tenant',
      store_id: '1001',
      transaction_type: 'SALE',
      status: 'COMPLETED',
      business_timestamp: '2026-08-22T10:00:00Z',
      received_timestamp: '2026-08-22T10:00:01Z',
      currency: 'EUR',
      metadata: {},
      lines: decomposed,
    };

    const res = POSTransactionReducer.reduce(null, txn);
    expect(res.newInventoryEffect['SHAMPOO-01']).toBe(-2);
    expect(res.newInventoryEffect['CONDITIONER-01']).toBe(-2);
    expect(res.newInventoryEffect['GIFT-SET-A']).toBeUndefined();
  });
});
