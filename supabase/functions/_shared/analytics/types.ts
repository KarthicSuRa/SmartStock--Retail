// /supabase/functions/_shared/analytics/types.ts
// SmartStock Intelligence RC1 — Authoritative Analytical Domain Types

export interface DimStoreSCD {
  store_key?: number;
  tenant_id: string;
  store_id: string;
  store_name: string;
  region_code: string;
  format_type: string;
  floor_area_sqm?: number;
  assigned_dc_code?: string;
  valid_from: string;
  valid_to: string;
  is_current: boolean;
  version_number: number;
}

export interface DimProductSCD {
  product_key?: number;
  tenant_id: string;
  sku: string;
  sap_matnr?: string;
  product_name: string;
  category_name: string;
  subcategory_name?: string;
  brand_name?: string;
  unit_cost: number;
  selling_price: number;
  margin_pct?: number;
  velocity_class: 'A' | 'B' | 'C';
  is_perishable: boolean;
  is_high_value: boolean;
  valid_from: string;
  valid_to: string;
  is_current: boolean;
  version_number: number;
}

export interface FactInventoryStateInterval {
  interval_id?: number;
  tenant_id: string;
  store_key: number;
  product_key: number;
  state_start_time: string;
  state_end_time?: string;
  duration_seconds?: number;
  sellable_qty: number;
  estimated_on_hand: number;
  reserved_qty: number;
  safety_stock_qty: number;
  is_stockout: boolean;
  is_below_safety: boolean;
  confidence_score: number;
  trigger_event_id?: string;
  trigger_event_type?: string;
}

export interface FactInventorySnapshot {
  time_key: number;
  tenant_id: string;
  store_key: number;
  product_key: number;
  estimated_on_hand: number;
  sellable_qty: number;
  reserved_qty: number;
  in_transit_qty: number;
  sap_recorded_qty: number;
  unit_cost: number;
  inventory_value_eur: number;
  physical_gap_value_eur: number;
  availability_gap_value_eur: number;
  unexplained_gap_value_eur: number;
  days_of_supply: number;
  confidence_score: number;
  is_stockout: boolean;
  is_reconciled: boolean;
  snapshot_timestamp: string;
}

export interface FactInventoryMovement {
  time_key: number;
  tenant_id: string;
  store_key: number;
  product_key: number;
  reason_key: number;
  event_id: string;
  event_type: string;
  quantity_delta: number;
  financial_delta_eur: number;
  source_system: string;
  business_timestamp: string;
  ingested_at: string;
}

export interface FactOperationalCase {
  time_key: number;
  tenant_id: string;
  store_key: number;
  product_key?: number;
  case_type_key: number;
  case_id: string;
  severity: string;
  detected_at: string;
  assigned_at?: string;
  resolved_at?: string;
  resolution_minutes?: number;
  is_sla_met?: boolean;
  financial_exposure_eur: number;
  initial_confidence: number;
  final_confidence?: number;
  recommended_action_type: string;
  accepted_action_type?: string;
  is_recommendation_accepted?: boolean;
  resolution_outcome?: string;
}

export interface AnalyticalInsightRecord {
  insight_id?: string;
  tenant_id: string;
  insight_type: 'STOCKOUT_TREND' | 'RECURRING_DISCREPANCY' | 'NETWORK_IMBALANCE' | 'ANOMALY_DAMAGE' | 'SUPPLIER_LEAD_TIME' | 'WASTE_TREND';
  scope_type: 'STORE' | 'REGION' | 'PRODUCT' | 'CATEGORY' | 'NETWORK';
  scope_id: string;
  title: string;
  metric_name: string;
  current_value: number;
  baseline_value: number;
  change_pct: number;
  significance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  estimated_business_impact_eur: number;
  explanation: string;
  recommended_action: string;
  action_route?: string;
  status?: 'ACTIVE' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
}

export interface AnalyticsSink {
  publishDimensions(dimName: string, rows: Record<string, unknown>[]): Promise<void>;
  publishFacts(factName: string, rows: Record<string, unknown>[]): Promise<void>;
  publishIntervals(rows: FactInventoryStateInterval[]): Promise<void>;
  publishInsights(insights: AnalyticalInsightRecord[]): Promise<void>;
}
