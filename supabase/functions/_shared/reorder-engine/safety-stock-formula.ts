// /supabase/functions/_shared/reorder-engine/safety-stock-formula.ts

export interface SafetyStockInput {
  forecastVelocityDaily: number;
  leadTimeDays: number;
  leadTimeVariabilityPct: number;
  serviceLevelPct: number;
  reviewPeriodDays: number;
}

export interface SafetyStockResult {
  safetyStock: number;
  reorderPoint: number;
  leadTimeDemand: number;
  safetyStockFormula: string;
  zScore: number;
}

export class SafetyStockFormula {
  calculate(input: SafetyStockInput): SafetyStockResult {
    const { 
      forecastVelocityDaily, 
      leadTimeDays, 
      leadTimeVariabilityPct, 
      serviceLevelPct,
      reviewPeriodDays 
    } = input;

    const zScore = this.getZScore(serviceLevelPct);
    const leadTimeDemand = forecastVelocityDaily * leadTimeDays;
    const sigmaDemand = forecastVelocityDaily * (leadTimeVariabilityPct / 100);
    const timeWindow = leadTimeDays + reviewPeriodDays;
    const safetyStock = zScore * sigmaDemand * Math.sqrt(timeWindow);
    const reorderPoint = leadTimeDemand + safetyStock;

    return {
      safetyStock: Math.ceil(safetyStock),
      reorderPoint: Math.ceil(reorderPoint),
      leadTimeDemand: parseFloat(leadTimeDemand.toFixed(2)),
      safetyStockFormula: `Z(${zScore}) × σ(${sigmaDemand.toFixed(2)}) × √(${timeWindow}) = ${safetyStock.toFixed(2)}`,
      zScore
    };
  }

  private getZScore(serviceLevelPct: number): number {
    if (serviceLevelPct >= 99.9) return 3.09;
    if (serviceLevelPct >= 99.5) return 2.58;
    if (serviceLevelPct >= 99.0) return 2.33;
    if (serviceLevelPct >= 98.0) return 2.05;
    if (serviceLevelPct >= 97.0) return 1.88;
    if (serviceLevelPct >= 95.0) return 1.65;
    if (serviceLevelPct >= 90.0) return 1.28;
    return 1.0;
  }
}
