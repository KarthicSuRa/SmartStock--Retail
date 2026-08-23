// /src/lib/decision/count-prioritizer.ts
// SmartStock Decision Intelligence V1 — Expected Value of Sample Information (EVSI) Count Prioritizer

import { SKUFeatureSnapshot } from './feature-service';

export interface CountPriorityResult {
  sku: string;
  storeId: string;
  countPriorityScore: number; // 0-100
  expectedValueOfCountingEur: number;
  priorityBand: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  rationale: string;
}

export class CountPrioritizer {
  static evaluateCountPriority(features: SKUFeatureSnapshot): CountPriorityResult {
    // Formula: EVSI = (Uncertainty * Inventory Value * Velocity Factor * Shortage Impact Factor) - Count Labor Cost
    const uncertaintyFactor = (100 - features.inventoryConfidence) / 100.0;
    const inventoryValue = features.sellableQty * features.unitCost;
    const velocityFactor = Math.min(features.salesVelocity24h / 5.0, 3.0);
    const shortageFactor = features.hoursToStockout < 6.0 ? 2.5 : 1.0;
    const countLaborCostEur = 3.5; // ~5 minutes of store associate time

    const rawEvsi =
      uncertaintyFactor * inventoryValue * velocityFactor * shortageFactor - countLaborCostEur;
    const evsiEur = Math.max(Number(rawEvsi.toFixed(2)), 0);

    const priorityScore = Math.min(Math.round((evsiEur / 200.0) * 100), 100);

    let priorityBand: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (priorityScore >= 80) priorityBand = 'CRITICAL';
    else if (priorityScore >= 60) priorityBand = 'HIGH';
    else if (priorityScore >= 35) priorityBand = 'MEDIUM';

    const rationale = `Confidence ${features.inventoryConfidence}% on €${inventoryValue.toFixed(
      0
    )} stock with ${features.hoursToStockout}h stockout horizon yields €${evsiEur} expected information value.`;

    return {
      sku: features.sku,
      storeId: features.storeId,
      countPriorityScore: priorityScore,
      expectedValueOfCountingEur: evsiEur,
      priorityBand,
      rationale,
    };
  }
}
