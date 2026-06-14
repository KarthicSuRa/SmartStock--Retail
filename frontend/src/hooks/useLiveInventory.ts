import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface LiveInventoryItem {
  sap_plant_code: string;
  sap_storage_loc: string;
  sku: string;
  product_name: string;
  uom: string;
  sap_baseline_qty: number;
  pos_live_deductions: number;
  current_calculated_stock: number;
  last_sap_sync_at: string;
  updated_at: string;
  sales_margin?: number;
}

export interface ReplenishmentAlert {
  sku: string;
  product_name: string;
  sap_plant_code: string;
  sap_storage_loc: string;
  uom: string;
  sap_baseline_qty: number;
  pos_live_deductions: number;
  current_calculated_stock: number;
  daily_velocity: number;
  units_sold_7d: number;
  last_sale_at: string | null;
  run_out_horizon_days: number | null;
  replenishment_status: 'CRITICAL_RISK' | 'REPLENISHMENT_NEEDED' | 'STOCK_OK';
  last_sap_sync_at: string;
  updated_at: string;
  merchandise_category?: string;
  matkl_group?: string;
  netpr_price?: number;
  minbm_moq?: number;
  vendor_id?: string;
  vendor_name?: string;
  vendor_lead_days?: number;
  open_inbound_qty?: number;
  sales_margin?: number;
  bstrf_rounding_val?: number;
  atp_stock?: number;
  is_ghost_anomaly?: boolean;
  lateral_sto_source?: string | null;
  dynamic_reorder_point?: number;

  // Premium Overhaul properties
  urgency_status: 'Replenishment Needed' | 'Replenishment Critical Risk';
  days_left: number;
  atp_trigger_qty: number;
  sparkline_data: number[];
  is_pr_rounding_active: boolean;

  // SAP IS-Retail Promotion properties
  campaign_name?: string | null;
  discount_percentage?: number | null;
  sap_opening_stock?: number;
  reserved_qty?: number;
  current_stock?: number;
  uplift_factor?: number | null;
}

const mapAlertRecords = (data: any[]): ReplenishmentAlert[] => {
  return data.map((item: any) => {
    const atpTrigger = Math.round(item.dynamic_reorder_point || (((item.sap_baseline_qty || 0) / 30.0) * (item.vendor_lead_days || 0)) + ((item.sap_baseline_qty || 0) * 0.1));
    const daysLeft = item.run_out_horizon_days !== null ? Math.max(0, Number(item.run_out_horizon_days)) : 15.0;
    
    // Generate mock sparkline data with 10 points representing declining stock levels
    const sparkline = Array.from({ length: 10 }, (_, i) => {
      const base = item.current_calculated_stock || 10;
      const noise = Math.floor(Math.sin(i) * 2);
      return Math.max(0, base + (9 - i) * 2 + noise);
    });

    return {
      ...item,
      urgency_status: item.replenishment_status === 'CRITICAL_RISK' ? 'Replenishment Critical Risk' : 'Replenishment Needed',
      days_left: daysLeft,
      atp_trigger_qty: atpTrigger,
      sparkline_data: sparkline,
      is_pr_rounding_active: true,
      sap_opening_stock: item.sap_baseline_qty,
      reserved_qty: item.pos_live_deductions,
      current_stock: item.current_calculated_stock
    };
  });
};

export function useLiveInventory() {
  const [inventory, setInventory] = useState<LiveInventoryItem[]>([]);
  const [alerts, setAlerts] = useState<ReplenishmentAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial ledger and alerts view data
  const fetchInventoryData = async () => {
    try {
      setLoading(true);
      const [ledgerRes, alertsRes] = await Promise.all([
        supabase
          .from('live_inventory_ledger')
          .select('*')
          .order('sku', { ascending: true }),
        supabase
          .from('v_replenishment_alerts')
          .select('*')
          .order('run_out_horizon_days', { ascending: true })
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      if (alertsRes.error) throw alertsRes.error;

      setInventory(ledgerRes.data || []);
      setAlerts(mapAlertRecords(alertsRes.data || []));
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch initial inventory baseline:', err);
      setError(err.message || 'Error fetching inventory data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();

    // Establish realtime WebSocket subscription to database changes on the source table
    // Re-fetching the view when the source table updates solves view replication limits
    const channel = supabase
      .channel('live-ledger-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_inventory_ledger',
        },
        async (payload) => {
          console.log('Realtime ledger update received, running background query on replenishment metrics:', payload);
          try {
            // Background SELECT query against our v_replenishment_alerts analytical view and ledger table
            const [ledgerRes, alertsRes] = await Promise.all([
              supabase
                .from('live_inventory_ledger')
                .select('*')
                .order('sku', { ascending: true }),
              supabase
                .from('v_replenishment_alerts')
                .select('*')
                .order('run_out_horizon_days', { ascending: true })
            ]);

            if (ledgerRes.error) throw ledgerRes.error;
            if (alertsRes.error) throw alertsRes.error;

            // Update React memory state parameters directly to trigger seamless real-time render updates
            setInventory(ledgerRes.data || []);
            setAlerts(mapAlertRecords(alertsRes.data || []));
          } catch (err) {
            console.error('Background real-time sync query failed:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log(`Realtime ledger channel status: ${status}`);
      });

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { inventory, alerts, loading, error, refresh: fetchInventoryData };
}
