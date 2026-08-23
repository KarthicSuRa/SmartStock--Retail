// /tools/demo-data/generate-retailco.ts
// SmartStock LiveRetail V2 — Synthetic Enterprise Dataset Generator (Stage 20)
//
// Generates RetailCo (Demo Retailer):
// - 2 Distribution Centers (Moerdijk DC, Rotterdam Hub)
// - 8 Stores (Amsterdam, Rotterdam, Utrecht, Den Haag, Eindhoven, Groningen, Maastricht, Breda)
// - Realistic categories: Beverages, Dry Grocery, Fresh Produce, Electronics, Household
// - Pre-seeded interesting scenarios: stockout risk, low confidence counts, FEFO expiry markdown

export interface RetailCoStore {
  id: string;
  name: string;
  type: 'STORE' | 'DC';
  city: string;
}

export const RETAILCO_STORES: RetailCoStore[] = [
  { id: '1001', name: 'Rotterdam Centraal', type: 'STORE', city: 'Rotterdam' },
  { id: '1002', name: 'Amsterdam Flagship', type: 'STORE', city: 'Amsterdam' },
  { id: '1003', name: 'Utrecht Vredenburg', type: 'STORE', city: 'Utrecht' },
  { id: '1004', name: 'Den Haag Passage', type: 'STORE', city: 'Den Haag' },
  { id: '1005', name: 'Eindhoven Heuvel', type: 'STORE', city: 'Eindhoven' },
  { id: '1006', name: 'Groningen Grote Markt', type: 'STORE', city: 'Groningen' },
  { id: '1007', name: 'Maastricht Vrijthof', type: 'STORE', city: 'Maastricht' },
  { id: '1008', name: 'Breda Grote Markt', type: 'STORE', city: 'Breda' },
  { id: '7001', name: 'Moerdijk Central DC', type: 'DC', city: 'Moerdijk' },
  { id: '7002', name: 'Rotterdam West Hub', type: 'DC', city: 'Rotterdam' },
];

export const RETAILCO_MATERIALS = [
  { sku: 'MAT-00918', name: 'San Pellegrino Sparkling 750ml', category: 'Beverages', unitPrice: 2.85, uom: 'PC', baseStock: 48 },
  { sku: 'MAT-20349', name: 'Barilla Spaghetti No. 5 500g', category: 'Dry Grocery', unitPrice: 1.95, uom: 'PC', baseStock: 120 },
  { sku: 'MAT-33104', name: 'Lavazza Espresso Crema 1kg', category: 'Beverages', unitPrice: 18.50, uom: 'PC', baseStock: 36 },
  { sku: 'MAT-40192', name: 'Filippo Berio Olive Oil 1L', category: 'Dry Grocery', unitPrice: 12.99, uom: 'PC', baseStock: 40 },
  { sku: 'MAT-50211', name: 'Heineken 6-Pack Premium Cans', category: 'Beverages', unitPrice: 8.49, uom: 'CS', baseStock: 64 },
  { sku: 'MAT-61044', name: 'De Cecco Penne Rigate 500g', category: 'Dry Grocery', unitPrice: 2.45, uom: 'PC', baseStock: 80 },
  { sku: 'MAT-77120', name: 'AirPods Pro 2nd Gen', category: 'Electronics', unitPrice: 249.00, uom: 'PC', baseStock: 12 },
  { sku: 'MAT-88401', name: 'Robijn Black Velvet Detergent 1.5L', category: 'Household', unitPrice: 11.95, uom: 'PC', baseStock: 28 },
];

export function generateEventStream(storeId: string, days = 7) {
  const events = [];
  const now = Date.now();

  for (const mat of RETAILCO_MATERIALS) {
    // 1. Initial Checkpoint at beginning of window
    events.push({
      event_type: 'SAP_CHECKPOINT',
      sku: mat.sku,
      store_id: storeId,
      quantity_delta: mat.baseStock,
      business_timestamp: new Date(now - days * 86400000).toISOString(),
    });

    // 2. Random sales events throughout the days
    const totalSales = Math.floor(Math.random() * (mat.baseStock * 0.7));
    for (let s = 0; s < totalSales; s++) {
      const saleTime = new Date(now - Math.random() * days * 86400000).toISOString();
      events.push({
        event_type: 'SALE',
        sku: mat.sku,
        store_id: storeId,
        quantity_delta: -1,
        business_timestamp: saleTime,
      });
    }
  }

  return events.sort((a, b) => new Date(a.business_timestamp).getTime() - new Date(b.business_timestamp).getTime());
}
