// /src/lib/analytics/metric-catalog.ts
// SmartStock Intelligence RC1 — Authoritative Semantic Metric Catalog

export interface MetricDefinition {
  id: string;
  name: string;
  category: 'inventory' | 'availability' | 'operations' | 'replenishment' | 'waste' | 'integration';
  businessDefinition: string;
  formula: string;
  grain: string;
  targetDirection: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_BAND';
  unit: string;
  version: string;
  sourceFact: string;
  owner: string;
}

export const METRIC_CATALOG: Record<string, MetricDefinition> = {
  INVENTORY_TRUTH_GAP: {
    id: 'INVENTORY_TRUTH_GAP',
    name: 'Inventory Truth Gap (Unexplained Variance)',
    category: 'inventory',
    businessDefinition:
      'The net unverified physical discrepancy between SAP financial baseline and operational digital twin, separated from known reservations and explained transit adjustments.',
    formula: '(SAP Comparable On-Hand - SmartStock Operational On-Hand) - Known Explained Adjustments',
    grain: 'Store x SKU x Daily Sync',
    targetDirection: 'LOWER_IS_BETTER',
    unit: 'EUR',
    version: '1.1',
    sourceFact: 'analytics.fact_reconciliation',
    owner: 'Head of Inventory Accounting',
  },
  VALUE_AT_RISK_UNCERTAINTY: {
    id: 'VALUE_AT_RISK_UNCERTAINTY',
    name: 'Inventory Value at Risk of Uncertainty (<70% Conf)',
    category: 'inventory',
    businessDefinition:
      'Total inventory value of SKUs where digital twin confidence has dropped below 70%, prioritizing targeted cycle count tasks before replenishment.',
    formula: 'SUM(sellable_qty * unit_cost) WHERE confidence_score < 70',
    grain: 'Store x SKU',
    targetDirection: 'LOWER_IS_BETTER',
    unit: 'EUR',
    version: '1.0',
    sourceFact: 'analytics.fact_inventory_snapshot',
    owner: 'VP Supply Chain',
  },
  INVENTORY_ACCURACY_SYMMETRIC: {
    id: 'INVENTORY_ACCURACY_SYMMETRIC',
    name: 'Symmetric Value-Weighted Inventory Accuracy',
    category: 'inventory',
    businessDefinition:
      'Degree to which expected inventory values match physical count audits using a symmetric denominator that handles zero-stock edge cases gracefully.',
    formula: '1.0 - (SUM(ABS(expected - physical) * unit_cost) / SUM(GREATEST(expected, physical) * unit_cost))',
    grain: 'Network / Region / Store',
    targetDirection: 'HIGHER_IS_BETTER',
    unit: '%',
    version: '1.2',
    sourceFact: 'analytics.fact_physical_count',
    owner: 'Head of Retail Operations',
  },
  SKU_EXACT_MATCH_ACCURACY: {
    id: 'SKU_EXACT_MATCH_ACCURACY',
    name: 'SKU Exact-Match Count Accuracy',
    category: 'inventory',
    businessDefinition:
      'Percentage of counted SKUs that showed zero physical variance during cycle count verification.',
    formula: 'COUNT(skus WHERE variance == 0) / COUNT(total_skus_counted)',
    grain: 'Store x Cycle Count Session',
    targetDirection: 'HIGHER_IS_BETTER',
    unit: '%',
    version: '1.0',
    sourceFact: 'analytics.fact_physical_count',
    owner: 'Store Operations Lead',
  },
  STOCKOUT_HOURS_INTRADAY: {
    id: 'STOCKOUT_HOURS_INTRADAY',
    name: 'Intraday Stockout Hours',
    category: 'availability',
    businessDefinition:
      'Exact duration during store trading windows where sellable on-hand was zero, calculated from interval state transitions.',
    formula: 'SUM(state_end_time - state_start_time) WHERE sellable_qty <= 0',
    grain: 'Store x SKU x State Interval',
    targetDirection: 'LOWER_IS_BETTER',
    unit: 'Hours',
    version: '1.1',
    sourceFact: 'analytics.fact_inventory_state_interval',
    owner: 'Director of Merchandising',
  },
  NETWORK_STOCK_IMBALANCE: {
    id: 'NETWORK_STOCK_IMBALANCE',
    name: 'Network Stock Imbalance',
    category: 'replenishment',
    businessDefinition:
      'Working capital trapped in stores with >30 days of supply compared against sales revenue at risk in starved stores with <1 day of supply.',
    formula: 'SUM(excess_qty * cost) [Stores >30 DOS] vs SUM(exposure_eur) [Stores <1 DOS]',
    grain: 'Network x SKU',
    targetDirection: 'LOWER_IS_BETTER',
    unit: 'EUR',
    version: '1.0',
    sourceFact: 'analytics.fact_inventory_snapshot',
    owner: 'Director of Logistics',
  },
  INTERNAL_FULFILLMENT_RATE: {
    id: 'INTERNAL_FULFILLMENT_RATE',
    name: 'Internal Transfer (STO) Fulfillment Rate',
    category: 'replenishment',
    businessDefinition:
      'Percentage of replenishment demand resolved through sister-store balancing instead of emergency vendor purchase orders.',
    formula: 'SUM(sto_units_approved) / SUM(total_replenishment_units_requested)',
    grain: 'Store / Region x Month',
    targetDirection: 'HIGHER_IS_BETTER',
    unit: '%',
    version: '1.0',
    sourceFact: 'analytics.fact_replenishment_decision',
    owner: 'Supply Chain Operations',
  },
};
