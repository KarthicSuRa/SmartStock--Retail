// /src/lib/decision/feature-service.ts
// SmartStock Decision Intelligence V1 — Standardized Feature Platform & Extraction

export interface SKUFeatureSnapshot {
  tenantId: string;
  storeId: string;
  sku: string;
  sellableQty: number;
  estimatedOnHand: number;
  reservedQty: number;
  inTransitQty: number;
  inventoryConfidence: number;
  salesVelocity1h: number;
  salesVelocity24h: number;
  daysOfSupply: number;
  hoursToStockout: number;
  unitCost: number;
  sellingPrice: number;
  isHighValue: boolean;
  isPerishable: boolean;
  posFeedConfidence: number;
  sapReconciliationStatus: 'MATCHED' | 'EXPLAINED' | 'UNRESOLVED';
  extractedAt: string;
}

export class FeatureService {
  static extractSKUFeatures(storeId: string, sku: string): SKUFeatureSnapshot {
    // In production, queries analytics.feature_registry / views. Here seeded with high-fidelity operational values.
    const isAirPods = sku.includes('AP-PRO') || sku.includes('AIRPODS');
    const isOliveOil = sku.includes('EVOO') || sku.includes('OLIVE');

    const sellable = isAirPods ? 4 : isOliveOil ? 8 : 14;
    const velocity1h = isAirPods ? 1.8 : isOliveOil ? 0.6 : 0.4;
    const velocity24h = velocity1h * 12;

    return {
      tenantId: '00000000-0000-0000-0000-000000000000',
      storeId,
      sku,
      sellableQty: sellable,
      estimatedOnHand: sellable + 2,
      reservedQty: 2,
      inTransitQty: 0,
      inventoryConfidence: isAirPods ? 67 : 89,
      salesVelocity1h: velocity1h,
      salesVelocity24h: velocity24h,
      daysOfSupply: Number((sellable / Math.max(velocity24h, 0.1)).toFixed(1)),
      hoursToStockout: Number((sellable / Math.max(velocity1h, 0.05)).toFixed(1)),
      unitCost: isAirPods ? 189.0 : 8.5,
      sellingPrice: isAirPods ? 249.0 : 12.99,
      isHighValue: isAirPods,
      isPerishable: isOliveOil,
      posFeedConfidence: 99,
      sapReconciliationStatus: 'MATCHED',
      extractedAt: new Date().toISOString(),
    };
  }
}
