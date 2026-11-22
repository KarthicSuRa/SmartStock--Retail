// /supabase/functions/_shared/reorder-engine/safety-stock-formula.ts
//
// Safety stock with both demand and lead-time variability.
//
// Previous implementation destructured `leadTimeVariabilityPct` from an input
// that declared `coefficientOfVariation`, producing NaN safety stock and NaN
// reorder points. This version uses both sources of variation explicitly and
// fails loudly on invalid inputs instead of returning a plausible NaN.

export interface SafetyStockInput {
  forecastVelocityDaily: number;
  leadTimeDays: number;
  /** Coefficient of variation of DAILY demand (σ/mean), from VelocityCalculator. */
  demandCoefficientOfVariation: number;
  /** Coefficient of variation of LEAD TIME, as a percentage (e.g. 20 = 20%). */
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
  /** Demand over lead time + review period; used for an order-up-to target. */
  coverageDemand: number;
}

export class SafetyStockFormula {
  calculate(input: SafetyStockInput): SafetyStockResult {
    const {
      forecastVelocityDaily,
      leadTimeDays,
      demandCoefficientOfVariation,
      leadTimeVariabilityPct,
      serviceLevelPct,
      reviewPeriodDays,
    } = input;

    if (!Number.isFinite(forecastVelocityDaily) || forecastVelocityDaily < 0) {
      throw new Error('forecastVelocityDaily must be a finite non-negative number');
    }
    if (!Number.isFinite(leadTimeDays) || leadTimeDays <= 0) {
      throw new Error('leadTimeDays must be a finite positive number');
    }
    if (!Number.isFinite(demandCoefficientOfVariation) || demandCoefficientOfVariation < 0) {
      throw new Error('demandCoefficientOfVariation must be a finite non-negative number');
    }
    if (!Number.isFinite(leadTimeVariabilityPct) || leadTimeVariabilityPct < 0) {
      throw new Error('leadTimeVariabilityPct must be a finite non-negative number');
    }

    const zScore = this.getZScore(serviceLevelPct);
    const leadTimeDemand = forecastVelocityDaily * leadTimeDays;
    const coverageDays = leadTimeDays + Math.max(0, reviewPeriodDays);
    const coverageDemand = forecastVelocityDaily * coverageDays;

    // σ_d = daily demand standard deviation; σ_L = lead-time standard deviation
    // in days. Combined variance over the protection window:
    //   Var = (L+R)·σ_d² + d²·σ_L²
    const sigmaDemand = forecastVelocityDaily * demandCoefficientOfVariation;
    const sigmaLeadTimeDays = leadTimeDays * (leadTimeVariabilityPct / 100);
    const variance =
      coverageDays * Math.pow(sigmaDemand, 2) +
      Math.pow(forecastVelocityDaily, 2) * Math.pow(sigmaLeadTimeDays, 2);
    const safetyStock = zScore * Math.sqrt(variance);
    const reorderPoint = leadTimeDemand + safetyStock;

    return {
      safetyStock: Math.ceil(safetyStock),
      reorderPoint: Math.ceil(reorderPoint),
      leadTimeDemand: Number(leadTimeDemand.toFixed(2)),
      coverageDemand: Number(coverageDemand.toFixed(2)),
      safetyStockFormula:
        `z=${zScore} · √(${coverageDays}·(${sigmaDemand.toFixed(3)})² + ` +
        `${forecastVelocityDaily.toFixed(3)}²·(${sigmaLeadTimeDays.toFixed(2)})²) = ${safetyStock.toFixed(2)}`,
      zScore,
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
