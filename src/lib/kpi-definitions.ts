// /src/lib/kpi-definitions.ts
// SmartStock LiveRetail V2 — Rigorous Pilot KPI Metric Definitions (RC1)

export interface KPIMetricDefinition {
  id: string;
  name: string;
  unit: string;
  formula: string;
  description: string;
  targetPilotGain: string;
}

export const PILOT_KPI_DEFINITIONS: Record<string, KPIMetricDefinition> = {
  inventory_accuracy: {
    id: 'inventory_accuracy',
    name: 'Unit-Level Inventory Accuracy',
    unit: '%',
    formula: '1 - (Σ|expected_qty - physical_qty| / Σ physical_qty)',
    description: 'Measures accuracy across all cycle counts performed during the pilot evaluation period.',
    targetPilotGain: '+18.5% improvement',
  },

  stockout_hours: {
    id: 'stockout_hours',
    name: 'Total Selling Stockout Hours',
    unit: 'hours/month',
    formula: 'Σ hours where estimated_on_hand = 0 during active store trading hours with positive demand forecast',
    description: 'Captures duration of unavailable inventory during active customer shopping windows.',
    targetPilotGain: '-42.0% reduction',
  },

  estimated_sales_exposure: {
    id: 'estimated_sales_exposure',
    name: 'Estimated Sales Exposure',
    unit: '€',
    formula: 'stockout_hours × (forecast_daily_units / trading_hours) × unit_gross_price',
    description: 'Conservative revenue potential exposed to stockouts before intervention.',
    targetPilotGain: '€4,200/store protected monthly',
  },

  mean_resolution_velocity: {
    id: 'mean_resolution_velocity',
    name: 'Exception Mean Time to Resolution (MTTR)',
    unit: 'hours',
    formula: 'AVG(case.resolved_at - case.created_at) across all resolved operational cases',
    description: 'Measures speed from anomaly detection to physical resolution and ERP sync.',
    targetPilotGain: '< 3.5 hours MTTR',
  },
};
