// /src/lib/analytics/insight-engine.ts
// SmartStock Intelligence RC1 — Actionable & Deduplicated Insight Engine

export interface InsightItem {
  id: string;
  fingerprint: string;
  type: 'STOCKOUT_TREND' | 'RECURRING_DISCREPANCY' | 'NETWORK_IMBALANCE' | 'ANOMALY_DAMAGE' | 'SUPPLIER_LEAD_TIME' | 'PARETO_CONCENTRATION' | 'TRANSFER_OPPORTUNITY';
  scopeType: 'STORE' | 'REGION' | 'PRODUCT' | 'CATEGORY' | 'NETWORK';
  scopeId: string;
  title: string;
  significance: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  metricName: string;
  currentValue: string;
  baselineValue: string;
  changePct: number;
  estimatedBusinessImpactEur: number;
  explanation: string;
  recommendedAction: string;
  actionRoute: string;
  generatedAt: string;
  isOpportunity?: boolean;
}

export class InsightEngine {
  static getActiveInsights(role: string, storeId = '1001'): InsightItem[] {
    const rawInsights: InsightItem[] = [
      {
        id: 'ins-01',
        fingerprint: 'nl_west_stockout_trend_2026w34',
        type: 'STOCKOUT_TREND',
        scopeType: 'REGION',
        scopeId: 'NL_WEST',
        title: 'Stockout Hours Rising in Netherlands West',
        significance: 'CRITICAL',
        metricName: 'Stockout Hours',
        currentValue: '128h / week',
        baselineValue: '100h / week',
        changePct: 28.0,
        estimatedBusinessImpactEur: 18420,
        explanation: 'Stockout duration increased +28% over 4 consecutive weeks. 60% of stockouts are concentrated in Store 1001 and Store 1004 in Beverages.',
        recommendedAction: 'Rebalance safety stock and trigger 12-case STO transfer from Moerdijk DC.',
        actionRoute: '/actions?case_type=STOCKOUT_RISK',
        generatedAt: '12 min ago',
      },
      {
        id: 'ins-02',
        fingerprint: 'pareto_unexplained_variance_2026w34',
        type: 'PARETO_CONCENTRATION',
        scopeType: 'NETWORK',
        scopeId: 'ALL_STORES',
        title: 'Pareto Concentration: 18% of SKUs Drive 73% of Variance',
        significance: 'HIGH',
        metricName: 'Unexplained Variance Concentration',
        currentValue: '73% in 18% SKUs',
        baselineValue: '50% in 20% SKUs',
        changePct: 46.0,
        estimatedBusinessImpactEur: 24900,
        explanation: 'Concentration analysis reveals that focusing cycle-counts on just 14 high-value SKUs (AirPods Pro, Premium Spirits, Olive Oil) resolves 73% of total network discrepancy value.',
        recommendedAction: 'Deploy smart cycle-count wave focused specifically on top 14 Pareto SKUs.',
        actionRoute: '/actions?case_type=INVENTORY_UNCERTAINTY',
        generatedAt: '25 min ago',
        isOpportunity: true,
      },
      {
        id: 'ins-03',
        fingerprint: 'network_transfer_opp_2026w34',
        type: 'TRANSFER_OPPORTUNITY',
        scopeType: 'NETWORK',
        scopeId: 'ALL_STORES',
        title: 'Transfer Opportunity: €420K Shortage Resolvable from €2.84M Surplus',
        significance: 'HIGH',
        metricName: 'Internal Transfer Potential',
        currentValue: '63% Potential STO Fulfillment',
        baselineValue: '41% Actual Fulfillment',
        changePct: 53.6,
        estimatedBusinessImpactEur: 420000,
        explanation: '€2.84M of excess inventory in >30 DOS stores can directly mitigate €420K in acute store-level shortages before the next supplier replenishment cycle.',
        recommendedAction: 'Approve batch of 14 inter-store STO balancing transfers.',
        actionRoute: '/replenishment',
        generatedAt: '35 min ago',
        isOpportunity: true,
      },
      {
        id: 'ins-04',
        fingerprint: 'store_1001_damage_anomaly_2026w34',
        type: 'ANOMALY_DAMAGE',
        scopeType: 'STORE',
        scopeId: '1001',
        title: 'Unusual Damage Adjustment Rate in Store 1001',
        significance: 'HIGH',
        metricName: 'Damage Rate per 1k Units',
        currentValue: '3.7x baseline',
        baselineValue: '1.0x baseline',
        changePct: 270.0,
        estimatedBusinessImpactEur: 6420,
        explanation: 'Damaged item adjustments in Premium Electronics have tripled in Store 1001 over the last 14 days compared to regional benchmarks.',
        recommendedAction: 'Schedule a physical security and handling review for Electronics Cabinet B4.',
        actionRoute: '/actions?case_type=INVENTORY_UNCERTAINTY',
        generatedAt: '1h ago',
      },
    ];

    // Deduplicate by fingerprint
    const seen = new Set<string>();
    const deduplicated = rawInsights.filter((i) => {
      if (seen.has(i.fingerprint)) return false;
      seen.add(i.fingerprint);
      return true;
    });

    if (role === 'store_manager') {
      return deduplicated.filter((i) => i.scopeType === 'STORE' || i.scopeType === 'PRODUCT');
    }
    if (role === 'supply_chain') {
      return deduplicated.filter((i) => i.scopeType === 'NETWORK' || i.scopeType === 'REGION' || i.isOpportunity);
    }
    return deduplicated;
  }
}
