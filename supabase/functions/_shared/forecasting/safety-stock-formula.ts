// /supabase/functions/_shared/forecasting/safety-stock-formula.ts

import { calculateAdvancedSafetyStock, SafetyStockCalculationResult } from "./demand-pattern-classifier.ts";

export interface ReorderParameters {
  reorderPoint: number;
  safetyStock: number;
  runoutDays: number;
  method: string;
  demandPattern: string;
}

export function computeDynamicReorderPoint(
  dailyDemands: number[],
  leadTimeDays: number,
  currentStock: number,
  serviceLevelPct: number = 95
): ReorderParameters {
  const avgVelocity = dailyDemands.length > 0
    ? dailyDemands.reduce((a, b) => a + b, 0) / dailyDemands.length
    : 0;

  const { safetyStock, method, demandPattern }: SafetyStockCalculationResult = calculateAdvancedSafetyStock(
    dailyDemands,
    leadTimeDays,
    serviceLevelPct
  );

  const leadTimeDemand = avgVelocity * leadTimeDays;
  const reorderPoint = Math.ceil(leadTimeDemand + safetyStock);
  const runoutDays = avgVelocity > 0 ? currentStock / avgVelocity : 999;

  return {
    reorderPoint,
    safetyStock,
    runoutDays,
    method,
    demandPattern
  };
}
