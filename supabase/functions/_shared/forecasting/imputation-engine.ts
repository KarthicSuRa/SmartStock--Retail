// /supabase/functions/_shared/forecasting/imputation-engine.ts

export interface DailySalesRecord {
  date: string; // ISO format: YYYY-MM-DD
  quantity: number;
  isStockout: boolean;
}

export function imputeCensoredDemand(records: DailySalesRecord[]): number {
  if (records.length === 0) return 0;

  const validRecords = records.filter(r => !r.isStockout);
  if (validRecords.length === 0) {
    return records.reduce((sum, r) => sum + r.quantity, 0) / records.length;
  }

  // Group non-stockout sales by Day of Week (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const dowSales: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

  validRecords.forEach(r => {
    const dow = new Date(r.date).getDay();
    dowSales[dow].push(r.quantity);
  });

  const dowAverages: Record<number, number> = {};
  for (let d = 0; d < 7; d++) {
    const arr = dowSales[d];
    if (arr.length > 0) {
      dowAverages[d] = arr.reduce((a, b) => a + b, 0) / arr.length;
    } else {
      const overallAvg = validRecords.reduce((a, b) => a + b.quantity, 0) / validRecords.length;
      dowAverages[d] = overallAvg;
    }
  }

  let totalImputedDemand = 0;

  records.forEach(r => {
    if (r.isStockout) {
      const dow = new Date(r.date).getDay();
      totalImputedDemand += dowAverages[dow];
    } else {
      totalImputedDemand += r.quantity;
    }
  });

  return totalImputedDemand / records.length;
}

export function applyBayesianShrinkage(
  observedUplift: number,
  observationCount: number,
  prior: number = 1.0,
  minObservationsForFullTrust: number = 30
): number {
  const shrinkage = Math.min(observationCount / minObservationsForFullTrust, 1.0);
  return prior + (observedUplift - prior) * shrinkage;
}
