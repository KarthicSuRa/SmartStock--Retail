// /tests/pos/certification/shopify.cert.test.ts
// SmartStock LiveRetail V2 — Shopify POS Connector Certification Test Suite

import { ShopifyPOSConnector } from '../../supabase/functions/_shared/pos/connectors/shopify/shopify-connector';
import { POSCertificationHarness } from './harness';

describe('Shopify POS Connector Certification (Level A Certified)', () => {
  const shopifyConnector = new ShopifyPOSConnector();

  const sampleSingleSale = {
    id: 1009982,
    created_at: '2026-08-22T10:00:00Z',
    processed_at: '2026-08-22T10:00:02Z',
    currency: 'EUR',
    total_price: '37.00',
    line_items: [
      {
        id: 991,
        variant_id: 48129,
        sku: 'MAT-33104',
        title: 'Lavazza Espresso 1kg',
        quantity: 2,
        price: '18.50',
      },
    ],
  };

  const sampleQuantityUpdate = {
    id: 1009982,
    updated_at: '2026-08-22T10:05:00Z',
    currency: 'EUR',
    total_price: '18.50',
    line_items: [
      {
        id: 991,
        variant_id: 48129,
        sku: 'MAT-33104',
        title: 'Lavazza Espresso 1kg',
        quantity: 1, // Decreased by 1
        price: '18.50',
      },
    ],
  };

  const sampleCancel = {
    id: 1009982,
    cancelled_at: '2026-08-22T10:10:00Z',
    line_items: sampleSingleSale.line_items,
  };

  const sampleReturn = {
    id: 1009983,
    created_at: '2026-08-22T11:00:00Z',
    currency: 'EUR',
    line_items: [
      {
        id: 992,
        variant_id: 48129,
        sku: 'MAT-33104',
        quantity: -1,
        price: '18.50',
      },
    ],
  };

  test('Shopify connector passes 100% of certification harness scenarios', async () => {
    const results = await POSCertificationHarness.certifyConnector(shopifyConnector, {
      singleSale: sampleSingleSale,
      quantityUpdate: sampleQuantityUpdate,
      orderCancel: sampleCancel,
      returnSale: sampleReturn,
    });

    for (const r of results) {
      expect(r.passed).toBe(true);
    }
  });
});
