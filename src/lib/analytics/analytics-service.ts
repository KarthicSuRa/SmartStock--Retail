// /src/lib/analytics/analytics-service.ts
// SmartStock Intelligence RC1 — Authoritative Analytical Query Service

export interface PilotScorecardData {
  isSimulated: boolean;
  pilotWeek: number;
  totalWeeks: number;
  inventoryAccuracy: { baseline: number; current: number; change: number };
  stockoutHours: { baseline: number; current: number; changePct: number };
  meanResolutionHours: { baseline: number; current: number; changePct: number };
  reconciliationRate: { baseline: number; current: number; change: number };
  reliabilityMetrics: {
    lostEventsCount: number;
    duplicateSapDocsCount: number;
    posFeedCompletenessPct: number;
  };
}

export interface HardenedTruthGapData {
  sapComparableOnHandEur: number;
  smartStockOperationalOnHandEur: number;
  totalPhysicalGapEur: number;
  availabilityGapEur: number; // Reservations, quarantine, damage
  explainedPhysicalGapEur: number;
  unexplainedPhysicalGapEur: number; // Signature executive metric
  unexplainedChangePct: number; // e.g. -18.2%
}

export interface InventoryUncertaintyValueData {
  totalInventoryValueEur: number;
  highConfidenceValueEur: number; // >=85%
  mediumConfidenceValueEur: number; // 70-84%
  lowConfidenceValueEur: number; // <70% (target for verification)
  targetCountSkusCount: number;
}

export interface CohortComparisonItem {
  metricName: string;
  pilotStoresValue: string;
  controlStoresValue: string;
  netDelta: string;
  isPositive: boolean;
}

export class AnalyticsService {
  static getPilotScorecard(): PilotScorecardData {
    return {
      isSimulated: true, // Explicitly tagged as simulated demo baseline
      pilotWeek: 6,
      totalWeeks: 8,
      inventoryAccuracy: { baseline: 92.8, current: 96.9, change: 4.1 },
      stockoutHours: { baseline: 482, current: 361, changePct: -25.1 },
      meanResolutionHours: { baseline: 8.2, current: 2.7, changePct: -67.1 },
      reconciliationRate: { baseline: 94.2, current: 99.1, change: 4.9 },
      reliabilityMetrics: {
        lostEventsCount: 0,
        duplicateSapDocsCount: 0,
        posFeedCompletenessPct: 99.97,
      },
    };
  }

  static getTruthGap(): HardenedTruthGapData {
    return {
      sapComparableOnHandEur: 4820000,
      smartStockOperationalOnHandEur: 4790000,
      totalPhysicalGapEur: 30000,
      availabilityGapEur: 180000, // Non-sellable reservations/holds
      explainedPhysicalGapEur: 23000, // In-transit timing, damage
      unexplainedPhysicalGapEur: 7000, // True unverified shrink/variance
      unexplainedChangePct: -18.2,
    };
  }

  static getUncertaintyValue(): InventoryUncertaintyValueData {
    return {
      totalInventoryValueEur: 8400000,
      highConfidenceValueEur: 7600000,
      mediumConfidenceValueEur: 620000,
      lowConfidenceValueEur: 180000,
      targetCountSkusCount: 14,
    };
  }

  static getCohortComparisons(): CohortComparisonItem[] {
    return [
      {
        metricName: 'Symmetric Inventory Accuracy',
        pilotStoresValue: '96.9%',
        controlStoresValue: '93.2%',
        netDelta: '+3.7pp',
        isPositive: true,
      },
      {
        metricName: 'Stockout Hours / 1,000 Tx Lines',
        pilotStoresValue: '14.2h',
        controlStoresValue: '21.8h',
        netDelta: '-34.8%',
        isPositive: true,
      },
      {
        metricName: 'Unexplained Variance / €1M Inventory',
        pilotStoresValue: '€1,460',
        controlStoresValue: '€4,210',
        netDelta: '-65.3%',
        isPositive: true,
      },
    ];
  }
}
