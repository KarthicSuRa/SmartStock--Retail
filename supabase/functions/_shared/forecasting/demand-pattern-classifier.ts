// /supabase/functions/_shared/forecasting/demand-pattern-classifier.ts

export type DemandPattern = 'SMOOTH' | 'INTERMITTENT' | 'LUMPY' | 'SEASONAL';

export interface SafetyStockCalculationResult {
  safetyStock: number;
  method: string;
  demandPattern: DemandPattern;
}

function mean(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function standardDeviation(numbers: number[]): number {
  if (numbers.length <= 1) return 0;
  const avg = mean(numbers);
  const squareDiffs = numbers.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / (numbers.length - 1));
}

function getZScore(serviceLevelPct: number): number {
  if (serviceLevelPct >= 99) return 2.33;
  if (serviceLevelPct >= 98) return 2.05;
  if (serviceLevelPct >= 95) return 1.65;
  if (serviceLevelPct >= 90) return 1.28;
  return 1.0;
}

export function classifyDemandPattern(dailyDemands: number[]): DemandPattern {
  if (dailyDemands.length === 0) return 'SMOOTH';
  const nonZeroDays = dailyDemands.filter(d => d > 0).length;
  const nonZeroRatio = nonZeroDays / dailyDemands.length;
  const avg = mean(dailyDemands);
  const cv = avg > 0 ? standardDeviation(dailyDemands) / avg : 0;

  if (nonZeroRatio < 0.3) {
    return 'INTERMITTENT';
  }
  if (cv > 1.5) {
    return 'LUMPY';
  }
  return 'SMOOTH';
}

export function calculateAdvancedSafetyStock(
  dailyDemands: number[],
  leadTimeDays: number,
  serviceLevelPct: number = 95
): SafetyStockCalculationResult {
  const pattern = classifyDemandPattern(dailyDemands);
  const avgDemand = mean(dailyDemands);

  if (pattern === 'INTERMITTENT') {
    // Poisson distribution approximation for slow movers
    const lambdaLT = Math.max(0.1, avgDemand * leadTimeDays);
    const poissonSafetyStock = Math.ceil(Math.sqrt(lambdaLT) * getZScore(serviceLevelPct));
    return {
      safetyStock: Math.max(1, poissonSafetyStock),
      method: 'poisson_intermittent',
      demandPattern: pattern,
    };
  }

  if (pattern === 'LUMPY') {
    // Empirical percentile quantile approach for high CV (>1.5)
    const sorted = [...dailyDemands].sort((a, b) => a - b);
    const idx = Math.floor((serviceLevelPct / 100) * sorted.length);
    const percentileVal = sorted[Math.min(idx, sorted.length - 1)] || avgDemand;
    const safetyStock = Math.ceil(Math.max(0, (percentileVal - avgDemand) * leadTimeDays));
    return {
      safetyStock: Math.max(1, safetyStock),
      method: 'empirical_percentile',
      demandPattern: pattern,
    };
  }

  // Smooth demand: Standard Normal Hadley-Whitin formula
  const sigma = standardDeviation(dailyDemands);
  const z = getZScore(serviceLevelPct);
  const safetyStock = Math.ceil(z * sigma * Math.sqrt(Math.max(1, leadTimeDays)));

  return {
    safetyStock: Math.max(1, safetyStock),
    method: 'normal_standard',
    demandPattern: pattern,
  };
}
