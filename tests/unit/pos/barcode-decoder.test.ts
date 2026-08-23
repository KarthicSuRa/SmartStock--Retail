// /tests/unit/pos/barcode-decoder.test.ts
// SmartStock LiveRetail V2 — Grocery Weighted Barcode Decoder Unit Tests

import { POSBarcodeDecoder } from '../../../supabase/functions/_shared/pos/barcode-decoder';

describe('Grocery Weighted Barcode Decoder', () => {
  test('Standard GS1 weight-embedded barcode (2100418012835) decodes to PLU-00418 and 1.283 KG', async () => {
    const decoded = await POSBarcodeDecoder.decode(null, 'default-tenant', '2100418012835');

    expect(decoded).not.toBeNull();
    expect(decoded?.is_weighted).toBe(true);
    expect(decoded?.plu_sku).toBe('PLU-00418');
    expect(decoded?.quantity).toBe(1.283);
    expect(decoded?.uom).toBe('KG');
  });

  test('Variable meat weight barcode (2800912007428) decodes to PLU-00912 and 0.742 KG', async () => {
    const decoded = await POSBarcodeDecoder.decode(null, 'default-tenant', '2800912007428');

    expect(decoded).not.toBeNull();
    expect(decoded?.is_weighted).toBe(true);
    expect(decoded?.plu_sku).toBe('PLU-00912');
    expect(decoded?.quantity).toBe(0.742);
    expect(decoded?.uom).toBe('KG');
  });

  test('Standard fixed EAN-13 (8712345678901) returns null for custom barcode decoding', async () => {
    const decoded = await POSBarcodeDecoder.decode(null, 'default-tenant', '8712345678901');
    expect(decoded).toBeNull();
  });
});
